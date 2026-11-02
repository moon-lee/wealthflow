import type { FinanceApi } from 'finance';
import type { Parcel } from '../dao/parcels.js';
import { listParcels } from '../dao/parcels.js';
import type { Trade } from '../dao/trades.js';
import { listTrades } from '../dao/trades.js';
import type { DisposalSeed } from '../dao/disposals.js';
import {
  replaceDisposalsForTrade,
  deleteDisposalsForStock,
} from '../dao/disposals.js';
import { computeFinanceYear } from '../utils/finance-year.js';
import { totalAdjustmentAsOf } from '../dao/cost-base-adjustments.js';
import { todayIso } from '../utils/dates.js';
import { allocateFifo, computeDisposal, type Disposal } from './cgt-service.js';

const FY_START = '07-01';

export interface Allocation {
  parcel: Parcel;
  quantity: number;
  proceeds: number;
  costBase: number;
  nominalGain: number;
  discountApplied: number;
  netGain: number;
  eligible: boolean;
  heldMonths: string;
}

export class AllocationDoesNotBalanceError extends Error {
  readonly code = -32017;
  constructor(
    readonly tradeId: number,
    message: string,
  ) {
    super(message);
    this.name = 'AllocationDoesNotBalanceError';
  }
}

/**
 * Live preview for the sell form: what FIFO would take, and what it costs,
 * BEFORE anything is saved. This is the reason the section exists.
 */
export function previewSell(
  parcels: Parcel[],
  quantity: number,
  price: number,
  asOf: string = todayIso(),
): Allocation[] {
  return allocateFifo(parcels, quantity).map(({ parcel, quantity: q }) => {
    const d = computeDisposal(parcel, q, price, asOf);
    return {
      parcel,
      quantity: q,
      proceeds: d.proceeds,
      costBase: d.costBase,
      nominalGain: d.nominalGain,
      discountApplied: d.discountApplied,
      netGain: d.netGain,
      eligible: d.eligible,
      heldMonths: monthsHeldLabel(parcel.acquired_date, asOf),
    };
  });
}

function monthsHeldLabel(acquired: string, asOf: string): string {
  const m =
    Number(asOf.slice(0, 4)) * 12 +
    Number(asOf.slice(5, 7)) -
    (Number(acquired.slice(0, 4)) * 12 + Number(acquired.slice(5, 7)));
  if (m < 12) return `${m} mo`;
  const y = Math.floor(m / 12);
  const rem = m % 12;
  return rem === 0 ? `${y} yr` : `${y} yr ${rem} mo`;
}

/**
 * Replay the whole allocation for one stock from its earliest trade.
 *
 * Called after every create, edit and delete. If the replay no longer balances
 * — reducing a buy so fewer units exist than a later sell needs — the edit is
 * refused with the reason rather than silently writing a history that cannot
 * have happened.
 */
