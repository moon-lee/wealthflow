import type { FinanceApi } from 'finance';
import { computeFinanceYear, isValidIsoDate } from '../utils/finance-year.js';

export const SUPER_KINDS = ['balance', 'contribution'] as const;
export type SuperKind = (typeof SUPER_KINDS)[number];
export const SUPER_LABELS: Record<SuperKind, string> = {
  balance: 'Balance',
  contribution: 'Private contribution',
};

export interface SuperEntry {
  readonly id: number;
  readonly date: string;
  readonly kind: SuperKind;
  readonly amount: number;
  readonly finance_year: string;
  readonly notes: string | null;
}

export type SuperInput = {
  date: string;
  kind: string;
  amount: number;
  finance_year?: string;
  notes?: string | null;
};

export class SuperValidationError extends Error {
  readonly code = -32014;
  constructor(msg: string) {
    super(msg);
    this.name = 'SuperValidationError';
  }
}

const TABLE = 'wealthflow_super_entries' as const;

export async function createSuperEntry(
  finance: FinanceApi,
  input: SuperInput,
  fyStart = '07-01',
): Promise<SuperEntry> {
  if (!isValidIsoDate(input.date))
    throw new SuperValidationError('date must be YYYY-MM-DD');
  if (!(SUPER_KINDS as readonly string[]).includes(input.kind))
    throw new SuperValidationError(
      `kind must be one of ${(SUPER_KINDS as readonly string[]).join(' | ')}`,
    );
  if (!Number.isFinite(input.amount) || input.amount < 0)
    throw new SuperValidationError('amount must be ≥ 0');
  const fy =
    input.finance_year?.trim() || computeFinanceYear(input.date, fyStart) || '';
  if (!fy)
    throw new SuperValidationError('finance_year could not be determined');
  return (await finance.db.table(TABLE).insert({
    date: input.date,
    kind: input.kind,
    amount: input.amount,
    finance_year: fy,
    notes: input.notes ?? null,
  } as Record<string, unknown>)) as unknown as SuperEntry;
}

export async function updateSuperEntry(
  finance: FinanceApi,
  id: number,
  patch: Partial<SuperInput>,
): Promise<number> {
  if (
    patch.kind !== undefined &&
    !(SUPER_KINDS as readonly string[]).includes(patch.kind)
  )
    throw new SuperValidationError(
      'kind must be one of balance | contribution',
    );
  if (
    patch.amount !== undefined &&
    (!Number.isFinite(patch.amount) || patch.amount < 0)
  )
    throw new SuperValidationError('amount must be ≥ 0');
  if (patch.date !== undefined && !isValidIsoDate(patch.date))
    throw new SuperValidationError('date must be YYYY-MM-DD');
  return finance.db
    .table(TABLE)
    .update({ id }, patch as Record<string, unknown>);
}

export async function deleteSuperEntry(
  finance: FinanceApi,
  id: number,
): Promise<number> {
  return finance.db.table(TABLE).delete({ id });
}

export async function listSuperEntries(
  finance: FinanceApi,
  filters: { kind?: string; financeYear?: string } = {},
): Promise<SuperEntry[]> {
  const q: Record<string, unknown> = {};
  if (filters.kind !== undefined) q.kind = filters.kind;
  if (filters.financeYear !== undefined) q.finance_year = filters.financeYear;
  const rows = (await finance.db
    .table(TABLE)
    .find(q)) as unknown as SuperEntry[];
  return rows
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
