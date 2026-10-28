// One-off migration (2026-10-29): move the seeded *trade history* into the live
// finance.db without disturbing what live already holds.
//
//   node scripts\migrate-seed-holdings.mjs "D:\Finance Flow Product\data\finance.db"
//
// Why not just run wealth-seed.sql:
//   - the live database already has the two FY2026-2027 distributions the user
//     entered by hand (VAS 2026-07-16 97.90, VHY 2026-07-17 12.04), and those are
//     authoritative. The seed's versions (100.36 / 12.44) would double-count them.
//   - the seed does not write parcels, and the app only derives them when a trade
//     is written through the UI. A raw import would leave Trades full and
//     Investment/Parcels empty.
//
// What this does, in one transaction:
//   1. applies the seed SQL minus the two conflicting dividend rows and the
//      backdated price rows (live's 29 Oct prices are fresher);
//   2. links the VHY DRP trade to the live 17 Jul dividend (one day apart);
//   3. fills the DRP fields on those two live dividends from the trade history,
//      leaving gross/franking exactly as live has them;
//   4. derives wealthflow_parcels from the buy trades and recalculates shares.
//
// Idempotent: every insert is guarded, and the fix-ups only touch rows that are
// still in their pre-migration state.
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const SQL_PATH = join(root, 'src', 'seed', 'wealth-seed.sql');
const AUDIT_MARKER = '-- @@AUDITS@@';

const APP_MODULES = 'D:/finance_flow_ai/node_modules';
const RELAUNCH_FLAG = 'WEALTHFLOW_MIGRATE_RELAUNCHED';

function relaunchUnderElectron(loadError) {
  if (process.env[RELAUNCH_FLAG] === '1') {
    console.error(
      "Could not load better-sqlite3, even under Electron's node.\n" +
        `Original error: ${loadError.message}`,
    );
    process.exit(1);
  }
  const electron = `${APP_MODULES}/electron/dist/electron.exe`;
  if (!existsSync(electron)) {
    console.error(
      `Found no Electron at ${electron}, so this cannot relaunch itself.`,
    );
    process.exit(1);
  }
  const res = spawnSync(electron, process.argv.slice(1), {
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', [RELAUNCH_FLAG]: '1' },
  });
  process.exit(res.status ?? 1);
}

const dbPath = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!dbPath) {
  console.error(
    'Pass the database path, e.g.\n' +
      '  node scripts\\migrate-seed-holdings.mjs "D:\\Finance Flow Product\\data\\finance.db"',
  );
  process.exit(1);
}

let Database;
try {
  const mod = require(`${APP_MODULES}/better-sqlite3`);
  const Candidate = mod?.default ?? mod;
  if (typeof Candidate !== 'function') throw new Error('not a constructor');
  new Candidate(':memory:').close();
  Database = Candidate;
} catch (e) {
  relaunchUnderElectron(e);
}

if (!existsSync(SQL_PATH)) throw new Error(`missing ${SQL_PATH}`);

// --- the seed, minus what live already owns --------------------------------
const sql = readFileSync(SQL_PATH, 'utf8');
const cut = sql.indexOf(AUDIT_MARKER);
if (cut === -1) throw new Error(`${SQL_PATH} is missing ${AUDIT_MARKER}`);

const applyRegion = sql
  .slice(0, cut)
  .replace(/^\s*BEGIN TRANSACTION;\s*$/gim, '')
  .replace(/^\s*COMMIT;\s*$/gim, '');

const statements = applyRegion
  .split(/;\s*(?:\r?\n|$)/)
  .map((s) => s.trim())
  .filter(Boolean);

const isConflictingDividend = (s) =>
  s.includes('INSERT INTO wealthflow_dividends') &&
  s.includes("'2026-07-16'") &&
  (s.includes('100.36') || s.includes('12.44'));
const isBackdatedPrice = (s) => s.includes('INSERT INTO wealthflow_prices');

const kept = statements.filter(
  (s) => !isConflictingDividend(s) && !isBackdatedPrice(s),
);
const droppedDividends = statements.filter(isConflictingDividend).length;
const droppedPrices = statements.filter(isBackdatedPrice).length;
if (droppedDividends !== 2) {
  throw new Error(
    `expected to skip 2 conflicting dividends, matched ${droppedDividends}. ` +
      'The seed file changed — re-check before migrating.',
  );
}
if (droppedPrices !== 3) {
  throw new Error(
    `expected to skip 3 backdated price rows, matched ${droppedPrices}.`,
  );
}

const db = new Database(resolve(dbPath));
db.pragma('busy_timeout = 5000');

const hasTable = (name) =>
  db
    .prepare(
      "SELECT COUNT(*) c FROM sqlite_master WHERE type='table' AND name=?",
    )
    .get(name).c > 0;
const count = (t) =>
  hasTable(t) ? db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c : 0;

const before = {
  trades: count('wealthflow_trades'),
  dividends: count('wealthflow_dividends'),
  parcels: count('wealthflow_parcels'),
  adjustments: count('wealthflow_cost_base_adjustments'),
};

console.log(`database: ${dbPath}`);
console.log('before:', before);

const backup = `${dbPath}.preseed-${new Date()
  .toISOString()
  .replace(/[:.]/g, '-')}.bak`;
await db.backup(backup);
console.log(`backup:   ${backup}`);

