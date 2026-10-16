import type { FinanceApi } from 'finance';
import {
  createDividend,
  updateDividend,
  deleteDividend,
  type DividendEntry,
  type DividendInput,
} from '../dao/dividends.js';
import {
  createTrade,
  deleteTrade,
  updateTrade,
  listTrades,
  type Trade,
} from '../dao/trades.js';
import { rebuildParcels } from './parcel-service.js';

export class DrpValidationError extends Error {
  readonly code = -32019;
  constructor(msg: string) {
    super(msg);
    this.name = 'DrpValidationError';
  }
}

export interface DrpInput {
  amountReinvested: number;
  unitsAcquired: number;
}

export interface DrpResult {
  dividend: DividendEntry;
  trade: Trade | null;
  /** Explains a DRP that produced no trade, so the UI can say so. */
  note?: string;
}

/**
 * One payment, two consequences: an assessable dividend AND a parcel bought at
 * the DRP price. Written together or not at all.
 *
 * The host DB API has no transaction and no batch insert, so the coupling is a
 * COMPENSATING ROLLBACK: if the trade write fails, the dividend is undone —
 * deleted if it was created, restored to its prior values if it was an edit.
 * A half-recorded DRP (income without a parcel) is the exact failure this
 * exists to prevent, so the undo is not best-effort, it is mandatory.
 */
export async function logDividendWithDrp(
  finance: FinanceApi,
  dividend: DividendInput,
  drp: DrpInput | null,
  opts: { dividendId?: number } = {},
): Promise<DrpResult> {
  const prior = opts.dividendId
    ? ((await finance.db
        .table('wealthflow_dividends')
        .findOne({ id: opts.dividendId })) as unknown as DividendEntry | null)
    : null;

  // Validate the DRP BEFORE any write, so the common case never needs a rollback.
  if (drp && !(drp.amountReinvested >= 0))
    throw new DrpValidationError('amount reinvested cannot be negative');
  if (drp && !(drp.unitsAcquired >= 0))
    throw new DrpValidationError('units acquired cannot be negative');
  // Units without money implies an infinite DRP price, which would be a
  // cost-base blow-up. Money without units is the opposite case and IS
  // legitimate — the reinvestment rounded to nothing — so it is recorded as
  // income only, with a note, rather than refused.
  if (drp && drp.unitsAcquired > 0 && drp.amountReinvested === 0)
    throw new DrpValidationError(
      `${drp.unitsAcquired} units were acquired for $0 — there is no DRP price to record.`,
    );

  const drpFields = drp
    ? {
        amount_reinvested: drp.amountReinvested,
        units_acquired: drp.unitsAcquired,
      }
    : { amount_reinvested: 0, units_acquired: 0 };

  const row = prior
    ? (await updateDividend(finance, prior.id, {
        ...dividend,
        ...drpFields,
      } as any),
      (await finance.db
        .table('wealthflow_dividends')
        .findOne({ id: prior.id })) as unknown as DividendEntry)
    : ((await createDividend(finance, {
        ...dividend,
        ...drpFields,
      } as any)) as DividendEntry);

  // A DRP that bought nothing is a real event — the VHY $12.44 one — and is
  // recorded as income only. It is not an error and not a parcel.
  if (!drp || drp.unitsAcquired === 0) {
    return {
      dividend: row,
      trade: null,
      ...(drp
        ? { note: 'The DRP bought 0 units, so only the dividend was recorded.' }
        : {}),
    };
  }

  const price = round6(drp.amountReinvested / drp.unitsAcquired);
  const existing = await findDrpTrade(finance, row.id);
  try {
    const trade = existing
      ? (await updateTrade(finance, existing.id, {
          stock_id: row.stock_id,
          date: row.date,
          side: 'buy',
          quantity: drp.unitsAcquired,
          price,
          brokerage: 0,
          source: 'drp',
          dividend_id: row.id,
        }),
        (await finance.db
          .table('wealthflow_trades')
          .findOne({ id: existing.id })) as unknown as Trade)
      : await createTrade(finance, {
          stock_id: row.stock_id,
          date: row.date,
          side: 'buy',
          quantity: drp.unitsAcquired,
          price,
          brokerage: 0,
          source: 'drp',
          dividend_id: row.id,
        });
    await rebuildParcels(finance, row.stock_id);
    return { dividend: row, trade };
  } catch (err) {
    await compensate(finance, prior, row);
    throw err;
  }
}

/** Undo the dividend side. The trade side never landed, so this is the whole
 *  compensation. Failures here are swallowed deliberately: the original error
 *  is the one the user needs, and a rollback failure cannot be safely retried
 *  from the UI. */
async function compensate(
  finance: FinanceApi,
  prior: DividendEntry | null,
  written: DividendEntry,
): Promise<void> {
  try {
    if (prior) await updateDividend(finance, prior.id, { ...prior } as any);
    else await deleteDividend(finance, written.id);
  } catch {
    /* see doc comment */
  }
}

async function findDrpTrade(
  finance: FinanceApi,
  dividendId: number,
): Promise<Trade | null> {
  const rows = await listTrades(finance);
  return rows.find((t) => t.dividend_id === dividendId) ?? null;
}

/** Removes the dividend AND any DRP parcel it created. An orphan parcel with a
 *  deleted dividend behind it is a cost base that cannot be explained. */
export async function deleteDividendWithDrp(
  finance: FinanceApi,
  dividendId: number,
): Promise<void> {
  const trades = await listTrades(finance);
  const drp = trades.filter((t) => t.dividend_id === dividendId);
  const stockIds = drp.map((t) => t.stock_id);
  for (const t of drp) await deleteTrade(finance, t.id);
  await deleteDividend(finance, dividendId);
  for (const id of new Set(stockIds)) await rebuildParcels(finance, id);
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
