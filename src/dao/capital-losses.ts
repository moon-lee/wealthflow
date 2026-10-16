import type { FinanceApi } from 'finance';

/**
 * Carried INTO `financeYear`, by recurrence from the earliest FY that has an
 * opening balance:
 *
 *     carriedForward(fy)      = openingBalance(fy) + carriedForward(fy - 1)
 *     carriedForward(firstFy) = openingBalance(firstFy)
 *
 * Reading only this FY's row would silently discard a balance the owner
 * entered for an earlier year — which is the normal case, since they enter one
 * opening figure and then expect the app to roll it.
 *
 * Labels sort correctly as strings because every one is `YYYY-YYYY`.
 */
export async function carriedForwardFor(
  finance: FinanceApi,
  financeYear: string,
): Promise<number> {
  const rows = await listOpeningBalances(finance);
  const sum = rows
    .filter((r) => r.finance_year <= financeYear)
    .reduce((s, r) => s + Number(r.opening_balance), 0);
  return round4(Math.max(0, sum));
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

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
