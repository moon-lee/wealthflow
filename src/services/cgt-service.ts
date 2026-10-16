import type { Parcel } from '../dao/parcels.js';
import { addMonths } from '../utils/dates.js';

export interface Adjustment {
  eligible: boolean;
  /** Fraction of the nominal gain that survives the adjustment. */
  factor: number;
}

/**
 * The regime rule, keyed on DATES rather than a month count, because a month
 * count cannot express a regime boundary and cannot express eligibility to the
 * day. Adding the 2027 cost-base-indexation rule is a second entry here, not a
 * rewrite of the disposal code.
 */
export function adjustmentFor(
  acquiredDate: string,
  disposalDate: string,
): Adjustment {
  const eligible = disposalDate >= addMonths(acquiredDate, 12);
  return { eligible, factor: eligible ? 0.5 : 1 };
}

export interface AllocationRow {
  parcel: Parcel;
  quantity: number;
}

export class InsufficientHoldingsError extends Error {
  readonly code = -32016;
  constructor(held: number, asked: number) {
    super(
      `You have ${held} units on hand — selling ${asked} needs an allocation that does not balance.`,
    );
    this.name = 'InsufficientHoldingsError';
  }
}

/**
 * FIFO: oldest acquisition first. Deterministic, and therefore replayable —
 * every edit re-runs this from the earliest trade and gets the same answer.
 */
