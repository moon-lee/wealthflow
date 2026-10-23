import type { FinanceApi } from 'finance';
import { addMonths, monthsBetween } from '../utils/dates.js';
import type { Parcel, ParcelSeed } from '../dao/parcels.js';
import { listParcels, replaceParcels } from '../dao/parcels.js';
import type { DisposalRow } from '../dao/disposals.js';
import type { Trade } from '../dao/trades.js';
import { listTrades } from '../dao/trades.js';
import type { Stock } from '../dao/stocks.js';
import { listStocks, updateStock } from '../dao/stocks.js';

/** Round to 4dp. DRP prices carry 4 significant decimals and must survive. */
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * Cost base of one acquisition: quantity x price plus the brokerage paid on it.
 * Brokerage belongs to the parcel it bought, which is why a 5-unit purchase at
 * $94.28 costing $474.40 is an effective $94.88 a unit.
 */
export function parcelCostBase(t: {
  quantity: number;
  price: number;
  brokerage: number;
}): number {
  return round4(t.quantity * t.price + t.brokerage);
}

/**
 * The 50% CGT discount needs the parcel held for 12 calendar months. Compared
 * as whole months, because "held for at least 12 months" is a date test, not
 * a day count, and a parcel qualifies on its anniversary.
 */
export function isDiscountEligible(
  acquiredDate: string,
  asOf: string,
): boolean {
  return asOf >= addMonths(acquiredDate, 12);
}

export function monthsHeld(acquiredDate: string, asOf: string): number {
  return Math.max(0, monthsBetween(acquiredDate, asOf));
}

function seedFor(stockId: number, t: Trade): ParcelSeed {
  return {
    stock_id: stockId,
    origin_trade_id: t.id,
    acquired_date: t.date,
    quantity: t.quantity,
    price: t.price,
    brokerage: t.brokerage,
  };
}

/**
 * Rebuild one stock's parcels from its buy trades.
 *
 * A parcel holds the quantity **as acquired** and is never reduced: it is the
 * original lot, and FIFO allocates a sale against it. What is LEFT of a lot is
 * `parcel.quantity` less the disposals that consumed it.
 *
 * This does NOT write `wealthflow_stocks.shares`. Units HELD depends on the
 * disposals, which are rebuilt after this - see `rebuildStock` in
 * `holding-service.ts`, which owns the whole chain.
 */
export async function rebuildParcels(
  finance: FinanceApi,
  stockId: number,
): Promise<Parcel[]> {
  const trades = await listTrades(finance, { stockId });
  const seeds = trades
    .filter((t) => t.side === 'buy')
    .map((t) => seedFor(stockId, t));
  await replaceParcels(finance, stockId, seeds);
  return listParcels(finance, { stockId });
}

export async function rebuildAllParcels(finance: FinanceApi): Promise<void> {
  const stocks = await listStocks(finance, { status: 'all' });
  for (const s of stocks) await rebuildParcels(finance, s.id);
}

export async function derivedShares(
  finance: FinanceApi,
): Promise<Map<number, number>> {
  const parcels = await listParcels(finance);
  const out = new Map<number, number>();
  for (const p of parcels)
    out.set(p.stock_id, (out.get(p.stock_id) ?? 0) + p.quantity);
  return out;
}

export interface ParcelGroup {
  stockId: number;
  stockCode: string;
  stockName: string;
  /** Units HELD: bought less sold. */
  units: number;
  parcelCount: number;
  avgCost: number;
  eligibleUnits: number;
  /** True when the holding has no parcels: the unit count is unknown, not zero. */
  notTracked: boolean;
}

/**
 * Group a stock's parcels into one row per holding.
 *
 * The unit count is units **HELD**, not units bought: a sale reduces the
 * holding, and a ledger that still says 100 after selling 30 is wrong.
 */
export function groupParcels(
  stocks: Pick<Stock, 'id' | 'stock_code' | 'stock_full_name'>[],
  parcels: Parcel[],
  asOf: string,
  disposals: DisposalRow[] = [],
): ParcelGroup[] {
  const soldByOrigin = new Map<number, number>();
  for (const d of disposals)
    soldByOrigin.set(
      d.origin_trade_id,
      (soldByOrigin.get(d.origin_trade_id) ?? 0) + d.quantity,
    );
  return stocks
    .map((s) => {
      const mine = parcels.filter((p) => p.stock_id === s.id);
      const units = mine.reduce(
        (sum, p) =>
          sum +
          Math.max(0, p.quantity - (soldByOrigin.get(p.origin_trade_id) ?? 0)),
        0,
      );
      const costBase = mine.reduce((sum, p) => sum + parcelCostBase(p), 0);
      return {
        stockId: s.id,
        stockCode: s.stock_code,
        stockName: s.stock_full_name,
        units,
        parcelCount: mine.length,
        avgCost: units > 0 ? round4(costBase / units) : 0,
        eligibleUnits: mine
          .filter((p) => isDiscountEligible(p.acquired_date, asOf))
          .reduce(
            (sum, p) =>
              sum +
              Math.max(
                0,
                p.quantity - (soldByOrigin.get(p.origin_trade_id) ?? 0),
              ),
            0,
          ),
        notTracked: mine.length === 0,
      };
    })
    .sort((a, b) => a.stockCode.localeCompare(b.stockCode));
}

/** How much of a parcel is LEFT after the disposals that consumed it. */
export function remainingOf(
  parcel: Pick<Parcel, 'quantity' | 'origin_trade_id'>,
  disposals: DisposalRow[],
): number {
  const sold = disposals
    .filter((d) => d.origin_trade_id === parcel.origin_trade_id)
    .reduce((s, d) => s + d.quantity, 0);
  return round4(Math.max(0, parcel.quantity - sold));
}
