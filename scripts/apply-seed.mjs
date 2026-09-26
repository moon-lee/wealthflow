// Apply src/seed/wealth-seed.sql to the app's finance.db.
//
// PERSONAL-DATA ADJACENT: this script contains no data itself, it just runs the
// gitignored SQL next to it, so it is safe to commit.
//
//   node scripts\apply-seed.mjs
//
// better-sqlite3 in the app's node_modules is compiled against Electron's ABI,
// so a system node cannot load it. Rather than make you remember
// ELECTRON_RUN_AS_NODE, this relaunches itself under Electron and carries on,
// so the command above works as-is.
//
// Close the app first: it holds the database while running.
//
// Override the target with:  node scripts\apply-seed.mjs <path-to.db> --no-backup
import { readFileSync, existsSync, copyFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { splitAuditStatements, isConsistencyCheck } from './sql-audit.mjs';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const SQL_PATH = join(root, 'src', 'seed', 'wealth-seed.sql');
const AUDIT_MARKER = '-- @@AUDITS@@';

const APP_MODULES = 'D:/finance_flow_ai/node_modules';
const RELAUNCH_FLAG = 'WEALTHFLOW_SEED_RELAUNCHED';

/** Re-run this script under Electron's node, where better-sqlite3 loads. */
function relaunchUnderElectron(loadError) {
  if (process.env[RELAUNCH_FLAG] === '1') {
    console.error(
      "Could not load better-sqlite3, even under Electron's node.\n" +
        "Reinstall the app's dependencies, or open the database in a SQLite\n" +
        'client and run src/seed/wealth-seed.sql there instead.\n' +
        `Original error: ${loadError.message}`,
    );
    process.exit(1);
  }
  const electron = `${APP_MODULES}/electron/dist/electron.exe`;
  if (!existsSync(electron)) {
    console.error(
      `Found no Electron at ${electron}, so this cannot relaunch itself.\n` +
        'Run the SQL in a SQLite client instead:\n' +
        `  ${SQL_PATH}\n` +
        `Original error: ${loadError.message}`,
    );
    process.exit(1);
  }
  const res = spawnSync(electron, process.argv.slice(1), {
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', [RELAUNCH_FLAG]: '1' },
  });
  process.exit(res.status ?? 1);
}

/** The app's userData dir, i.e. %APPDATA%\<product>\finance.db. */
function findDatabase(explicit) {
  if (explicit) return resolve(explicit);
  const appData = process.env.APPDATA;
  if (!appData)
    throw new Error('APPDATA is not set; pass the .db path as an argument');
  const candidates = readdirSync(appData)
    .filter((d) => d.toLowerCase().startsWith('finance flow'))
    .map((d) => join(appData, d, 'finance.db'))
    .filter((p) => existsSync(p));
  if (candidates.length === 0) {
    throw new Error(
      `No finance.db under ${appData}\\Finance Flow*. Pass the path explicitly.`,
    );
  }
  return candidates[0];
}

const dbPath = findDatabase(process.argv[2]);
const skipBackup = process.argv.includes('--no-backup');

if (!existsSync(SQL_PATH)) throw new Error(`missing ${SQL_PATH}`);

let Database;
try {
  // better-sqlite3 is CommonJS with `module.exports = Database`, so there is
  // usually no `.default`; accept either shape. The native binding loads lazily
  // inside the constructor, so an in-memory open is what actually proves the
  // ABI matches -- requiring alone would pass and then fail later.
  const mod = require(`${APP_MODULES}/better-sqlite3`);
  const Candidate = mod?.default ?? mod;
  if (typeof Candidate !== 'function') throw new Error('not a constructor');
  new Candidate(':memory:').close();
  Database = Candidate;
} catch (e) {
  relaunchUnderElectron(e);
}

const sql = readFileSync(SQL_PATH, 'utf8');
const cut = sql.indexOf(AUDIT_MARKER);
if (cut === -1)
  throw new Error(`${SQL_PATH} is missing the ${AUDIT_MARKER} marker`);
const applySql = sql.slice(0, cut);
const auditSql = sql.slice(cut);

console.log(`database: ${dbPath}`);
console.log(`script:   ${SQL_PATH}`);

const db = new Database(dbPath);

// The app holds the file while it runs; a write would land mid-session.
try {
  db.exec('BEGIN IMMEDIATE; ROLLBACK;');
} catch (e) {
  console.error(
    `\nCannot get a write lock on the database:\n  ${e.message}\n\n` +
      'Close every Finance Flow window (all its processes) and run this again.',
  );
  process.exit(1);
}

if (!skipBackup) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = `${dbPath}.preseed-${stamp}.bak`;
  copyFileSync(dbPath, backup);
  console.log(`backup:   ${backup}`);
}

const before = {
  banks: db.prepare('SELECT COUNT(*) c FROM wealthflow_banks').get().c,
  stocks: db.prepare('SELECT COUNT(*) c FROM wealthflow_stocks').get().c,
  interest: db
    .prepare('SELECT COUNT(*) c FROM wealthflow_interest_entries')
    .get().c,
  dividends: db.prepare('SELECT COUNT(*) c FROM wealthflow_dividends').get().c,
};

db.exec(applySql);

const after = {
  banks: db.prepare('SELECT COUNT(*) c FROM wealthflow_banks').get().c,
  stocks: db.prepare('SELECT COUNT(*) c FROM wealthflow_stocks').get().c,
  interest: db
    .prepare('SELECT COUNT(*) c FROM wealthflow_interest_entries')
    .get().c,
  dividends: db.prepare('SELECT COUNT(*) c FROM wealthflow_dividends').get().c,
};

console.log('\ninserted:');
for (const t of ['banks', 'stocks', 'interest', 'dividends']) {
  const added = after[t] - before[t];
  console.log(
    `  ${t.padEnd(10)} ${String(after[t]).padStart(3)} rows  (${added >= 0 ? '+' : ''}${added})`,
  );
}
if (Object.keys(after).some((t) => after[t] === before[t])) {
  console.log('  (a 0 delta on a re-run is correct: the seed is idempotent)');
}

console.log('\naudits:');
let failed = 0;
for (const { label, sql: stmt } of splitAuditStatements(auditSql)) {
  const name = label.slice(0, 70) || stmt.slice(0, 50).replace(/\s+/g, ' ');
  let rows;
  try {
    rows = db.prepare(stmt).all();
  } catch (e) {
    failed += 1;
    console.log(`  FAIL  ${name} -> ${e.message}`);
    continue;
  }
  if (isConsistencyCheck(stmt)) {
    if (rows.length === 0) console.log(`  PASS  ${name}`);
    else {
      failed += 1;
      console.log(`  FAIL  ${name} -> ${rows.length} bad row(s)`);
      console.log(JSON.stringify(rows, null, 2));
    }
  } else {
    console.log(`  ${name}`);
    console.log(
      rows.map((r) => '        ' + JSON.stringify(r)).join('\n') ||
        '        (no rows)',
    );
  }
}

db.close();
if (failed > 0) {
  console.error(`\n${failed} consistency check(s) failed.`);
  process.exit(1);
}
console.log('\nDone. Start the app and open Wealth Flow.');
