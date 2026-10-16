import { describe, it, expect } from 'vitest';
import { createMockFinance } from '../src/mock/finance-mock.js';
import { createStock } from '../src/dao/stocks.js';
import { listDividends } from '../src/dao/dividends.js';
import { listTrades, updateTrade } from '../src/dao/trades.js';
import { listParcels } from '../src/dao/parcels.js';
import { listAdjustments } from '../src/dao/cost-base-adjustments.js';
import { rebuildParcels } from '../src/services/parcel-service.js';
import {
  logDividendWithDrp,
  deleteDividendWithDrp,
} from '../src/services/drp-service.js';
import {
  allocationFor,
  applyAdjustments,
} from '../src/services/amit-service.js';

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

async function fund() {
  const f: any = createMockFinance();
  const s: any = await createStock(f, {
    stock_code: 'VAS',
    stock_full_name: 'V',
    shares: 0,
  });
  return { f, s };
}

const div = (s: any, over: Record<string, unknown> = {}) => ({
  stock_id: s.id,
  date: '2026-07-16',
  type: 'trust',
  gross: 89.18,
  franking: 12.74,
  notes: null,
  ...over,
});

describe('logDividendWithDrp — the coupled write (spec 6.4)', () => {
  it('writes the dividend AND the parcel, or the reader can see both', async () => {
    const { f, s } = await fund();
    const out = await logDividendWithDrp(f, div(s), {
      amountReinvested: 85.0,
      unitsAcquired: 0.9136,
    });
    expect((await listDividends(f)).length).toBe(1);
    const trades = await listTrades(f);
    expect(trades).toHaveLength(1);
    expect(trades[0].source).toBe('drp');
    expect(trades[0].side).toBe('buy');
    expect(trades[0].dividend_id).toBe(out.dividend.id);
    // Derived DRP price, NOT the market price and NOT derived from gross.
    expect(trades[0].price).toBeCloseTo(85 / 0.9136, 6);
  });

  it('derives the DRP price from the amount actually reinvested', async () => {
    // The real 18 Jul 2023 case: $89.18 distribution, $45.34 reinvested. They do
    // not reconcile, and the parcel must be built from the reinvested figure.
    const { f, s } = await fund();
    await logDividendWithDrp(f, div(s, { date: '2023-07-18', gross: 89.18 }), {
      amountReinvested: 45.34,
      unitsAcquired: 0.4,
    });
    const [t] = await listTrades(f);
    expect(t.price).toBeCloseTo(45.34 / 0.4, 6);
    expect(t.price).not.toBeCloseTo(89.18 / 0.4, 6);
  });

  it('writes only the dividend when the DRP box is off', async () => {
    const { f, s } = await fund();
    await logDividendWithDrp(f, div(s), null);
    expect((await listDividends(f)).length).toBe(1);
    expect(await listTrades(f)).toHaveLength(0);
  });

  it('treats a zero-unit DRP as income only, and says why', async () => {
    // VHY 16 Jul 2026: a $12.44 DRP that bought nothing.
    const { f, s } = await fund();
    const out = await logDividendWithDrp(f, div(s, { gross: 12.44 }), {
      amountReinvested: 12.44,
      unitsAcquired: 0,
    });
    expect(out.trade).toBeNull();
    expect(out.note).toMatch(/0 units/i);
    expect((await listDividends(f)).length).toBe(1);
    expect(await listTrades(f)).toHaveLength(0);
  });

  it('keeps the income when a DRP bought nothing, rather than discarding both', async () => {
    // The dividend was paid regardless of how the reinvestment rounded. Losing
    // the income because no parcel resulted would understate the assessment.
    const { f, s } = await fund();
    const out = await logDividendWithDrp(f, div(s), {
      amountReinvested: 85,
      unitsAcquired: 0,
    });
    expect((await listDividends(f)).length).toBe(1);
    expect(out.trade).toBeNull();
    expect(out.note).toMatch(/0 units/i);
  });

  it('refuses a DRP with units but no money, which has no price', async () => {
    const { f, s } = await fund();
    await expect(
      logDividendWithDrp(f, div(s), {
        amountReinvested: 0,
        unitsAcquired: 1,
      }),
    ).rejects.toThrow(/price|reinvested/i);
    expect(await listDividends(f)).toHaveLength(0);
  });

  it('refuses negative money or units', async () => {
    const { f, s } = await fund();
    await expect(
      logDividendWithDrp(f, div(s), {
        amountReinvested: -5,
        unitsAcquired: 1,
      }),
    ).rejects.toThrow(/reinvested/i);
    await expect(
      logDividendWithDrp(f, div(s), {
        amountReinvested: 5,
        unitsAcquired: -1,
      }),
    ).rejects.toThrow(/units/i);
  });
});

