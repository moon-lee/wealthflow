import type { FinanceApi } from 'finance';
import { isValidIsoDate } from '../utils/finance-year.js';

export interface CostBaseAdjustment {
  readonly id: number;
  readonly stock_id: number;
  readonly date: string;
  readonly amount: number;
  readonly reason: string | null;
}

export type CostBaseAdjustmentInput = {
  stock_id: number;
  date: string;
  amount: number;
  reason?: string | null;
};

export class AdjustmentValidationError extends Error {
  readonly code = -32018;
  constructor(msg: string) {
    super(msg);
    this.name = 'AdjustmentValidationError';
  }
}

const TABLE = 'wealthflow_cost_base_adjustments' as const;

/**
 * Fund-level and per-distribution. The amount is SIGNED: negative reduces cost
 * base (a cost base reduction), positive adds to it. A zero row is legitimate
 * and is stored — the owner's statement prints one every year, and dropping the
 * zeros would make "did I record every distribution?" unanswerable.
 */
function assertValid(input: CostBaseAdjustmentInput): void {
  if (!Number.isFinite(input.stock_id) || input.stock_id <= 0)
    throw new AdjustmentValidationError('stock_id is required');
  if (!isValidIsoDate(input.date))
    throw new AdjustmentValidationError('date must be YYYY-MM-DD');
  if (!Number.isFinite(input.amount))
    throw new AdjustmentValidationError(
      'amount must be a number — 0 is a real answer, blank is not',
    );
}

export async function createAdjustment(
  finance: FinanceApi,
  input: CostBaseAdjustmentInput,
): Promise<CostBaseAdjustment> {
  assertValid(input);
  return (await finance.db.table(TABLE).insert({
    stock_id: input.stock_id,
    date: input.date,
    amount: input.amount,
    reason: input.reason ?? null,
  } as Record<string, unknown>)) as unknown as CostBaseAdjustment;
}

export async function listAdjustments(
  finance: FinanceApi,
  stockId: number,
): Promise<CostBaseAdjustment[]> {
  const rows = (await finance.db
    .table(TABLE)
    .find({})) as unknown as CostBaseAdjustment[];
  return rows
    .filter((r) => r.stock_id === stockId)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
}

/** Signed total for the fund. This is the figure on the tax statement. */
export async function totalAdjustment(
  finance: FinanceApi,
  stockId: number,
): Promise<number> {
  const rows = await listAdjustments(finance, stockId);
  return round4(rows.reduce((s, r) => s + r.amount, 0));
}

export async function deleteAdjustmentsForStock(
  finance: FinanceApi,
  stockId: number,
): Promise<void> {
  await finance.db.table(TABLE).delete({ stock_id: stockId });
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
