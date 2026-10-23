/**
 * Generates the SQL the seed file needs, from the extension manifest and the
 * reconciled holding history.
 *
 * The SQL seed and the dev seed have to write the SAME rows, or the installed
 * app shows a different portfolio from the dev harness. Writing them by hand
 * guarantees they drift, so the SQL is generated from the one source both
 * paths already share: `reconciled-holdings.ts`.
 *
 * `scripts/generate-seed-holdings.ts` is the CLI that writes this into
 * `src/seed/wealth-seed.sql` between its markers. This module holds the
 * generation itself, so a test can run the SQL and check it reconciles
 * without touching the gitignored seed file.
 */
import { HOLDING_HISTORY, PRICE_AS_AT } from './reconciled-holdings.js';
import { computeFinanceYear } from '../utils/finance-year.js';

const SQLITE_TYPE: Record<string, string> = {
  integer: 'INTEGER',
  real: 'REAL',
  text: 'TEXT',
  date: 'TEXT',
  datetime: 'TEXT',
  boolean: 'INTEGER',
};

export interface ColumnManifest {
  name: string;
  type: string;
  nullable?: boolean;
  default?: string | number | boolean | null;
  primary?: boolean;
}

export interface TableManifest {
  name: string;
  columns: ColumnManifest[];
}

export function columnSql(c: ColumnManifest): string {
  const parts = [c.name, SQLITE_TYPE[c.type] ?? 'TEXT'];
  if (c.nullable === false) parts.push('NOT NULL');
  if (c.default !== undefined && c.default !== null) {
    const lit =
      typeof c.default === 'string' ? `'${c.default}'` : String(c.default);
    parts.push(`DEFAULT ${lit}`);
  }
  return parts.join(' ');
}

/**
 * The host's rule, copied from `table-ddl.ts`: the three system columns are
 * always added, so a manifest that declares them is not duplicated.
 */
export function createTableSql(table: TableManifest): string {
  const user = table.columns.filter(
    (c) =>
      c.primary !== true && c.name !== 'created_at' && c.name !== 'updated_at',
  );
  const columns = [
    'id INTEGER PRIMARY KEY AUTOINCREMENT',
    ...user.map(columnSql),
    "created_at TEXT NOT NULL DEFAULT (datetime('now'))",
    "updated_at TEXT NOT NULL DEFAULT (datetime('now'))",
  ];
  return `CREATE TABLE IF NOT EXISTS ${table.name} (${columns.join(', ')});`;
}

/** The whole schema, in manifest order. */
export function buildSchema(tables: TableManifest[]): string {
  return tables.map((t) => createTableSql(t)).join('\n\n');
}

function num(n: number): string {
  return String(n);
}

function sqlString(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

/** The rows the seed writes for the three holdings. */
export function buildHoldings(): string {
  const out: string[] = [];

  out.push('-- Dividends. Guarded on (stock, date, gross) like the TS seed.');
  for (const h of HOLDING_HISTORY) {
    for (const d of h.distributions) {
      const fy = computeFinanceYear(d.date, '07-01') ?? '';
      const drp = h.drps.find((x) => x.date === d.date);
      const reinvested = drp ? drp.reinvested : 0;
      const units = drp ? drp.quantity : 0;
      out.push(
        'INSERT INTO wealthflow_dividends (stock_id, date, type, gross, franking, finance_year, notes, amount_reinvested, units_acquired)',
      );
      out.push(
        `SELECT (SELECT id FROM wealthflow_stocks WHERE stock_code = ${sqlString(h.code)}), ${sqlString(d.date)}, 'trust', ${num(d.gross)}, ${num(d.franking)}, ${sqlString(fy)}, NULL, ${num(reinvested)}, ${num(units)}`,
      );
      out.push(
        `WHERE NOT EXISTS (SELECT 1 FROM wealthflow_dividends WHERE stock_id = (SELECT id FROM wealthflow_stocks WHERE stock_code = ${sqlString(h.code)}) AND date = ${sqlString(d.date)} AND gross = ${num(d.gross)});`,
      );
      out.push('');
    }
  }

  out.push('-- AMIT cost base adjustments. Fund-level and per-distribution.');
  for (const h of HOLDING_HISTORY) {
    for (const d of h.distributions) {
      out.push(
        'INSERT INTO wealthflow_cost_base_adjustments (stock_id, date, amount, reason)',
      );
      out.push(
        `SELECT (SELECT id FROM wealthflow_stocks WHERE stock_code = ${sqlString(h.code)}), ${sqlString(d.date)}, ${num(d.costBaseAdj)}, 'AMIT cost base adjustment'`,
      );
      out.push(
        `WHERE NOT EXISTS (SELECT 1 FROM wealthflow_cost_base_adjustments WHERE stock_id = (SELECT id FROM wealthflow_stocks WHERE stock_code = ${sqlString(h.code)}) AND date = ${sqlString(d.date)} AND amount = ${num(d.costBaseAdj)});`,
      );
      out.push('');
    }
  }

  out.push(
    '-- The trades: buys and reinvestments. Guarded on (stock, date, qty, source).',
  );
  for (const h of HOLDING_HISTORY) {
    const rows = [
      ...h.buys.map((b) => ({
        date: b.date,
        quantity: b.quantity,
        price: b.price,
        brokerage: b.brokerage,
        source: 'manual',
        dividendOn: null as string | null,
      })),
      ...h.drps.map((d) => ({
        date: d.date,
        quantity: d.quantity,
        price: d.price,
        brokerage: 0,
        source: 'drp',
        dividendOn: d.date,
      })),
    ];
    for (const t of rows) {
      out.push(
        'INSERT INTO wealthflow_trades (stock_id, date, side, quantity, price, brokerage, source, dividend_id, notes)',
      );
      const dividendClause =
        t.dividendOn === null
          ? 'NULL'
          : `(SELECT id FROM wealthflow_dividends WHERE stock_id = (SELECT id FROM wealthflow_stocks WHERE stock_code = ${sqlString(h.code)}) AND date = ${sqlString(t.dividendOn)} LIMIT 1)`;
      out.push(
        `SELECT (SELECT id FROM wealthflow_stocks WHERE stock_code = ${sqlString(h.code)}), ${sqlString(t.date)}, 'buy', ${num(t.quantity)}, ${num(t.price)}, ${num(t.brokerage)}, ${sqlString(t.source)}, ${dividendClause}, NULL`,
      );
      out.push(
        `WHERE NOT EXISTS (SELECT 1 FROM wealthflow_trades WHERE stock_id = (SELECT id FROM wealthflow_stocks WHERE stock_code = ${sqlString(h.code)}) AND date = ${sqlString(t.date)} AND quantity = ${num(t.quantity)} AND source = ${sqlString(t.source)});`,
      );
      out.push('');
    }
  }

  out.push('-- The prices the portfolio is valued at.');
  for (const h of HOLDING_HISTORY) {
    out.push('INSERT INTO wealthflow_prices (stock_id, price, as_at, source)');
    out.push(
      `SELECT (SELECT id FROM wealthflow_stocks WHERE stock_code = ${sqlString(h.code)}), ${num(h.price)}, ${sqlString(PRICE_AS_AT)}, 'manual'`,
    );
    out.push(
      `WHERE NOT EXISTS (SELECT 1 FROM wealthflow_prices WHERE stock_id = (SELECT id FROM wealthflow_stocks WHERE stock_code = ${sqlString(h.code)}) AND price = ${num(h.price)} AND as_at = ${sqlString(PRICE_AS_AT)});`,
    );
    out.push('');
  }

  return out.join('\n').trimEnd();
}
