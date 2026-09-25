import type { FinanceApi } from 'finance';

export interface Stock {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly shares: number;
  readonly is_active: boolean;
  readonly notes: string | null;
}

export type StockInput = {
  code: string;
  name: string;
  shares: number;
  notes?: string | null;
};

export class StockValidationError extends Error {
  readonly code = -32014;
  constructor(msg: string) {
    super(msg);
    this.name = 'StockValidationError';
  }
}

const TABLE = 'wealthflow_stocks' as const;

export async function createStock(finance: FinanceApi, input: StockInput): Promise<Stock> {
  const code = input.code.trim().toUpperCase();
  if (!code) throw new StockValidationError('code is required');
  if (!input.name.trim()) throw new StockValidationError('name is required');
  if (!Number.isFinite(input.shares) || input.shares < 0) throw new StockValidationError('shares must be ≥ 0');
  const dup = (await finance.db.table(TABLE).find({})) as unknown as Stock[];
  if (dup.some((r) => String(r.code).toUpperCase() === code))
    throw new StockValidationError(`Code ${code} already exists — reactivate it instead.`);
  return (await finance.db.table(TABLE).insert({
    code,
    name: input.name.trim(),
    shares: input.shares,
    notes: input.notes ?? null,
    is_active: true,
  } as Record<string, unknown>)) as unknown as Stock;
}

export async function listStocks(
  finance: FinanceApi,
  opts: { status?: 'active' | 'inactive' | 'all' } = {},
): Promise<Stock[]> {
  const q: Record<string, unknown> = {};
  if ((opts.status ?? 'active') === 'active') q.is_active = true;
  else if (opts.status === 'inactive') q.is_active = false;
  const rows = (await finance.db.table(TABLE).find(q)) as unknown as Stock[];
  return rows.slice().sort((a, b) => a.code.localeCompare(b.code));
}

export async function updateStock(finance: FinanceApi, id: number, patch: Partial<StockInput>): Promise<number> {
  if (patch.code !== undefined) {
    const code = patch.code.trim().toUpperCase();
    if (!code) throw new StockValidationError('code is required');
    const all = (await finance.db.table(TABLE).find({})) as unknown as Stock[];
    if (all.some((r) => r.id !== id && String(r.code).toUpperCase() === code))
      throw new StockValidationError(`Code ${code} already exists — reactivate it instead.`);
    return finance.db.table(TABLE).update({ id }, { ...patch, code } as Record<string, unknown>);
  }
  if (patch.shares !== undefined && (!Number.isFinite(patch.shares) || patch.shares < 0))
    throw new StockValidationError('shares must be ≥ 0');
  return finance.db.table(TABLE).update({ id }, patch as Record<string, unknown>);
}

export async function setStockActive(finance: FinanceApi, id: number, active: boolean): Promise<number> {
  return finance.db.table(TABLE).update({ id }, { is_active: active } as Record<string, unknown>);
}
