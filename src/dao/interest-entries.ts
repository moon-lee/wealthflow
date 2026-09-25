import type { FinanceApi } from 'finance';
import {
  computeFinanceYear,
  isValidIsoDate,
  monthKey,
  monthLabel,
} from '../utils/finance-year.js';

export interface InterestEntry {
  readonly id: number;
  readonly bank_id: number;
  readonly date: string;
  readonly amount: number;
  readonly finance_year: string;
  readonly notes: string | null;
}

export type InterestInput = {
  bank_id: number;
  date: string;
  amount: number;
  finance_year?: string;
  notes?: string | null;
};

export class InterestValidationError extends Error {
  readonly code = -32014;
  constructor(msg: string) {
    super(msg);
    this.name = 'InterestValidationError';
  }
}

const TABLE = 'wealthflow_interest_entries' as const;

async function bankMustBeActive(
  finance: FinanceApi,
  bank_id: number,
): Promise<string> {
  const bank = (await finance.db
    .table('wealthflow_banks')
    .findOne({ id: bank_id })) as unknown as {
    name: string;
    is_active: boolean;
  } | null;
  if (!bank)
    throw new InterestValidationError(`bank ${bank_id} does not exist`);
  if (!bank.is_active)
    throw new InterestValidationError(
      `bank ${bank.name} is inactive — reactivate it to add entries`,
    );
  return bank.name;
}

export async function createInterestEntry(
  finance: FinanceApi,
  input: InterestInput,
  fyStart = '07-01',
): Promise<InterestEntry> {
  if (!Number.isInteger(input.bank_id) || input.bank_id <= 0)
    throw new InterestValidationError('bank_id must be a positive integer');
  if (!isValidIsoDate(input.date))
    throw new InterestValidationError('date must be YYYY-MM-DD');
  if (!Number.isFinite(input.amount) || input.amount < 0)
    throw new InterestValidationError('amount must be ≥ 0');
  const bankName = await bankMustBeActive(finance, input.bank_id);
  const mk = monthKey(input.date);
  const existing = (await finance.db
    .table(TABLE)
    .find({ bank_id: input.bank_id })) as unknown as InterestEntry[];
  if (existing.some((r) => monthKey(r.date) === mk))
    throw new InterestValidationError(
      `An entry for ${bankName} already exists in ${monthLabel(mk)} — edit it instead.`,
    );
  const fy =
    input.finance_year?.trim() || computeFinanceYear(input.date, fyStart) || '';
  if (!fy)
    throw new InterestValidationError('finance_year could not be determined');
  const row = (await finance.db.table(TABLE).insert({
    bank_id: input.bank_id,
    date: input.date,
    amount: input.amount,
    finance_year: fy,
    notes: input.notes ?? null,
  } as Record<string, unknown>)) as unknown as InterestEntry;
  return row;
}

export async function updateInterestEntry(
  finance: FinanceApi,
  id: number,
  patch: Partial<InterestInput>,
): Promise<number> {
  if (
    patch.amount !== undefined &&
    (!Number.isFinite(patch.amount) || patch.amount < 0)
  )
    throw new InterestValidationError('amount must be ≥ 0');
  if (patch.date !== undefined && !isValidIsoDate(patch.date))
    throw new InterestValidationError('date must be YYYY-MM-DD');
  const existing = (await finance.db
    .table(TABLE)
    .findOne({ id })) as unknown as InterestEntry | null;
  if (!existing) return 0;
  const nextBank = patch.bank_id ?? existing.bank_id;
  const nextDate = patch.date ?? existing.date;
  const mk = monthKey(nextDate);
  const siblings = (await finance.db
    .table(TABLE)
    .find({ bank_id: nextBank })) as unknown as InterestEntry[];
  if (siblings.some((r) => r.id !== id && monthKey(r.date) === mk))
    throw new InterestValidationError(
      'An entry for this bank already exists in that month — edit it instead.',
    );
  return finance.db
    .table(TABLE)
    .update({ id }, patch as Record<string, unknown>);
}

export async function deleteInterestEntry(
  finance: FinanceApi,
  id: number,
): Promise<number> {
  return finance.db.table(TABLE).delete({ id });
}

export async function listInterestEntries(
  finance: FinanceApi,
  filters: { bankId?: number; financeYear?: string } = {},
): Promise<InterestEntry[]> {
  const q: Record<string, unknown> = {};
  if (filters.bankId !== undefined) q.bank_id = filters.bankId;
  if (filters.financeYear !== undefined) q.finance_year = filters.financeYear;
  const rows = (await finance.db
    .table(TABLE)
    .find(q)) as unknown as InterestEntry[];
  return rows
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