describe('the coupled write rolls back when the parcel write fails', () => {
  it('leaves no dividend behind when the trade insert throws', async () => {
    const { f, s } = await fund();
    const boom: any = new Error('host rejected the insert');
    const table = f.db.table.bind(f.db);
    f.db.table = (name: string) => {
      const t = table(name);
      if (name !== 'wealthflow_trades') return t;
      return {
        ...t,
        insert: async () => {
          throw boom;
        },
      };
    };
    await expect(
      logDividendWithDrp(f, div(s), { amountReinvested: 85, unitsAcquired: 1 }),
    ).rejects.toThrow(/host rejected/);
    // The compensation is the point: an income row with no parcel is exactly
    // the half-recorded state spec 6.4 forbids.
    expect(await listDividends(f)).toHaveLength(0);
  });

  it('restores the prior dividend values when an EDIT is rolled back', async () => {
    const { f, s } = await fund();
    const first = await logDividendWithDrp(f, div(s, { gross: 100 }), null);
    const boom: any = new Error('nope');
    const table = f.db.table.bind(f.db);
    f.db.table = (name: string) => {
      const t = table(name);
      if (name !== 'wealthflow_trades') return t;
      return {
        ...t,
        insert: async () => {
          throw boom;
        },
      };
    };
    await expect(
      logDividendWithDrp(
        f,
        div(s, { gross: 999 }),
        { amountReinvested: 85, unitsAcquired: 1 },
        { dividendId: first.dividend.id },
      ),
    ).rejects.toThrow(/nope/);
    const rows = await listDividends(f);
    expect(rows).toHaveLength(1);
    expect(rows[0].gross).toBe(100);
  });
});

describe('AMIT allocation (spec 6.1 and 9.1)', () => {
  /** The synthetic fixture: 100 units at $100, one -1000 adjustment. */
  async function synthetic() {
    const { f, s } = await fund();
    await logDividendWithDrp(f, div(s, { date: '2023-07-18' }), {
      amountReinvested: 10000,
      unitsAcquired: 100,
    });
    await f.db.table('wealthflow_cost_base_adjustments').insert({
      stock_id: s.id,
      date: '2023-08-01',
      amount: -1000,
      reason: 'AMIT cost base reduction',
    });
    await rebuildParcels(f, s.id);
    return { f, s };
  }

  it('takes a proportional share of the FUND adjustment', async () => {
    const { f, s } = await synthetic();
    const parcels = await listParcels(f, { stockId: s.id });
    const rows = await allocationFor(f, s.id, 30, '2026-10-16');
    expect(rows).toHaveLength(1);
    expect(rows[0].costBasePreAdjustment).toBeCloseTo(3000, 4);
    expect(rows[0].adjustmentShare).toBeCloseTo(-300, 4);
    expect(rows[0].costBase).toBeCloseTo(2700, 4);
    expect(parcels).toHaveLength(1);
  });

  it('conserves the whole adjustment across a full liquidation', async () => {
    const { f, s } = await synthetic();
    const all = await allocationFor(f, s.id, 100, '2026-10-16');
    expect(all.reduce((a, r) => a + r.costBase, 0)).toBeCloseTo(9000, 4);
    expect(all.reduce((a, r) => a + r.adjustmentShare, 0)).toBeCloseTo(
      -1000,
      4,
    );
  });

  it('does not depend on the order adjustments were entered in', async () => {
    const { f, s } = await synthetic();
    const shuffled = createMockFinance();
    const s2: any = await createStock(shuffled, {
      stock_code: 'VAS',
      stock_full_name: 'V',
      shares: 0,
    });
    await logDividendWithDrp(shuffled, div(s2, { date: '2023-07-18' }), {
      amountReinvested: 10000,
      unitsAcquired: 100,
    });
    // Same total, opposite order and an extra zero row in between.
    await shuffled.db.table('wealthflow_cost_base_adjustments').insert({
      stock_id: s2.id,
      date: '2024-01-01',
      amount: 0,
      reason: 'nil',
    });
    await shuffled.db.table('wealthflow_cost_base_adjustments').insert({
      stock_id: s2.id,
      date: '2025-01-01',
      amount: -1000,
      reason: 'AMIT',
    });
    await rebuildParcels(shuffled, s2.id);
    const a = await allocationFor(f, s.id, 30, '2026-10-16');
    const b = await allocationFor(shuffled, s2.id, 30, '2026-10-16');
    expect(b[0].adjustmentShare).toBeCloseTo(a[0].adjustmentShare, 10);
    expect(b[0].costBase).toBeCloseTo(a[0].costBase, 10);
  });

  it('computes at 4dp so the shares add back to the fund total', async () => {
    // A separate fund: the real magnitudes are cents, and burying them under
    // the synthetic -1000 would hide exactly the rounding this checks.
    const { f, s } = await fund();
    await logDividendWithDrp(f, div(s, { date: '2023-01-02' }), {
      amountReinvested: 3000,
      unitsAcquired: 30,
    });
    await logDividendWithDrp(f, div(s, { date: '2023-06-02' }), {
      amountReinvested: 7000,
      unitsAcquired: 70,
    });
    // The owner's actual VAS series: mostly zero, two real entries.
    for (const r of [
      { date: '2022-07-18', amount: -3.19 },
      { date: '2023-07-18', amount: 0 },
      { date: '2024-07-16', amount: 0 },
      { date: '2025-07-15', amount: 0 },
      { date: '2026-07-16', amount: 0.55 },
    ])
      await f.db.table('wealthflow_cost_base_adjustments').insert({
        stock_id: s.id,
        date: r.date,
        amount: r.amount,
        reason: 'AMIT',
      });
    await rebuildParcels(f, s.id);
    const total = (await listAdjustments(f, s.id)).reduce(
      (a, r) => a + r.amount,
      0,
    );
    expect(total).toBeCloseTo(-2.64, 4);
    const all = await allocationFor(f, s.id, 100, '2026-10-16');
    const summed = round4(all.reduce((a, r) => a + r.adjustmentShare, 0));
    // EXACT, not "within a cent": spec 9.1 makes full-liquidation conservation
    // the load-bearing check, so it has to hold to the last 4dp.
    expect(summed).toBeCloseTo(total, 10);
  });

  it('gives a fund with no adjustments a zero share, not a null', async () => {
    const { f, s } = await fund();
    await logDividendWithDrp(f, div(s), {
      amountReinvested: 5000,
      unitsAcquired: 50,
    });
    await rebuildParcels(f, s.id);
    const rows = await allocationFor(f, s.id, 50, '2026-10-16');
    expect(rows[0].adjustmentShare).toBe(0);
    expect(rows[0].costBase).toBeCloseTo(5000, 4);
  });

  it('splits the fund adjustment across parcels pro-rata on cost base', async () => {
    const { f, s } = await fund();
    await logDividendWithDrp(f, div(s, { date: '2023-01-02' }), {
      amountReinvested: 3000,
      unitsAcquired: 30,
    });
    await logDividendWithDrp(f, div(s, { date: '2023-06-02' }), {
      amountReinvested: 7000,
      unitsAcquired: 70,
    });
    await f.db.table('wealthflow_cost_base_adjustments').insert({
      stock_id: s.id,
      date: '2023-08-01',
      amount: -1000,
      reason: 'AMIT',
    });
    await rebuildParcels(f, s.id);
    const rows = await allocationFor(f, s.id, 100, '2026-10-16');
    expect(rows).toHaveLength(2);
    expect(rows[0].costBasePreAdjustment).toBeCloseTo(3000, 4);
    expect(rows[1].costBasePreAdjustment).toBeCloseTo(7000, 4);
    expect(rows[0].adjustmentShare).toBeCloseTo(-300, 4);
    expect(rows[1].adjustmentShare).toBeCloseTo(-700, 4);
  });
});

