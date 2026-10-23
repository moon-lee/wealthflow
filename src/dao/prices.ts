import type { FinanceApi } from 'finance';
import { isValidIsoDate } from '../utils/finance-year.js';
import { AdjustmentValidationError } from './cost-base-adjustments.js';

/**
 * A price history, not a current-price column.
 *
 * The app runs `CREATE TABLE IF NOT EXISTS` and never migrates, so a new
 * column on `wealthflow_stocks` would never appear on an installed database.
 * A new table is created automatically on install, and it is the better shape
 * anyway: prices have a history, so "what was this worth on date X" is
 * answerable, and the CURRENT price is a derived value — the latest row —
 * rather than a stored one.
 */
export interface PriceRow {
  readonly id: number;
  readonly stock_id: number;
  readonly price: number;
  readonly as_at: string;
  readonly source: string;
}

export interface CurrentPrice {
  readonly price: number;
  readonly asAt: string;
  readonly source: string;
}

const TABLE = 'wealthflow_prices' as const;

function assertValid(input: {
  stock_id: number;
  price: number;
  as_at: string;
}): void {
  if (!Number.isFinite(input.stock_id) || input.stock_id <= 0)
    throw new AdjustmentValidationError('stock_id is required');
  // A price of zero is not a price, and a price without a date cannot be
  // "as of" anything.
  if (!Number.isFinite(input.price) || input.price <= 0)
    throw new AdjustmentValidationError('price must be greater than 0');
  if (!isValidIsoDate(input.as_at))
    throw new AdjustmentValidationError('as_at must be YYYY-MM-DD');
}

export async function insertPrice(
  finance: FinanceApi,
  input: {
    stock_id: number;
    price: number;
    as_at: string;
    source?: string;
  },
): Promise<PriceRow> {
  assertValid(input);
  return (await finance.db.table(TABLE).insert({
    stock_id: input.stock_id,
    price: input.price,
    as_at: input.as_at,
    source: input.source ?? 'manual',
  } as Record<string, unknown>)) as unknown as PriceRow;
}

export async function listPrices(
  finance: FinanceApi,
  stockId?: number,
): Promise<PriceRow[]> {
  const rows = (await finance.db
    .table(TABLE)
    .find({})) as unknown as PriceRow[];
  const filtered =
    stockId == null ? rows : rows.filter((r) => r.stock_id === stockId);
  // Every date is YYYY-MM-DD, so lexicographic order is chronological.
  return filtered.sort((a, b) =>
    a.as_at < b.as_at ? -1 : a.as_at > b.as_at ? 1 : a.id - b.id,
  );
}

/**
 * The most recent price per stock. A same-date tie is broken on the greater
 * id, so a re-entry on the same day wins over the row it replaced.
 */
export async function latestPrices(
  finance: FinanceApi,
): Promise<Map<number, CurrentPrice>> {
  const rows = await listPrices(finance);
  const best = new Map<number, PriceRow>();
  for (const r of rows) {
    const held = best.get(r.stock_id);
    if (
      !held ||
      r.as_at > held.as_at ||
      (r.as_at === held.as_at && r.id > held.id)
    ) {
      best.set(r.stock_id, r);
    }
  }
  const out = new Map<number, CurrentPrice>();
  for (const [stockId, r] of best)
    out.set(stockId, {
      price: Number(r.price),
      asAt: r.as_at,
      source: r.source,
    });
  return out;
}

export async function latestPriceFor(
  finance: FinanceApi,
  stockId: number,
): Promise<CurrentPrice | null> {
  const map = await latestPrices(finance);
  return map.get(stockId) ?? null;
}
