import { describe, it, expect } from 'vitest';
import { createMockFinance } from '../src/mock/finance-mock.js';
import { createStock } from '../src/dao/stocks.js';
import { createTrade } from '../src/dao/trades.js';
import { rebuildParcels } from '../src/services/parcel-service.js';
import { rebuildDisposals } from '../src/services/trade-service.js';
import { totalAdjustmentAsOf } from '../src/dao/cost-base-adjustments.js';
import { openCostBase } from '../src/services/amit-service.js';

describe('AMIT as of a date', () => {
  it('excludes an adjustment that had not happened yet', async () => {
    const f: any = createMockFinance();
    const s: any = await createStock(f, {
      stock_code: 'VAS',
      stock_full_name: 'V',
      shares: 0,
    });
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
    expect(await totalAdjustmentAsOf(f, s.id, '2024-01-01')).toBeCloseTo(
      -3.19,
      4,
    );
    expect(await totalAdjustmentAsOf(f, s.id, '2026-12-31')).toBeCloseTo(
      -2.64,
      4,
    );
  });

  it('computes the open position cost base on the post-AMIT basis', async () => {
    const f: any = createMockFinance();
    const s: any = await createStock(f, {
      stock_code: 'VAS',
      stock_full_name: 'V',
      shares: 0,
    });
    await createTrade(f, {
      stock_id: s.id,
      date: '2023-01-02',
      side: 'buy',
      quantity: 100,
      price: 100,
      brokerage: 0,
    });
    await f.db.table('wealthflow_cost_base_adjustments').insert({
      stock_id: s.id,
      date: '2023-08-01',
      amount: -1000,
      reason: 'AMIT',
    });
    await rebuildParcels(f, s.id);
    const open = await openCostBase(f, s.id, '2026-10-16');
    expect(open.preAdjustment).toBeCloseTo(10000, 4);
    expect(open.amitShare).toBeCloseTo(-1000, 4);
    expect(open.costBase).toBeCloseTo(9000, 4);
  });

  it('gives the REMAINING units their share after a partial sale', async () => {
    const f: any = createMockFinance();
    const s: any = await createStock(f, {
      stock_code: 'VAS',
      stock_full_name: 'V',
      shares: 0,
    });
    await createTrade(f, {
      stock_id: s.id,
      date: '2023-01-02',
      side: 'buy',
      quantity: 100,
      price: 100,
      brokerage: 0,
    });
    await f.db.table('wealthflow_cost_base_adjustments').insert({
      stock_id: s.id,
      date: '2023-08-01',
      amount: -1000,
      reason: 'AMIT',
    });
    await rebuildParcels(f, s.id);
    await createTrade(f, {
      stock_id: s.id,
      date: '2026-01-02',
      side: 'sell',
      quantity: 30,
      price: 150,
    });
    await rebuildDisposals(f, s.id);
    // 70 units left, and the sold 30 already bore their $300 of the fund
    // adjustment. The open units bear the other $700.
    const open = await openCostBase(f, s.id, '2026-10-16');
    expect(open.preAdjustment).toBeCloseTo(7000, 4);
    expect(open.amitShare).toBeCloseTo(-700, 4);
    expect(open.costBase).toBeCloseTo(6300, 4);
  });

  it('returns zeroes for a holding with no adjustment', async () => {
    const f: any = createMockFinance();
    const s: any = await createStock(f, {
      stock_code: 'FGX',
      stock_full_name: 'F',
      shares: 0,
    });
    await createTrade(f, {
      stock_id: s.id,
      date: '2023-01-02',
      side: 'buy',
      quantity: 100,
      price: 10,
      brokerage: 0,
    });
    await rebuildParcels(f, s.id);
    const open = await openCostBase(f, s.id, '2026-10-16');
    expect(open.amitShare).toBe(0);
    expect(open.costBase).toBeCloseTo(1000, 4);
  });
});
