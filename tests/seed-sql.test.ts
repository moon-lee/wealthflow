import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildSchema, buildHoldings } from '../src/data/seed-sql.js';
import { RECONCILED_TOTALS } from '../src/data/reconciled-holdings.js';

// `node:sqlite` is a builtin, but Vite's resolver does not know it, so it is
// loaded through createRequire rather than a bare import.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
  DatabaseSync: new (path: string) => any;
};

const pkg = JSON.parse(
  readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
) as any;

/** A fresh database with the app's schema and the seed's rows. */
function seeded() {
  const db = new DatabaseSync(':memory:');
  db.exec(buildSchema(pkg.financeExtension.tables));
  // The three stocks, as the seed writes them.
  db.exec(
    `INSERT INTO wealthflow_stocks (stock_code, stock_full_name, shares, is_active, notes) VALUES
     ('VAS', 'Vanguard Australian Shares Index ETF', 165, 1, NULL),
     ('VHY', 'Vanguard Australian Shares High Yield ETF', 23, 1, NULL),
     ('FGX', 'Future Generation Global Investment Company', 1109, 1, NULL);`,
  );
  db.exec(buildHoldings());
  return db;
}

describe('the generated SQL seed', () => {
  it('runs, and writes the reconciled rows', () => {
    const db = seeded();
    const count = (t: string) =>
      (db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get() as any).c;
    expect(count('wealthflow_dividends')).toBe(39);
    expect(count('wealthflow_trades')).toBe(46);
    expect(count('wealthflow_cost_base_adjustments')).toBe(39);
    expect(count('wealthflow_prices')).toBe(3);
    db.close();
  });

  it('reconciles the units and the cost base to the holding records', () => {
    const db = seeded();
    const units = (
      db
        .prepare(
          `SELECT SUM(t.quantity) AS u FROM wealthflow_trades t WHERE t.side = 'buy'`,
        )
        .get() as any
    ).u;
    expect(units).toBe(RECONCILED_TOTALS.units);

    const cost = (
      db
        .prepare(
          `SELECT SUM(t.quantity * t.price + t.brokerage) AS c FROM wealthflow_trades t WHERE t.side = 'buy'`,
        )
        .get() as any
    ).c;
    expect(cost).toBeCloseTo(RECONCILED_TOTALS.preAdjustmentCostBase, 2);

    const income = (
      db
        .prepare(`SELECT SUM(gross) AS g FROM wealthflow_dividends`)
        .get() as any
    ).g;
    expect(income).toBeCloseTo(RECONCILED_TOTALS.income, 2);
    db.close();
  });

  it('links every DRP to the distribution on its own date', () => {
    const db = seeded();
    const orphans = (
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM wealthflow_trades t
           WHERE t.source = 'drp' AND t.dividend_id IS NULL`,
        )
        .get() as any
    ).c;
    expect(orphans).toBe(0);
    // And the dividend carries the reinvestment that funded it.
    const unlinked = (
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM wealthflow_dividends d
           WHERE d.amount_reinvested > 0
             AND NOT EXISTS (SELECT 1 FROM wealthflow_trades t
                             WHERE t.dividend_id = d.id AND t.source = 'drp')`,
        )
        .get() as any
    ).c;
    expect(unlinked).toBe(0);
    db.close();
  });

  it('records VHY 16 Jul 2026 as ONE unit at $82.706, the way the source says', () => {
    const db = seeded();
    const row = db
      .prepare(
        `SELECT t.quantity AS q, t.price AS p, t.source AS s, d.gross AS g,
                d.units_acquired AS u, d.amount_reinvested AS r
         FROM wealthflow_trades t
         JOIN wealthflow_stocks k ON k.id = t.stock_id
         JOIN wealthflow_dividends d ON d.id = t.dividend_id
         WHERE k.stock_code = 'VHY' AND t.date = '2026-07-16'`,
      )
      .get() as any;
    expect(row.q).toBe(1);
    expect(row.p).toBe(82.706);
    expect(row.s).toBe('drp');
    // The distribution that funded it was $12.44 and the reinvestment cost
    // $82.71: the two do not reconcile, and the ledger records both as they
    // are rather than inventing a number that ties.
    expect(row.g).toBe(12.44);
    expect(row.u).toBe(1);
    expect(row.r).toBe(82.71);
    db.close();
  });

  it('is idempotent — running it twice inserts nothing new', () => {
    const db = seeded();
    db.exec(buildHoldings());
    const count = (t: string) =>
      (db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get() as any).c;
    expect(count('wealthflow_dividends')).toBe(39);
    expect(count('wealthflow_trades')).toBe(46);
    expect(count('wealthflow_prices')).toBe(3);
    db.close();
  });

  it('stores every finance_year in agreement with its own date', () => {
    const db = seeded();
    const bad = (
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM wealthflow_dividends
           WHERE finance_year <> CASE WHEN CAST(substr(date, 6, 2) AS INTEGER) >= 7
                                    THEN substr(date, 1, 4) || '-' || (CAST(substr(date, 1, 4) AS INTEGER) + 1)
                                    ELSE (CAST(substr(date, 1, 4) AS INTEGER) - 1) || '-' || substr(date, 1, 4) END`,
        )
        .get() as any
    ).c;
    expect(bad).toBe(0);
    db.close();
  });
});