export function allocateFifo(
  parcels: Parcel[],
  quantity: number,
): AllocationRow[] {
  if (!Number.isFinite(quantity) || quantity <= 0)
    throw new RangeError('quantity must be greater than 0');

  const oldestFirst = parcels
    .slice()
    .sort((a, b) =>
      a.acquired_date < b.acquired_date
        ? -1
        : a.acquired_date > b.acquired_date
          ? 1
          : a.origin_trade_id - b.origin_trade_id,
    );
  const held = oldestFirst.reduce((s, p) => s + p.quantity, 0);
  if (quantity > held) throw new InsufficientHoldingsError(held, quantity);

  const rows: AllocationRow[] = [];
  let left = quantity;
  for (const p of oldestFirst) {
    if (left <= 0) break;
    const take = Math.min(p.quantity, left);
    rows.push({ parcel: p, quantity: take });
    left -= take;
  }
  return rows;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export interface Disposal {
  parcelId: number;
  originTradeId: number;
  stockId: number;
  acquiredDate: string;
  disposalDate: string;
  quantity: number;
  proceeds: number;
  costBase: number;
  nominalGain: number;
  /** Signed from the taxpayer's view: positive shrinks a loss. */
  discountApplied: number;
  netGain: number;
  eligible: boolean;
}

export function computeDisposal(
  parcel: Parcel,
  quantity: number,
  price: number,
  disposalDate: string,
): Disposal {
  // Cost base is per unit, so a partial sale takes a proportional slice and the
  // parcel's whole basis is conserved across the sale that empties it.
  const wholeCostBase = round4(
    parcel.quantity * parcel.price + parcel.brokerage,
  );
  const costBase = round4(wholeCostBase * (quantity / parcel.quantity));
  const proceeds = round4(quantity * price);
  const nominalGain = round4(proceeds - costBase);
  const rule = adjustmentFor(parcel.acquired_date, disposalDate);
  const netGain = round4(nominalGain * rule.factor);
  return {
    parcelId: parcel.id,
    originTradeId: parcel.origin_trade_id,
    stockId: parcel.stock_id,
    acquiredDate: parcel.acquired_date,
    disposalDate,
    quantity,
    proceeds,
    costBase,
    nominalGain,
    discountApplied: round4(netGain - nominalGain),
    netGain,
    eligible: rule.eligible,
  };
}

export interface NetRow {
  nominalGain: number;
  eligible: boolean;
  netGain: number;
}

export interface NetResult {
  gross: number;
  losses: number;
  eligibleNet: number;
  ineligibleNet: number;
  adjustment: number;
  netGain: number;
}

/**
 * The two-bucket rule: losses offset gains, and only the ELIGIBLE bucket is
 * discounted. Discounting the whole net would be wrong — it would discount a
 * parcel that has not been held a year.
 */
export function netGains(rows: NetRow[]): NetResult {
  const eligibleNet = round4(
    rows.filter((r) => r.eligible).reduce((s, r) => s + r.nominalGain, 0),
  );
  const ineligibleNet = round4(
    rows.filter((r) => !r.eligible).reduce((s, r) => s + r.nominalGain, 0),
  );
  // The reported net is the sum of the ADJUSTED gains, not of the nominals:
  // the eligible bucket has already been halved by computeDisposal.
  const netGain = round4(rows.reduce((s, r) => s + r.netGain, 0));
  return {
    gross: round4(rows.reduce((s, r) => s + Math.max(0, r.nominalGain), 0)),
    losses: round4(rows.reduce((s, r) => s + Math.min(0, r.nominalGain), 0)),
    eligibleNet,
    ineligibleNet,
    adjustment: round4(netGain - (eligibleNet + ineligibleNet)),
    netGain,
  };
}

export interface DisposalRow {
  stockId: number;
  stockCode: string;
  disposalDate: string;
  proceeds: number;
  costBase: number;
  nominalGain: number;
  adjustment: number;
  netGain: number;
}

export interface StockSummary {
  stockId: number;
  stockCode: string;
  disposals: number;
  proceeds: number;
  costBase: number;
  nominalGain: number;
  adjustment: number;
  netGain: number;
}

export interface CapitalGainsSummary {
  financialYear: string;
  grossGain: number;
  lossesApplied: number;
  adjustment: number;
  netGain: number;
  /** Opening balance carried INTO this year. */
  carriedForwardLoss: number;
  /** What would be carried OUT of it, after this year's net gain. */
  carriedForwardOut: number;
  /** False when no opening balance was ever entered — the UI says so rather
   *  than showing a 0 that implies none was ever lost. */
  hasOpeningBalance: boolean;
  byStock: StockSummary[];
}

export function summariseYear(
  rows: DisposalRow[],
  financialYear: string,
  openingLossBalance: number,
): CapitalGainsSummary {
  const grossGain = round4(
    rows.reduce((s, r) => s + Math.max(0, r.nominalGain), 0),
  );
  const lossesApplied = round4(
    rows.reduce((s, r) => s + Math.min(0, r.nominalGain), 0),
  );
  const netBeforeLosses = round4(rows.reduce((s, r) => s + r.netGain, 0));
  const opening = round4(Math.max(0, openingLossBalance));
  // The opening balance absorbs this year's gain first; whatever is left of it
  // carries out. A loss this year adds to what carries out.
  const netGain = round4(Math.max(0, netBeforeLosses - opening));
  const carriedForwardOut = round4(Math.max(0, opening - netBeforeLosses));

  const byStockMap = new Map<number, StockSummary>();
  for (const r of rows) {
    const cur = byStockMap.get(r.stockId) ?? {
      stockId: r.stockId,
      stockCode: r.stockCode,
      disposals: 0,
      proceeds: 0,
      costBase: 0,
      nominalGain: 0,
      adjustment: 0,
      netGain: 0,
    };
    cur.disposals += 1;
    cur.proceeds = round4(cur.proceeds + r.proceeds);
    cur.costBase = round4(cur.costBase + r.costBase);
    cur.nominalGain = round4(cur.nominalGain + r.nominalGain);
    cur.adjustment = round4(cur.adjustment + r.adjustment);
    cur.netGain = round4(cur.netGain + r.netGain);
    byStockMap.set(r.stockId, cur);
  }

  return {
    financialYear,
    grossGain,
    lossesApplied,
    adjustment: round4(rows.reduce((s, r) => s + r.adjustment, 0)),
    netGain,
    carriedForwardLoss: opening,
    carriedForwardOut,
    hasOpeningBalance: opening > 0,
    byStock: [...byStockMap.values()].sort((a, b) =>
      a.stockCode.localeCompare(b.stockCode),
    ),
  };
}
