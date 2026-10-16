import type { FinanceApi } from 'finance';

export interface DisposalRow {
  readonly id: number;
  readonly trade_id: number;
  /** The parcel consumed, by natural key — never by the regenerable parcel id. */
  readonly origin_trade_id: number;
  readonly stock_id: number;
  readonly finance_year: string;
  readonly disposal_date: string;
  readonly quantity: number;
  readonly proceeds: number;
  readonly cost_base: number;
  readonly nominal_gain: number;
  readonly discount_applied: number;
  readonly net_gain: number;
  readonly eligible: boolean;
}

export type DisposalSeed = Omit<DisposalRow, 'id'>;

const TABLE = 'wealthflow_disposals' as const;

export async function listDisposals(
  finance: FinanceApi,
  opts: { financeYear?: string; stockId?: number } = {},
): Promise<DisposalRow[]> {
  const rows = (await finance.db
    .table(TABLE)
    .find({})) as unknown as DisposalRow[];
  return rows
    .filter((r) => {
      if (opts.financeYear != null && r.finance_year !== opts.financeYear)
        return false;
      if (opts.stockId != null && r.stock_id !== opts.stockId) return false;
      return true;
    })
    .sort((a, b) => (a.disposal_date < b.disposal_date ? -1 : 1));
}

export async function replaceDisposalsForTrade(
  finance: FinanceApi,
  tradeId: number,
  rows: DisposalSeed[],
): Promise<void> {
  await finance.db.table(TABLE).delete({ trade_id: tradeId });
  for (const row of rows) {
    await finance.db
      .table(TABLE)
      .insert(row as unknown as Record<string, unknown>);
  }
}

export async function deleteDisposalsForTrade(
  finance: FinanceApi,
  tradeId: number,
): Promise<void> {
  await finance.db.table(TABLE).delete({ trade_id: tradeId });
}

/** Wipe one stock's disposals. Used by the rebuild, which is the only writer. */
export async function deleteDisposalsForStock(
  finance: FinanceApi,
  stockId: number,
): Promise<void> {
  await finance.db.table(TABLE).delete({ stock_id: stockId });
}

export async function countDisposals(finance: FinanceApi): Promise<number> {
  return (await finance.db.table(TABLE).count({})) as number;
}
