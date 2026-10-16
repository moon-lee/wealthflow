import { describe, it, expect } from 'vitest';
import {
  allocateFifo,
  adjustmentFor,
  computeDisposal,
  summariseYear,
  netGains,
} from '../src/services/cgt-service.js';
import type { Parcel } from '../src/dao/parcels.js';

const parcel = (
  id: number,
  acquired: string,
  quantity: number,
  price: number,
  brokerage = 0,
): Parcel => ({
  id,
  stock_id: 1,
  origin_trade_id: id,
  acquired_date: acquired,
  quantity,
  price,
  brokerage,
});

/** The fixture from spec 6.2. Two VAS parcels, one VHY. */
const PARCELS: Parcel[] = [
  parcel(1, '2024-03-15', 20, 95.4, 3), // $1,911.00, eligible
  parcel(2, '2025-11-20', 15, 102.1, 3), // $1,534.50, 11 months on 2026-10-16
];

describe('adjustmentFor', () => {
  it('discounts only once held 12 calendar months', () => {
    expect(adjustmentFor('2024-03-15', '2026-10-16').eligible).toBe(true);
    expect(adjustmentFor('2025-11-20', '2026-10-16').eligible).toBe(false);
    expect(adjustmentFor('2025-10-16', '2026-10-16').eligible).toBe(true);
    expect(adjustmentFor('2025-10-17', '2026-10-16').eligible).toBe(false);
  });

  it('is keyed on dates, so the 2027 regime can be registered alongside', () => {
    const a = adjustmentFor('2020-01-01', '2026-12-31');
    expect(a.eligible).toBe(true);
    expect(a.factor).toBe(0.5);
  });
});

describe('allocateFifo', () => {
  it('consumes oldest acquisition first, across parcel boundaries', () => {
    const a = allocateFifo(PARCELS, 25);
    expect(a).toEqual([
      { parcel: PARCELS[0], quantity: 20 },
      { parcel: PARCELS[1], quantity: 5 },
    ]);
  });

  it('consumes a partial first parcel when the sale is smaller', () => {
    const a = allocateFifo(PARCELS, 12);
    expect(a).toEqual([{ parcel: PARCELS[0], quantity: 12 }]);
  });

  it('refuses to sell more than is held, and says how much is held', () => {
    expect(() => allocateFifo(PARCELS, 36)).toThrow(/35 units on hand/i);
    expect(() => allocateFifo(PARCELS, 36)).toThrow(/selling 36/i);
  });

  it('allows selling the entire holding', () => {
    expect(allocateFifo(PARCELS, 35).reduce((s, r) => s + r.quantity, 0)).toBe(
      35,
    );
  });

  it('refuses a zero or negative quantity', () => {
    expect(() => allocateFifo(PARCELS, 0)).toThrow(/quantity/i);
    expect(() => allocateFifo(PARCELS, -1)).toThrow(/quantity/i);
  });

  it('never emits a zero-quantity row', () => {
    const a = allocateFifo(PARCELS, 20);
    expect(a).toHaveLength(1);
    expect(a[0].quantity).toBe(20);
  });
});

describe('computeDisposal — spec 6.2 acceptance fixture', () => {
  it('nets a loss against a gain BEFORE the discount, not after', () => {
    // The sale is 25 units: 20 from the eligible parcel, 5 from the 11-month one.
    const [eligible, ineligible] = computeSale(PARCELS, 25, 112, '2026-10-16');
    expect(eligible.quantity).toBe(20);
    expect(eligible.proceeds).toBe(2240);
    expect(eligible.costBase).toBe(1911);
    expect(eligible.nominalGain).toBe(329);
    expect(eligible.discountApplied).toBe(-164.5);
    expect(eligible.netGain).toBe(164.5);

    expect(ineligible.quantity).toBe(5);
    expect(ineligible.proceeds).toBe(560);
    // Proportional, not "the whole brokerage again": the parcel's basis is
    // 1534.50 over 15 units, so 5 units is 511.50. Charging the $3 twice would
    // inflate the gain by $3 every time the parcel is partly sold.
    expect(ineligible.costBase).toBe(511.5);
    expect(ineligible.nominalGain).toBe(48.5);
    // Not held a year: no discount at all.
    expect(ineligible.discountApplied).toBe(0);
    expect(ineligible.netGain).toBe(48.5);
  });

  it('shrinks a loss on an eligible parcel, signed positive', () => {
    // Real VHY shape: 30 units at a $2,523.00 basis; selling 10 takes $841.00
    // of it and realises $820.00.
    const vhy = parcel(3, '2023-08-08', 30, 84, 3);
    const d = computeDisposal(vhy, 10, 82, '2026-10-16');
    expect(d.costBase).toBe(841);
    expect(d.proceeds).toBe(820);
    expect(d.nominalGain).toBe(-21);
    // A discounted LOSS shrinks, so the adjustment is positive.
    expect(d.adjustment ?? d.discountApplied).toBeGreaterThan(0);
    expect(d.discountApplied).toBe(10.5);
    expect(d.netGain).toBe(-10.5);
  });

  it('conserves cost base across the whole holding', () => {
    const all = computeSale(PARCELS, 35, 112, '2026-10-16');
    const expected = PARCELS.reduce(
      (s, p) => s + p.quantity * p.price + p.brokerage,
      0,
    );
    expect(all.reduce((s, d) => s + d.costBase, 0)).toBeCloseTo(expected, 4);
  });
});

