// One-off: move VHY's -0.04 AMIT row from 2026-07-16 to 2026-07-17 so it sits
// on the same date as the dividend it belongs to (live's entry for that
// distribution is dated 17 July; the seed had 16 July).
//
//   node scripts\fix-vhy-amit-date.mjs "D:\Finance Flow Product\data\finance.db"
//
// Total is unchanged: the amount moves date, not value.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const APP_MODULES = 'D:/finance_flow_ai/node_modules';
const RELAUNCH_FLAG = 'WEALTHFLOW_FIX_AMIT_RELAUNCHED';

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
    console.error(`Found no Electron at ${electron}.`);
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
  console.error('Pass the database path.');
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

const db = new Database(resolve(dbPath));
db.pragma('busy_timeout = 5000');

const target = db
  .prepare(
    `SELECT a.id, a.date, a.amount, s.stock_code
       FROM wealthflow_cost_base_adjustments a
       JOIN wealthflow_stocks s ON s.id = a.stock_id
      WHERE s.stock_code = 'VHY' AND a.date = '2026-07-16' AND a.amount = -0.04`,
  )
  .all();

console.log(`database: ${dbPath}`);
console.log('matched:', target);
if (target.length !== 1) {
  console.error(
    `Expected exactly 1 row, found ${target.length}. Not touching it.`,
  );
  process.exit(1);
}

const clash = db
  .prepare(
    `SELECT a.id FROM wealthflow_cost_base_adjustments a
       JOIN wealthflow_stocks s ON s.id = a.stock_id
      WHERE s.stock_code = 'VHY' AND a.date = '2026-07-17'`,
  )
  .all();
if (clash.length > 0) {
  console.error(
    'A VHY row already exists on 2026-07-17; refusing to create a pair.',
  );
  process.exit(1);
}

const backup = `${dbPath}.pre-amitfix-${new Date()
  .toISOString()
  .replace(/[:.]/g, '-')}.bak`;
await db.backup(backup);
console.log(`backup:   ${backup}`);

const run = db.transaction(() => {
  const info = db
    .prepare(
      `UPDATE wealthflow_cost_base_adjustments
          SET date = '2026-07-17'
        WHERE id = ?`,
    )
    .run(target[0].id);
  if (info.changes !== 1) throw new Error(`updated ${info.changes} rows`);
});
run();

const checks = [
  [
    'VHY adjustments now',
    `SELECT a.date, a.amount FROM wealthflow_cost_base_adjustments a
       JOIN wealthflow_stocks s ON s.id = a.stock_id
      WHERE s.stock_code = 'VHY' ORDER BY a.date`,
  ],
  [
    'VHY fund total (expect -10.83)',
    `SELECT ROUND(SUM(a.amount), 2) AS total FROM wealthflow_cost_base_adjustments a
       JOIN wealthflow_stocks s ON s.id = a.stock_id
      WHERE s.stock_code = 'VHY'`,
  ],
  [
    'adjustments with no dividend on the same stock/date (must be no rows)',
    `SELECT s.stock_code, a.date, a.amount
       FROM wealthflow_cost_base_adjustments a
       JOIN wealthflow_stocks s ON s.id = a.stock_id
      WHERE NOT EXISTS (SELECT 1 FROM wealthflow_dividends d
                         WHERE d.stock_id = a.stock_id AND d.date = a.date)`,
  ],
  [
    'portfolio total (expect -15.26)',
    `SELECT ROUND(SUM(amount), 2) AS total FROM wealthflow_cost_base_adjustments`,
  ],
];

let failed = 0;
console.log('\naudits:');
for (const [label, sql] of checks) {
  const rows = db.prepare(sql).all();
  const isConsistency = /must be no rows/.test(label);
  if (isConsistency && rows.length > 0) {
    failed += 1;
    console.log(`  FAIL  ${label}`);
    console.log(rows.map((r) => '        ' + JSON.stringify(r)).join('\n'));
  } else {
    console.log(`  PASS  ${label}`);
    if (!isConsistency)
      console.log(rows.map((r) => '        ' + JSON.stringify(r)).join('\n'));
  }
}
db.close();

if (failed > 0) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log('\nDone. Reopen the Wealth Flow panel to see it.');