const apply = db.transaction(() => {
  db.exec(kept.join(';\n'));

  // The VHY DRP landed on 16 Jul; live recorded the distribution on 17 Jul.
  // Link by stock and the same or next day, so the pair is not orphaned.
  db.exec(`
    UPDATE wealthflow_trades
       SET dividend_id = (
             SELECT d.id FROM wealthflow_dividends d
              WHERE d.stock_id = wealthflow_trades.stock_id
                AND d.date IN (wealthflow_trades.date, date(wealthflow_trades.date, '+1 day'))
              ORDER BY d.date
              LIMIT 1)
     WHERE source = 'drp' AND dividend_id IS NULL;
  `);

  // Complete the two live dividends with their DRP half. Gross and franking are
  // left exactly as the user entered them.
  const fillDrp = db.prepare(`
    UPDATE wealthflow_dividends
       SET units_acquired = ?, amount_reinvested = ?, updated_at = datetime('now')
     WHERE id = (
             SELECT d.id FROM wealthflow_dividends d
              JOIN wealthflow_stocks s ON s.id = d.stock_id
              WHERE s.stock_code = ? AND d.date = ?
              ORDER BY d.id
              LIMIT 1)
       AND units_acquired = 0 AND amount_reinvested = 0
  `);
  fillDrp.run(1, 108.8, 'VAS', '2026-07-16');
  fillDrp.run(1, 82.71, 'VHY', '2026-07-17');

  // The app's rebuild chain, in SQL: parcels from buy trades, shares from
  // parcels minus disposals. There are no disposals in this history.
  db.exec(`
    INSERT INTO wealthflow_parcels (stock_id, origin_trade_id, acquired_date, quantity, price, brokerage)
    SELECT t.stock_id, t.id, t.date, t.quantity, t.price, t.brokerage
      FROM wealthflow_trades t
     WHERE t.side = 'buy'
       AND NOT EXISTS (SELECT 1 FROM wealthflow_parcels p WHERE p.origin_trade_id = t.id);

    UPDATE wealthflow_stocks
       SET shares = (SELECT IFNULL(SUM(p.quantity), 0) FROM wealthflow_parcels p WHERE p.stock_id = wealthflow_stocks.id)
                  - (SELECT IFNULL(SUM(d.quantity), 0) FROM wealthflow_disposals d WHERE d.stock_id = wealthflow_stocks.id),
           updated_at = datetime('now')
     WHERE id IN (SELECT DISTINCT stock_id FROM wealthflow_trades);
  `);
});
apply();

const after = {
  trades: count('wealthflow_trades'),
  dividends: count('wealthflow_dividends'),
  parcels: count('wealthflow_parcels'),
  adjustments: count('wealthflow_cost_base_adjustments'),
};
console.log('after: ', after);

console.log('\naudits:');
const checks = [
  [
    'units per stock (expect VAS 165, VHY 23, FGX 1109)',
    `SELECT s.stock_code, ROUND(SUM(p.quantity), 4) AS units
       FROM wealthflow_parcels p JOIN wealthflow_stocks s ON s.id = p.stock_id
      GROUP BY s.stock_code ORDER BY s.stock_code`,
  ],
  [
    'stored shares match parcels (must be no rows)',
    `SELECT s.stock_code, s.shares, ROUND(SUM(p.quantity), 4) AS units
       FROM wealthflow_stocks s LEFT JOIN wealthflow_parcels p ON p.stock_id = s.id
      GROUP BY s.id HAVING ABS(s.shares - IFNULL(SUM(p.quantity), 0)) > 0.0001`,
  ],
  [
    'DRP trades without a dividend (must be no rows)',
    `SELECT id, stock_id, date FROM wealthflow_trades WHERE source = 'drp' AND dividend_id IS NULL`,
  ],
  [
    'duplicate dividends on one stock/date (must be no rows)',
    `SELECT stock_id, date, COUNT(*) n FROM wealthflow_dividends GROUP BY stock_id, date HAVING n > 1`,
  ],
  [
    'live dividends kept (VAS 97.90 / VHY 12.04)',
    `SELECT s.stock_code, d.date, d.gross, d.franking, d.units_acquired, d.amount_reinvested
       FROM wealthflow_dividends d JOIN wealthflow_stocks s ON s.id = d.stock_id
      WHERE d.finance_year = '2026-2027' ORDER BY s.stock_code, d.date`,
  ],
  [
    'FY2026-2027 dividends + interest',
    `SELECT
       ROUND((SELECT IFNULL(SUM(gross), 0) FROM wealthflow_dividends WHERE finance_year = '2026-2027')
           + (SELECT IFNULL(SUM(amount), 0) FROM wealthflow_interest_entries WHERE finance_year = '2026-2027'), 2) AS taxable_gross,
       (SELECT ROUND(IFNULL(SUM(franking), 0), 2) FROM wealthflow_dividends WHERE finance_year = '2026-2027') AS franking`,
  ],
];
let failed = 0;
for (const [label, stmt] of checks) {
  const rows = db.prepare(stmt).all();
  const isConsistency = /must be no rows/.test(label);
  if (isConsistency && rows.length > 0) {
    failed += 1;
    console.log(`  FAIL  ${label}`);
    console.log(JSON.stringify(rows, null, 2));
  } else {
    console.log(`  PASS  ${label}`);
    if (!isConsistency)
      console.log(rows.map((r) => '        ' + JSON.stringify(r)).join('\n'));
  }
}
db.close();

if (failed > 0) {
  console.error(`\n${failed} consistency check(s) failed.`);
  process.exit(1);
}
console.log('\nDone. Restart the app (or reopen the Wealth Flow panel).');
