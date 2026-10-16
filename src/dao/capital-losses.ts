import type { FinanceApi } from 'finance';

export interface CapitalLossBalance {
  readonly id: number;
  readonly finance_year: string;
  readonly opening_balance: number;
}

const TABLE = 'wealthflow_capital_losses' as const;

/** Opening balances the owner entered, keyed by FY. System-written rows for
 *  years before tracking began are the only ones this app can trust. */
export async function listOpeningBalances(
  finance: FinanceApi,
): Promise<CapitalLossBalance[]> {
  const rows = (await finance.db
    .table(TABLE)
    .find({})) as unknown as CapitalLossBalance[];
  return rows.sort((a, b) => (a.finance_year < b.finance_year ? -1 : 1));
}

export async function getOpeningBalance(
  finance: FinanceApi,
  financeYear: string,
): Promise<number> {
  const row = (await finance.db.table(TABLE).findOne({
    finance_year: financeYear,
  })) as unknown as CapitalLossBalance | null;
  return row ? Number(row.opening_balance) : 0;
}

export async function setOpeningBalance(
  finance: FinanceApi,
  financeYear: string,
  openingBalance: number,
): Promise<void> {
  const existing = (await finance.db.table(TABLE).findOne({
    finance_year: financeYear,
  })) as unknown as CapitalLossBalance | null;
  if (existing) {
    await finance.db
      .table(TABLE)
      .update({ id: existing.id }, { opening_balance: openingBalance });
    return;
  }
  await finance.db
    .table(TABLE)
    .insert({ finance_year: financeYear, opening_balance: openingBalance });
}
