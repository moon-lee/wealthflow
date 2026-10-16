import type { FinanceApi } from 'finance';
import { isValidIsoDate } from '../utils/finance-year.js';

export interface Trade {
  readonly id: number;
  readonly stock_id: number;
  readonly date: string;
  readonly side: 'buy' | 'sell';
  readonly quantity: number;
  readonly price: number;
  readonly brokerage: number;
  readonly source: 'manual' | 'drp' | 'import';
  readonly dividend_id: number | null;
  readonly notes: string | null;
}

export type TradeSide = Trade['side'];
export type TradeSource = Trade['source'];

export type TradeInput = {
  stock_id: number;
  date: string;
  side: TradeSide;
  quantity: number;
  price: number;
  brokerage?: number;
  source?: TradeSource;
  dividend_id?: number | null;
  notes?: string | null;
};

export type TradeFilter = {
  stockId?: number;
  from?: string;
  to?: string;
};

export class TradeValidationError extends Error {
  readonly code = -32015;
  constructor(msg: string) {
    super(msg);
    this.name = 'TradeValidationError';
  }
}

const TABLE = 'wealthflow_trades' as const;

const SIDES: readonly TradeSide[] = ['buy', 'sell'];
const SOURCES: readonly TradeSource[] = ['manual', 'drp', 'import'];

/**
 * Quantity must be strictly positive. A DRP small enough to buy nothing is
 * recorded by the source as 0 units, and re-entering that by hand would
 * create a zero-cost parcel; the importer flags those rows instead.
 */
function assertValid(input: TradeInput): void {
  if (!Number.isFinite(input.stock_id) || input.stock_id <= 0)
    throw new TradeValidationError('stock_id is required');
  if (typeof input.date !== 'string' || !isValidIsoDate(input.date))
    throw new TradeValidationError('date must be YYYY-MM-DD');
  if (!SIDES.includes(input.side))
    throw new TradeValidationError(`side must be buy or sell`);
  if (!Number.isFinite(input.quantity) || input.quantity <= 0)
    throw new TradeValidationError('quantity must be greater than 0');
  if (!Number.isFinite(input.price) || input.price <= 0)
    throw new TradeValidationError('price must be greater than 0');
  const brokerage = input.brokerage ?? 0;
  if (!Number.isFinite(brokerage) || brokerage < 0)
    throw new TradeValidationError('brokerage must be ≥ 0');
  // Spec 6.6: brokerage is acquisition cost only. Selling costs are capital
  // costs that reduce the gain separately from cost base, and capturing them is
  // a non-goal. The honest form of a non-goal is to refuse the input rather
  // than accept it, store it, and quietly ignore it.
  if (input.side === 'sell' && brokerage !== 0)
    throw new TradeValidationError(
      'A sell cannot carry brokerage — selling costs reduce the gain, not cost base. Leave it at 0.',
    );
  const source = input.source ?? 'manual';
  if (!SOURCES.includes(source))
    throw new TradeValidationError(
      `source must be one of ${SOURCES.join(', ')}`,
    );
}

export async function createTrade(
  finance: FinanceApi,
  input: TradeInput,
): Promise<Trade> {
  assertValid(input);
  return (await finance.db.table(TABLE).insert({
    stock_id: input.stock_id,
    date: input.date,
    side: input.side,
    quantity: input.quantity,
    price: input.price,
    brokerage: input.brokerage ?? 0,
    source: input.source ?? 'manual',
    dividend_id: input.dividend_id ?? null,
    notes: input.notes ?? null,
  } as Record<string, unknown>)) as unknown as Trade;
}

export async function listTrades(
  finance: FinanceApi,
  opts: TradeFilter = {},
): Promise<Trade[]> {
  const rows = (await finance.db.table(TABLE).find({})) as unknown as Trade[];
  const inRange = rows.filter((r) => {
    if (opts.stockId != null && r.stock_id !== opts.stockId) return false;
    if (opts.from != null && r.date < opts.from) return false;
    if (opts.to != null && r.date > opts.to) return false;
    return true;
  });
  // Newest first: a log is read newest-first, and a trade saved a moment ago
  // must land at the top rather than at the bottom. id breaks same-day ties
  // so the order is stable across a reload.
  return inRange.sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id,
  );
}

export async function updateTrade(
  finance: FinanceApi,
  id: number,
  patch: Partial<TradeInput>,
): Promise<void> {
  const existing = (await finance.db
    .table(TABLE)
    .findOne({ id })) as unknown as Trade | null;
  if (!existing) throw new TradeValidationError(`No trade with id ${id}`);
  const merged = {
    stock_id: patch.stock_id ?? existing.stock_id,
    date: patch.date ?? existing.date,
    side: patch.side ?? existing.side,
    quantity: patch.quantity ?? existing.quantity,
    price: patch.price ?? existing.price,
    brokerage: patch.brokerage ?? existing.brokerage,
    source: patch.source ?? existing.source,
    dividend_id: patch.dividend_id ?? existing.dividend_id,
    notes: patch.notes === undefined ? existing.notes : patch.notes,
  };
  assertValid(merged);
  await finance.db
    .table(TABLE)
    .update({ id }, merged as unknown as Record<string, unknown>);
}

export async function deleteTrade(
  finance: FinanceApi,
  id: number,
): Promise<void> {
  await finance.db.table(TABLE).delete({ id });
}

export async function countTrades(
  finance: FinanceApi,
  opts: TradeFilter = {},
): Promise<number> {
  return (await listTrades(finance, opts)).length;
}
