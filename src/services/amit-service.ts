import type { FinanceApi } from 'finance';
import type { Parcel } from '../dao/parcels.js';
import { listParcels } from '../dao/parcels.js';
import { totalAdjustment } from '../dao/cost-base-adjustments.js';
import { allocateFifo } from './cgt-service.js';

/** 4dp, not 2dp — see spec 9.1: per-parcel shares land below display precision
 *  at real magnitudes, and rounding them to cents makes them fail to sum back
 *  to the fund total. */
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export interface AmitRow {
  parcel: Parcel;
  quantity: number;
  /** Cost base before any AMIT share: quantity x (price + brokerage). */
  costBasePreAdjustment: number;
  /** This parcel's slice of the FUND adjustment. Signed. */
  adjustmentShare: number;
  /** What actually leaves the parcel. */
  costBase: number;
}

/**
 * Pro-rata allocation of a FUND-level adjustment across the units sold,
 * weighted on cost base.
 *
 * The whole fund total is apportioned across every allocation in the sale and
 * never applied twice: applying each historical adjustment to an
 * already-adjusted base would make the answer depend on the order rows were
 * entered in, which spec 9.1 check 4 exists to catch.
 */
export async function allocationFor(
  finance: FinanceApi,
  stockId: number,
  quantity: number,
  asOf: string,
): Promise<AmitRow[]> {
  const parcels = await listParcels(finance, { stockId });
  const alloc = allocateFifo(parcels, quantity);
  const total = await totalAdjustment(finance, stockId);
  // The denominator is the WHOLE holding, not the units being sold. Selling 30
  // of 100 units bears 30% of the fund adjustment; dividing by the selected
  // rows instead would charge the entire adjustment to every partial sale.
  const wholeFundPre = round4(
    parcels.reduce((s, p) => s + p.quantity * p.price + p.brokerage, 0),
  );
  const pre = alloc.map(({ parcel, quantity: q }) => ({
    parcel,
    quantity: q,
    pre: round4(
      q *
        ((parcel.quantity * parcel.price + parcel.brokerage) / parcel.quantity),
    ),
  }));
  const grandPre = wholeFundPre;
  if (grandPre === 0 || total === 0) {
    return pre.map((r) => ({
      parcel: r.parcel,
      quantity: r.quantity,
      costBasePreAdjustment: r.pre,
      adjustmentShare: 0,
      costBase: r.pre,
    }));
  }
  const rows = pre.map((r) => ({
    parcel: r.parcel,
    quantity: r.quantity,
    costBasePreAdjustment: r.pre,
    adjustmentShare: round4((total * r.pre) / grandPre),
    costBase: 0,
  }));
  // Give any rounding residue to the largest row so the shares sum back to the
  // pro-rata expectation EXACTLY rather than to within a cent. On a full
  // liquidation that expectation is the whole fund total, which is the
  // conservation invariant spec 9.1 check 2 relies on.
  const expected = round4(
    (total * round4(pre.reduce((a, r) => a + r.pre, 0))) / grandPre,
  );
  const summed = round4(rows.reduce((a, r) => a + r.adjustmentShare, 0));
  if (summed !== expected) {
    const residue = round4(expected - summed);
    let biggest = rows[0]!;
    for (const r of rows)
      if (r.adjustmentShare > biggest.adjustmentShare) biggest = r;
    biggest.adjustmentShare = round4(biggest.adjustmentShare + residue);
  }
  for (const r of rows)
    r.costBase = round4(r.costBasePreAdjustment + r.adjustmentShare);
  return rows;
}

/** The fund headline. Spec 9.1: this, not the per-parcel share, is the figure
 *  that goes on the statement. */
export async function applyAdjustments(
  finance: FinanceApi,
  stockId: number,
): Promise<number> {
  return totalAdjustment(finance, stockId);
}

export type { Parcel };