export async function replayStock(
  finance: FinanceApi,
  stockId: number,
  opts: {
    exceptTradeId?: number;
    pending?: Trade | null;
    /**
     * Parcels to replay against instead of the stored ones. A delete has to
     * model the parcel its buy leaves behind, and that parcel is still in the
     * table while the check runs.
     */
    parcels?: Parcel[];
  } = {},
): Promise<Array<Disposal & { tradeId: number }>> {
  const stored = opts.parcels ?? (await listParcels(finance, { stockId }));
  const pending = opts.pending ?? null;

  // A pending BUY has no stored parcel yet, so the replay has to model it —
  // otherwise an edit that shrinks a buy looks harmless because the old, larger
  // parcel is still sitting in the table.
  let parcels = stored;
  if (pending && pending.side === 'buy' && pending.id === opts.exceptTradeId) {
    const seeded: Parcel = {
      id: -pending.id,
      stock_id: pending.stock_id,
      origin_trade_id: pending.id,
      acquired_date: pending.date,
      quantity: pending.quantity,
      price: pending.price,
      brokerage: pending.brokerage,
    };
    const idx = parcels.findIndex((p) => p.origin_trade_id === pending.id);
    parcels =
      idx >= 0
        ? parcels.map((p, i) => (i === idx ? seeded : p))
        : [...parcels, seeded];
  }

  const trades = (await listTrades(finance, { stockId }))
    .filter((t) => t.id !== opts.exceptTradeId)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));

  const withPending = pending
    ? [...trades, pending].sort((a, b) =>
        a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id,
      )
    : trades;

  // Remaining units per parcel, consumed in date order.
  const remaining = new Map<number, number>(
    parcels.map((p) => [p.origin_trade_id, p.quantity]),
  );

  const produced: Array<Disposal & { tradeId: number }> = [];
  // The AMIT denominator is the FUND's cost base as acquired, and it is
  // CONSTANT across every sale in the replay. A denominator that shrank as
  // units were sold would make each sale re-bear a full pro-rata share, so a
  // liquidation split across two sales would total more than the fund
  // adjustment — breaking the conservation invariant in spec 9.1 check 2.
  const denominator = round4(
    parcels.reduce((s, p) => s + p.quantity * p.price + p.brokerage, 0),
  );

  for (const t of withPending) {
    if (t.side !== 'sell') continue;
    const open = parcels
      .filter((p) => p.acquired_date <= t.date)
      .map((p) => ({ p, left: remaining.get(p.origin_trade_id)! }))
      .filter((r) => r.left > 0);
    const held = open.reduce((s, r) => s + r.left, 0);
    if (t.quantity > held)
      throw new AllocationDoesNotBalanceError(
        t.id,
        `Selling ${t.quantity} on ${t.date} needs more units than exist by then — only ${held} on hand at that date.`,
      );
    // allocateFifo consumes whole parcels, so hand it the REMAINING quantities.
    // Passing the original quantities would let a second sale take units a
    // first sale already consumed. The brokerage must be scaled with the
    // remainder too, or it is charged in full to every partial sale and the
    // parcel's basis stops conserving.
    const available = open.map((r) =>
      r.left === r.p.quantity
        ? r.p
        : {
            ...r.p,
            quantity: r.left,
            brokerage: (r.p.brokerage * r.left) / r.p.quantity,
          },
    );
    for (const { parcel, quantity } of allocateFifo(available, t.quantity)) {
      remaining.set(
        parcel.origin_trade_id,
        remaining.get(parcel.origin_trade_id)! - quantity,
      );
      // A disposal bears only the adjustments that existed by ITS OWN date.
      // An adjustment published later cannot have reduced a cost base that
      // was already gone.
      const amitTotal = await totalAdjustmentAsOf(finance, stockId, t.date);
      // The trade id travels with the disposal rather than being matched back
      // by date: two sells on one date would otherwise cross-assign.
      produced.push({
        ...computeDisposal(parcel, quantity, t.price, t.date, {
          total: amitTotal,
          denominator,
        }),
        tradeId: t.id,
      });
    }
  }
  return produced;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function toSeed(trade: Trade, d: Disposal): DisposalSeed {
  return {
    trade_id: trade.id,
    origin_trade_id: d.originTradeId,
    stock_id: d.stockId,
    finance_year: computeFinanceYear(d.disposalDate, FY_START) ?? '',
    disposal_date: d.disposalDate,
    quantity: d.quantity,
    proceeds: d.proceeds,
    cost_base: d.costBase,
    amit_share: d.amitShare,
    nominal_gain: d.nominalGain,
    discount_applied: d.discountApplied,
    net_gain: d.netGain,
    eligible: d.eligible,
  };
}

/** Recompute and persist every disposal for one stock. */
export async function rebuildDisposals(
  finance: FinanceApi,
  stockId: number,
  opts: { exceptTradeId?: number; pending?: Trade | null } = {},
): Promise<Array<Disposal & { tradeId: number }>> {
  const produced = await replayStock(finance, stockId, opts);
  // Wipe the stock's disposals wholesale rather than per surviving trade: a
  // DELETED sell is no longer in listTrades, so a per-trade loop would leave
  // its rows orphaned forever.
  await deleteDisposalsForStock(finance, stockId);
  const trades = await listTrades(finance, { stockId });
  const byTrade = new Map<number, DisposalSeed[]>();
  for (const d of produced) {
    const trade =
      opts.pending && opts.pending.id === d.tradeId
        ? opts.pending
        : trades.find((t) => t.id === d.tradeId);
    if (!trade) continue;
    const rows = byTrade.get(d.tradeId) ?? [];
    rows.push(toSeed(trade, d));
    byTrade.set(d.tradeId, rows);
  }
  for (const [tradeId, rows] of byTrade) {
    await replaceDisposalsForTrade(finance, tradeId, rows);
  }
  return produced;
}
