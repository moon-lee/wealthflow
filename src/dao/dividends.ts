import type { FinanceApi } from 'finance';
import { computeFinanceYear, isValidIsoDate } from '../utils/finance-year.js';

export const DIVIDEND_TYPES = ['non_trust', 'trust', 'foreign'] as const;
export type DividendType = (typeof DIVIDEND_TYPES)[number];
export const DIVIDEND_LABELS: Record<DividendType, string> = {
  non_trust: 'Non Trust',
  trust: 'Trust (ETF)',
  foreign: 'Foreign',
};

export interface DividendEntry {
  readonly id: number;
  readonly stock_id: number;
  readonly date: string;
  readonly type: DividendType;
  readonly gross: number;
  readonly franking: number;
  readonly finance_year: string;
  readonly notes: string | null;
  /** DRP: the cash reinvested on this distribution. 0 when it was not a
   *  reinvestment. */
  readonly amount_reinvested: number;
  /** DRP: the units that cash bought. 0 when it was not a reinvestment. */
  readonly units_acquired: number;
}

export type DividendInput = {
  stock_id: number;
  date: string;
  type: string;
  gross: number;
  franking?: number;
  finance_year?: string;
  notes?: string | null;
  /** DRP: the cash reinvested on this distribution. 0 when it was not a
   *  reinvestment. Captured as its own field — never derived from the
   *  dividend, which does not reconcile with the reinvestment. */
  amount_reinvested?: number;
  /** DRP: the units that cash bought. 0 when it was not a reinvestment. */
  units_acquired?: number;
};

export class DividendValidationError extends Error {
  readonly code = -32014;
  constructor(msg: string) {
    super(msg);
    this.name = 'DividendValidationError';
  }
}

const TABLE = 'wealthflow_dividends' as const;

export async function createDividend(
  finance: FinanceApi,
  input: DividendInput,
  fyStart = '07-01',
): Promise<DividendEntry> {
  if (!Number.isInteger(input.stock_id) || input.stock_id <= 0)
    throw new DividendValidationError('stock_id must be a positive integer');
  const stock = await finance.db
    .table('wealthflow_stocks')
    .findOne({ id: input.stock_id });
  if (!stock)
    throw new DividendValidationError(`stock ${input.stock_id} does not exist`);
  if (!isValidIsoDate(input.date))
    throw new DividendValidationError('date must be YYYY-MM-DD');
  if (!(DIVIDEND_TYPES as readonly string[]).includes(input.type))
    throw new DividendValidationError(
      `type must be one of ${(DIVIDEND_TYPES as readonly string[]).join(' | ')}`,
    );
  if (!Number.isFinite(input.gross) || input.gross < 0)
    throw new DividendValidationError('gross must be ≥ 0');
  const franking = input.franking ?? 0;
  if (!Number.isFinite(franking) || franking < 0)
    throw new DividendValidationError('franking must be ≥ 0');
  const fy =
    input.finance_year?.trim() || computeFinanceYear(input.date, fyStart) || '';
  if (!fy)
    throw new DividendValidationError('finance_year could not be determined');
  // The DRP figures are CAPTURED FIELDS. They are written here rather than
  // derived from the dividend, because the two do not reconcile: a
  // reinvestment can cost more or less than the cash that funded it.
  const amountReinvested = input.amount_reinvested ?? 0;
  const unitsAcquired = input.units_acquired ?? 0;
  if (!Number.isFinite(amountReinvested) || amountReinvested < 0)
    throw new DividendValidationError('amount_reinvested must be ≥ 0');
  if (!Number.isFinite(unitsAcquired) || unitsAcquired < 0)
    throw new DividendValidationError('units_acquired must be ≥ 0');
  return (await finance.db.table(TABLE).insert({
    stock_id: input.stock_id,
    date: input.date,
    type: input.type,
    gross: input.gross,
    franking,
    finance_year: fy,
    notes: input.notes ?? null,
    amount_reinvested: amountReinvested,
    units_acquired: unitsAcquired,
  } as Record<string, unknown>)) as unknown as DividendEntry;
}

export async function updateDividend(
  finance: FinanceApi,
  id: number,
  patch: Partial<DividendInput>,
): Promise<number> {
  if (
    patch.type !== undefined &&
    !(DIVIDEND_TYPES as readonly string[]).includes(patch.type)
  )
    throw new DividendValidationError(
      'type must be one of non_trust | trust | foreign',
    );
  if (
    patch.gross !== undefined &&
    (!Number.isFinite(patch.gross) || patch.gross < 0)
  )
    throw new DividendValidationError('gross must be ≥ 0');
  if (
    patch.franking !== undefined &&
    (!Number.isFinite(patch.franking) || patch.franking < 0)
  )
    throw new DividendValidationError('franking must be ≥ 0');
  if (patch.date !== undefined && !isValidIsoDate(patch.date))
    throw new DividendValidationError('date must be YYYY-MM-DD');
  return finance.db
    .table(TABLE)
    .update({ id }, patch as Record<string, unknown>);
}

export async function deleteDividend(
  finance: FinanceApi,
  id: number,
): Promise<number> {
  return finance.db.table(TABLE).delete({ id });
}

export async function listDividends(
  finance: FinanceApi,
  filters: { stockId?: number; financeYear?: string; type?: string } = {},
): Promise<DividendEntry[]> {
  const q: Record<string, unknown> = {};
  if (filters.stockId !== undefined) q.stock_id = filters.stockId;
  if (filters.financeYear !== undefined) q.finance_year = filters.financeYear;
  if (filters.type !== undefined) q.type = filters.type;
  const rows = (await finance.db
    .table(TABLE)
    .find(q)) as unknown as DividendEntry[];
  return rows
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