describe('applyAdjustments — the headline figure', () => {
  it('returns the fund total rather than a per-parcel share', async () => {
    const { f, s } = await fund();
    await f.db.table('wealthflow_cost_base_adjustments').insert({
      stock_id: s.id,
      date: '2022-07-18',
      amount: -3.19,
      reason: 'AMIT',
    });
    await f.db.table('wealthflow_cost_base_adjustments').insert({
      stock_id: s.id,
      date: '2026-07-16',
      amount: 0.55,
      reason: 'AMIT',
    });
    const applied = await applyAdjustments(f, s.id);
    expect(applied).toBeCloseTo(-2.64, 4);
    expect(await applyAdjustments(f, 99999)).toBe(0);
  });
});

describe('deleteDividendWithDrp', () => {
  it('takes the DRP trade with the dividend, so no orphan parcel survives', async () => {
    const { f, s } = await fund();
    const out = await logDividendWithDrp(f, div(s), {
      amountReinvested: 85,
      unitsAcquired: 1,
    });
    expect(out.trade).not.toBeNull();
    await deleteDividendWithDrp(f, out.dividend.id);
    expect(await listDividends(f)).toHaveLength(0);
    expect(await listTrades(f)).toHaveLength(0);
  });

  it('is safe to call on a dividend that never had a DRP', async () => {
    const { f, s } = await fund();
    const out = await logDividendWithDrp(f, div(s), null);
    await deleteDividendWithDrp(f, out.dividend.id);
    expect(await listDividends(f)).toHaveLength(0);
  });

  it('lets a DRP trade be edited independently without touching income', async () => {
    const { f, s } = await fund();
    const out = await logDividendWithDrp(f, div(s), {
      amountReinvested: 85,
      unitsAcquired: 1,
    });
    await updateTrade(f, out.trade.id, { quantity: 2 });
    expect((await listDividends(f))[0].gross).toBe(89.18);
    expect((await listTrades(f))[0].quantity).toBe(2);
  });
});
