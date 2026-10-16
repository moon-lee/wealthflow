import type { FinanceApi } from 'finance';
import type { Parcel } from '../dao/parcels.js';
import { listParcels } from '../dao/parcels.js';
import { totalAdjustment } from '../dao/cost-base-adjustments.js';
import { allocateFifo, computeDisposal } from './cgt-service.js';

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
 * Delegates to `computeDisposal` so the preview and the stored disposal can
 * never disagree. Two copies of this arithmetic is exactly the kind of drift
 * that makes a conservation invariant unverifiable.
 *
 * The whole fund total is apportioned and never applied twice: applying each
 * historical adjustment to an already-adjusted base would make the answer
 * depend on the order rows were entered in, which spec 9.1 check 4 guards.
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
  const denominator = round4(
    parcels.reduce((s, p) => s + p.quantity * p.price + p.brokerage, 0),
  );
  const rows = alloc.map(({ parcel, quantity: q }) => {
    const d = computeDisposal(parcel, q, 0, asOf, { total, denominator });
    return {
      parcel,
      quantity: q,
      costBasePreAdjustment: round4(d.costBase - d.amitShare),
      adjustmentShare: d.amitShare,
      costBase: d.costBase,
    };
  });
  // Give any rounding residue to the largest row so the shares sum back to the
  // pro-rata expectation EXACTLY rather than to within a cent. On a full
  // liquidation that expectation is the whole fund total, which is the
  // conservation invariant spec 9.1 check 2 relies on.
  const selected = round4(
    rows.reduce((a, r) => a + r.costBasePreAdjustment, 0),
  );
  const expected = round4((total * selected) / denominator);
  const summed = round4(rows.reduce((a, r) => a + r.adjustmentShare, 0));
  if (summed !== expected) {
    const residue = round4(expected - summed);
    let biggest = rows[0]!;
    for (const r of rows)
      if (r.adjustmentShare > biggest.adjustmentShare) biggest = r;
    biggest.adjustmentShare = round4(biggest.adjustmentShare + residue);
    biggest.costBase = round4(
      biggest.costBasePreAdjustment + biggest.adjustmentShare,
    );
  }
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