function computeSale(
  parcels: Parcel[],
  qty: number,
  price: number,
  on: string,
) {
  return allocateFifo(parcels, qty).map((a) =>
    computeDisposal(a.parcel, a.quantity, price, on),
  );
}

describe('netGains — the two-bucket rule', () => {
  it('discounts only the eligible bucket, then adds the ineligible one', () => {
    const rows = [
      { nominalGain: 329, eligible: true, netGain: 164.5 },
      { nominalGain: 48.5, eligible: false, netGain: 48.5 },
      { nominalGain: -21, eligible: true, netGain: -10.5 },
    ];
    const r = netGains(rows);
    expect(r.eligibleNet).toBeCloseTo(308, 4);
    expect(r.ineligibleNet).toBeCloseTo(48.5, 4);
    expect(r.netGain).toBeCloseTo(202.5, 4);
    expect(r.adjustment).toBeCloseTo(-154, 4);
  });

  it('matches the spec 6.2 totals exactly', () => {
    const [vasEligible, vasIneligible] = computeSale(
      PARCELS,
      25,
      112,
      '2026-10-16',
    );
    const vhy = parcel(3, '2023-08-08', 30, 84, 3);
    const vhyDisposal = computeDisposal(vhy, 10, 82, '2026-10-16');
    const r = netGains([vasEligible, vasIneligible, vhyDisposal]);
    expect(r.gross).toBeCloseTo(377.5, 4);
    expect(r.losses).toBeCloseTo(-21, 4);
    // Only the eligible bucket is halved: (329 - 21) / 2 = 154.
    expect(r.eligibleNet).toBeCloseTo(308, 4);
    expect(r.ineligibleNet).toBeCloseTo(48.5, 4);
    expect(r.adjustment).toBeCloseTo(-154, 4);
    expect(r.netGain).toBeCloseTo(202.5, 4);
  });
});

describe('summariseYear', () => {
  const rows = [
    {
      stockId: 1,
      stockCode: 'VAS',
      disposalDate: '2026-10-16',
      proceeds: 2800,
      costBase: 2422.5,
      nominalGain: 377.5,
      adjustment: -164.5,
      netGain: 213,
    },
    {
      stockId: 2,
      stockCode: 'VHY',
      disposalDate: '2026-10-16',
      proceeds: 820,
      costBase: 841,
      nominalGain: -21,
      adjustment: 10.5,
      netGain: -10.5,
    },
  ];

  it('produces the four Overview cards', () => {
    const s = summariseYear(rows, '2026-2027', 0);
    expect(s.financialYear).toBe('2026-2027');
    expect(s.grossGain).toBeCloseTo(377.5, 4);
    expect(s.lossesApplied).toBeCloseTo(-21, 4);
    expect(s.adjustment).toBeCloseTo(-154, 4);
    expect(s.netGain).toBeCloseTo(202.5, 4);
    expect(s.carriedForwardLoss).toBe(0);
    expect(s.hasOpeningBalance).toBe(false);
  });

  it('breaks the same figures out per stock', () => {
    const s = summariseYear(rows, '2026-2027', 0);
    const vas = s.byStock.find((r) => r.stockCode === 'VAS')!;
    expect(vas.disposals).toBe(1);
    expect(vas.netGain).toBeCloseTo(213, 4);
    const vhy = s.byStock.find((r) => r.stockCode === 'VHY')!;
    expect(vhy.netGain).toBeCloseTo(-10.5, 4);
  });

  it('draws down an opening carried-forward loss before reporting a gain', () => {
    const s = summariseYear(rows, '2026-2027', 500);
    expect(s.carriedForwardLoss).toBe(500);
    expect(s.hasOpeningBalance).toBe(true);
    // 500 absorbs the 202.50 net gain, leaving 297.50 carried forward.
    expect(s.netGain).toBeCloseTo(0, 4);
    expect(s.carriedForwardOut).toBeCloseTo(297.5, 4);
  });

  it('grows the carried-forward balance when the year is a net loss', () => {
    const s = summariseYear(rows, '2026-2027', -0);
    expect(s.carriedForwardOut).toBe(0);
    const losing = summariseYear(
      [
        {
          stockId: 3,
          stockCode: 'FGX',
          disposalDate: '2026-10-16',
          proceeds: 0,
          costBase: 200,
          nominalGain: -200,
          adjustment: -100,
          netGain: -100,
        },
      ],
      '2026-2027',
      50,
    );
    expect(losing.netGain).toBe(0);
    expect(losing.carriedForwardOut).toBe(150);
  });

  it('reports a year with no disposals as zero, not as missing', () => {
    const s = summariseYear([], '2026-2027', 0);
    expect(s.grossGain).toBe(0);
    expect(s.lossesApplied).toBe(0);
    expect(s.netGain).toBe(0);
    expect(s.byStock).toEqual([]);
  });
});
