// Guards src/seed/wealth-seed.sql, the script that imports personal data
// straight into the app's SQLite file. The SQL is gitignored, so nothing else in
// the suite exercises it: a typo here would only surface as a failed import into
// a real database.
//
// The SQL carries real account numbers, so this test asserts on counts and
// totals and never prints a row's contents.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  splitAuditStatements,
  isConsistencyCheck,
} from '../scripts/sql-audit.mjs';

const SQL_PATH = join(process.cwd(), 'src', 'seed', 'wealth-seed.sql');
const TMP = join(process.cwd(), 'node_modules', '.cache', 'seed-sql-test.db');
const MARKER = '-- @@AUDITS@@';

// The app's DDL generator, mirrored from
// D:\finance_flow_ai\src\main\services\table-ddl.ts. If the app changes, this
// test fails and the SQL's CREATE TABLE needs revisiting.
const SQLITE_TYPE: Record<string, string> = {
  integer: 'INTEGER',
  real: 'REAL',
  text: 'TEXT',
  date: 'TEXT',
  datetime: 'TEXT',
  boolean: 'INTEGER',
};

let sql = '';
let applySql = '';
let auditSql = '';
let DatabaseSync: any = null;

beforeAll(async () => {
  sql = readFileSync(SQL_PATH, 'utf8');
  const cut = sql.indexOf(MARKER);
  expect(cut, `${SQL_PATH} must contain the ${MARKER} marker`).toBeGreaterThan(
    -1,
  );
  applySql = sql.slice(0, cut);
  auditSql = sql.slice(cut);
  try {
    ({ DatabaseSync } = await import('node:sqlite'));
  } catch {
    DatabaseSync = null; // Node without node:sqlite: structural tests only
  }
});

afterAll(() => {
  rmSync(TMP, { force: true });
});

