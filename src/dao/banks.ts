import type { FinanceApi } from 'finance';

export interface Bank {
  readonly id: number;
  readonly bank_code: string;
  readonly bank_full_name: string | null;
  readonly bsb: string | null;
  readonly account_number: string;
  readonly is_active: boolean;
  readonly notes: string | null;
  readonly created_at?: string;
  readonly updated_at?: string;
}

export type BankInput = {
  bank_code: string;
  bank_full_name?: string | null;
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
  const bankCode = input.bank_code.trim();
  if (!bankCode) throw new BankValidationError('bank_code is required');
  if (!input.account_number.trim())
    throw new BankValidationError('account_number is required');
  if (
    input.bsb != null &&
    input.bsb !== '' &&
    !/^\d{6}$/.test(input.bsb.replace(/\D/g, ''))
  )
    throw new BankValidationError('bsb must be 6 digits');
  const row = (await finance.db.table(TABLE).insert({
    bank_code: bankCode,
    bank_full_name: input.bank_full_name?.trim() || null,
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
  return rows.slice().sort((a, b) => a.bank_code.localeCompare(b.bank_code));
}

export async function updateBank(
  finance: FinanceApi,
  id: number,
  patch: Partial<BankInput>,
): Promise<number> {
  if (patch.bank_code !== undefined && !patch.bank_code.trim())
    throw new BankValidationError('bank_code is required');
  const clean: Partial<BankInput> = { ...patch };
  if (clean.bank_full_name !== undefined)
    clean.bank_full_name =
      clean.bank_full_name == null || clean.bank_full_name.trim() === ''
        ? null
        : clean.bank_full_name.trim();
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
