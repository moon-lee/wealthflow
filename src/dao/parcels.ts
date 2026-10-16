import type { FinanceApi } from 'finance';

export interface Parcel {
  readonly id: number;
  readonly stock_id: number;
  readonly origin_trade_id: number;
  readonly acquired_date: string;
  readonly quantity: number;
  readonly price: number;
  readonly brokerage: number;
}

export type ParcelSeed = Omit<Parcel, 'id'>;

const TABLE = 'wealthflow_parcels' as const;

export async function listParcels(
  finance: FinanceApi,
  opts: { stockId?: number } = {},
): Promise<Parcel[]> {
  const rows = (await finance.db
    .table(TABLE)
    .find({})) as unknown as Parcel[];
  const mine = opts.stockId == null
    ? rows
    : rows.filter((r) => r.stock_id === opts.stockId);
  // Oldest first: that is the order FIFO consumes parcels in, so the ledger's
  // row order is the order a sale would take them.
  return mine.sort((a, b) => (a.acquired_date < b.acquired_date ? -1 : a.acquired_date > b.acquired_date ? 1 : a.origin_trade_id - b.origin_trade_id));
}

export async function countParcels(
  finance: FinanceApi,
  stockId: number,
): Promise<number> {
  return (await listParcels(finance, { stockId })).length;
}

/**
 * Replace every parcel for one stock. The host API has no batch insert and no
 * transaction, so this is delete-then-insert and is not atomic — which is why
 * the rebuild always recomputes from trades rather than trusting this table.
 */
export async function replaceParcels(
  finance: FinanceApi,
  stockId: number,
  rows: ParcelSeed[],
): Promise<void> {
  await finance.db.table(TABLE).delete({ stock_id: stockId });
  for (const row of rows) {
    await finance.db.table(TABLE).insert(row as unknown as Record<string, unknown>);
  }
}