describe('seed SQL structure', () => {
  it('parses the audit block into statements SQLite can prepare', () => {
    const statements = splitAuditStatements(auditSql);
    // 1 counts, 2 per-bank interest, 3 taxable totals, 4 FY consistency, 5 orphans
    expect(statements).toHaveLength(5);
    for (const s of statements) {
      expect(s.sql, `statement must not be empty: ${s.label}`).not.toBe('');
      // A leftover comment line would make prepare() throw `near "<word>"`.
      expect(s.sql.split('\n')[0].trim()).not.toMatch(/^--/);
    }
  });

  it('keeps each audit label', () => {
    const labels = splitAuditStatements(auditSql).map((s) => s.label);
    expect(labels.some((l) => l.includes('Row counts'))).toBe(true);
    expect(labels.some((l) => l.includes('FY consistency'))).toBe(true);
    expect(labels.some((l) => l.includes('Orphan'))).toBe(true);
  });

  it('marks exactly the two zero-row checks as consistency checks', () => {
    const statements = splitAuditStatements(auditSql);
    expect(statements.filter((s) => isConsistencyCheck(s.sql))).toHaveLength(2);
  });

  it('wraps the writes in a transaction and never drops a table', () => {
    expect(applySql).toContain('BEGIN TRANSACTION');
    expect(applySql).toContain('COMMIT');
    for (const t of [
      'wealthflow_banks',
      'wealthflow_stocks',
      'wealthflow_interest_entries',
      'wealthflow_dividends',
    ]) {
      expect(applySql).toContain(`CREATE TABLE IF NOT EXISTS ${t} `);
    }
  });

  it('guards every insert so a re-run is a no-op', () => {
    const inserts = applySql
      .split(';')
      .filter((s) => s.includes('INSERT INTO'));
    expect(inserts).toHaveLength(17); // 4 banks + 3 stocks + 8 interest + 2 dividends
    for (const i of inserts) expect(i).toMatch(/WHERE NOT EXISTS/);
  });

  it('resolves parents by code, never by a hardcoded id', () => {
    const inserts = applySql
      .split(';')
      .filter((s) =>
        /INSERT INTO wealthflow_(interest_entries|dividends)/.test(s),
      );
    for (const i of inserts) {
      expect(i).toMatch(/SELECT \(SELECT id FROM wealthflow_(banks|stocks)/);
    }
  });
});

describe.runIf(process.versions.node.split('.')[0] >= 22)(
  'seed SQL against a real SQLite engine',
  () => {
    let db: any = null;
    const open = () => {
      rmSync(TMP, { force: true });
      db = new DatabaseSync(TMP);
      db.exec(applySql);
    };
    afterAll(() => {
      db?.close();
    });

    it('creates tables whose shape matches the app generator', () => {
      if (!DatabaseSync) return;
      open();
      const pkg = JSON.parse(
        readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
      );
      for (const t of pkg.financeExtension.tables) {
        const expected = `CREATE TABLE ${t.name} (${[
          'id INTEGER PRIMARY KEY AUTOINCREMENT',
          ...t.columns.map((c: any) => {
            const parts = [c.name, SQLITE_TYPE[c.type]];
            if (c.nullable === false) parts.push('NOT NULL');
            if (c.default !== undefined && c.default !== null) {
              parts.push(
                `DEFAULT ${typeof c.default === 'string' ? `'${c.default}'` : String(c.default)}`,
              );
            }
            return parts.join(' ');
          }),
          "created_at TEXT NOT NULL DEFAULT (datetime('now'))",
          "updated_at TEXT NOT NULL DEFAULT (datetime('now'))",
        ].join(', ')})`;
        // sqlite_master stores the normalised DDL (IF NOT EXISTS stripped).
        const row = db
          .prepare(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name=?",
          )
          .get(t.name);
        expect(row?.sql, `${t.name} DDL`).toBe(expected);
      }
    });

    it('inserts the expected rows', () => {
      if (!DatabaseSync) return;
      open();
      const counts = {
        banks: 4,
        stocks: 3,
        interest: 8,
        dividends: 2,
      };
      expect(
        db.prepare('SELECT COUNT(*) c FROM wealthflow_banks').get().c,
      ).toBe(counts.banks);
      expect(
        db.prepare('SELECT COUNT(*) c FROM wealthflow_stocks').get().c,
      ).toBe(counts.stocks);
      expect(
        db.prepare('SELECT COUNT(*) c FROM wealthflow_interest_entries').get()
          .c,
      ).toBe(counts.interest);
      expect(
        db.prepare('SELECT COUNT(*) c FROM wealthflow_dividends').get().c,
      ).toBe(counts.dividends);
    });

    it('reproduces the financial year the dev seed shows', () => {
      if (!DatabaseSync) return;
      open();
      const interest = db
        .prepare(
          "SELECT ROUND(SUM(amount),2) t FROM wealthflow_interest_entries WHERE finance_year='2026-2027'",
        )
        .get().t;
      const div = db
        .prepare(
          "SELECT ROUND(SUM(gross),2) g, ROUND(SUM(franking),2) f FROM wealthflow_dividends WHERE finance_year='2026-2027'",
        )
        .get();
      expect(interest).toBe(5.94);
      expect(div.g).toBe(109.94);
      expect(div.f).toBe(24.83);
      expect(Math.round((interest + div.g) * 100) / 100).toBe(115.88);
    });

    it('stores is_active as 1, which is what the boolean column and DAO filter need', () => {
      if (!DatabaseSync) return;
      open();
      expect(
        db
          .prepare(
            'SELECT COUNT(*) c FROM wealthflow_banks WHERE is_active = 1',
          )
          .get().c,
      ).toBe(4);
    });

    it('is idempotent', () => {
      if (!DatabaseSync) return;
      open();
      db.exec(applySql);
      expect(
        db.prepare('SELECT COUNT(*) c FROM wealthflow_interest_entries').get()
          .c,
      ).toBe(8);
      expect(
        db.prepare('SELECT COUNT(*) c FROM wealthflow_dividends').get().c,
      ).toBe(2);
    });

    it('passes its own consistency and orphan checks', () => {
      if (!DatabaseSync) return;
      open();
      for (const s of splitAuditStatements(auditSql)) {
        if (!isConsistencyCheck(s.sql)) continue;
        expect(db.prepare(s.sql).all(), s.label).toEqual([]);
      }
    });
  },
);
