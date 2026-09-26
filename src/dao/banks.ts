import type { FinanceApi } from 'finance';

export interface Bank {
  readonly id: number;
  readonly name: string;
  readonly full_name: string | null;
  readonly bsb: string | null;
  readonly account_number: string;
  readonly is_active: boolean;
  readonly notes: string | null;
  readonly created_at?: string;
  readonly updated_at?: string;
}

export type BankInput = {
  name: string;
  full_name?: string | null;
  bsb?: string | null;
  account_number: string;
  notes?: string | null;
};

export class BankValidationError extends Error {
  readonly code = -32014;
  constructor(msg: string) {
    super(msg);
    this.name = 'BankValidationError';
  }
}

const TABLE = 'wealthflow_banks' as const;

export async function createBank(
  finance: FinanceApi,
  input: BankInput,
): Promise<Bank> {
  const name = input.name.trim();
  if (!name) throw new BankValidationError('name is required');
  if (!input.account_number.trim())
    throw new BankValidationError('account_number is required');
  if (
    input.bsb != null &&
    input.bsb !== '' &&
    !/^\d{6}$/.test(input.bsb.replace(/\D/g, ''))
  )
    throw new BankValidationError('bsb must be 6 digits');
  const row = (await finance.db.table(TABLE).insert({
    name,
    full_name: input.full_name?.trim() || null,
    bsb: input.bsb?.replace(/\D/g, '') || null,
    account_number: input.account_number.trim(),
    notes: input.notes ?? null,
    is_active: true,
  } as Record<string, unknown>)) as unknown as Bank;
  return row;
}

export async function listBanks(
  finance: FinanceApi,
  opts: { status?: 'active' | 'inactive' | 'all' } = {},
): Promise<Bank[]> {
  const q: Record<string, unknown> = {};
  if ((opts.status ?? 'active') === 'active') q.is_active = true;
  else if (opts.status === 'inactive') q.is_active = false;
  const rows = (await finance.db.table(TABLE).find(q)) as unknown as Bank[];
  return rows.slice().sort((a, b) => a.name.localeCompare(b.name));
}

export async function updateBank(
  finance: FinanceApi,
  id: number,
  patch: Partial<BankInput>,
): Promise<number> {
  if (patch.name !== undefined && !patch.name.trim())
    throw new BankValidationError('name is required');
  const clean: Partial<BankInput> = { ...patch };
  if (clean.full_name !== undefined)
    clean.full_name =
      clean.full_name == null || clean.full_name.trim() === ''
        ? null
        : clean.full_name.trim();
  return finance.db
    .table(TABLE)
    .update({ id }, clean as Record<string, unknown>);
}

export async function setBankActive(
  finance: FinanceApi,
  id: number,
  active: boolean,
): Promise<number> {
  return finance.db
    .table(TABLE)
    .update({ id }, { is_active: active } as Record<string, unknown>);
}

export async function findBank(
  finance: FinanceApi,
  id: number,
): Promise<Bank | null> {
  return (await finance.db
    .table(TABLE)
    .findOne({ id })) as unknown as Bank | null;
}
