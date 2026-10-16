// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { createMockFinance } from '../src/mock/finance-mock.js';
import { createStock } from '../src/dao/stocks.js';
import { createTrade } from '../src/dao/trades.js';
import { rebuildParcels } from '../src/services/parcel-service.js';
import '../src/ui/parcel-ledger.js';
import '../src/ui/stock-list.js';

const ASOF = '2026-10-16';

async function mount(f: any) {
  const el = document.createElement('parcel-ledger') as any;
  document.body.appendChild(el);
  await el.setFinance(f);
  el.asOf = ASOF;
  await el.reload();
  await el.updateComplete;
  return el;
}

describe('parcel ledger', () => {
  it('groups by holding and counts units and parcels', async () => {
    const f: any = createMockFinance();
    const vas: any = await createStock(f, {
      stock_code: 'VAS',
      stock_full_name: 'V',
      shares: 0,
    });
    await createTrade(f, {
      stock_id: vas.id,
      date: '2021-09-28',
      side: 'buy',
      quantity: 11,
      price: 94.93,
      brokerage: 9.5,
    });
    await createTrade(f, {
      stock_id: vas.id,
      date: '2026-10-16',
      side: 'buy',
      quantity: 1,
      price: 108.8611,
    });
    await rebuildParcels(f, vas.id);
    const el = await mount(f);
    const g = el.groups.find((x: any) => x.stockCode === 'VAS');
    expect(g.units).toBe(12);
    expect(g.parcelCount).toBe(2);
    expect(g.notTracked).toBe(false);
    el.remove();
  });

  it('marks a holding with no trades as notTracked, never as zero units', async () => {
    const f: any = createMockFinance();
    await createStock(f, { stock_code: 'VHY', stock_full_name: 'V', shares: 22 });
    const el = await mount(f);
    const g = el.groups.find((x: any) => x.stockCode === 'VHY');
    expect(g.notTracked).toBe(true);
    expect(el.renderRoot.textContent).toMatch(/not yet tracked/i);
    el.remove();
  });

  it('lists a group oldest first, because that is FIFO order', async () => {
    const f: any = createMockFinance();
    const v: any = await createStock(f, {
      stock_code: 'VAS',
      stock_full_name: 'V',
      shares: 0,
    });
    await createTrade(f, {
      stock_id: v.id,
      date: '2026-09-10',
      side: 'buy',
      quantity: 7,
      price: 110,
      brokerage: 3,
    });
    await createTrade(f, {
      stock_id: v.id,
      date: '2021-09-28',
      side: 'buy',
      quantity: 11,
      price: 94.93,
      brokerage: 9.5,
    });
    await rebuildParcels(f, v.id);
    const el = await mount(f);
    el.toggleGroup(v.id);
    await el.updateComplete;
    expect(el.expandedParcels(v.id).map((p: any) => p.acquired_date)).toEqual([
      '2021-09-28',
      '2026-09-10',
    ]);
    el.remove();
  });

  it('reports a live countdown rather than a bare date', async () => {
    const f: any = createMockFinance();
    const v: any = await createStock(f, {
      stock_code: 'VAS',
      stock_full_name: 'V',
      shares: 0,
    });
    await createTrade(f, {
      stock_id: v.id,
      date: '2026-09-10',
      side: 'buy',
      quantity: 7,
      price: 110,
      brokerage: 3,
    });
    await rebuildParcels(f, v.id);
    const el = await mount(f);
    el.toggleGroup(v.id);
    await el.updateComplete;
    expect(el.expandedParcels(v.id)[0].discountLabel).toBe('In 11 months');
    el.remove();
  });

  it('says "Eligible today" for a parcel that crosses its line on this date', async () => {
    const f: any = createMockFinance();
    const v: any = await createStock(f, {
      stock_code: 'VAS',
      stock_full_name: 'V',
      shares: 0,
    });
    await createTrade(f, {
      stock_id: v.id,
      date: '2025-10-16',
      side: 'buy',
      quantity: 2,
      price: 109.8171,
    });
    await rebuildParcels(f, v.id);
    const el = await mount(f);
    el.toggleGroup(v.id);
    await el.updateComplete;
    expect(el.expandedParcels(v.id)[0].discountLabel).toBe('Eligible today');
    el.remove();
  });

  it('carries a 0.1504-unit parcel through without rounding it away', async () => {
    const f: any = createMockFinance();
    const v: any = await createStock(f, {
      stock_code: 'VHY',
      stock_full_name: 'V',
      shares: 0,
    });
    await createTrade(f, {
      stock_id: v.id,
      date: '2026-07-16',
      side: 'buy',
      quantity: 0.1504,
      price: 82.7065,
      source: 'drp',
    });
    await rebuildParcels(f, v.id);
    const el = await mount(f);
    el.toggleGroup(v.id);
    await el.updateComplete;
    expect(el.expandedParcels(v.id)[0].quantity).toBe(0.1504);
    expect(el.renderRoot.textContent).toContain('0.1504');
    el.remove();
  });

  it('collapses and expands a group', async () => {
    const f: any = createMockFinance();
    const v: any = await createStock(f, {
      stock_code: 'VAS',
      stock_full_name: 'V',
      shares: 0,
    });
    await createTrade(f, {
      stock_id: v.id,
      date: '2025-01-17',
      side: 'buy',
      quantity: 2,
      price: 100.7245,
    });
    await rebuildParcels(f, v.id);
    const el = await mount(f);
    el.toggleGroup(v.id);
    expect(el.expanded.has(v.id)).toBe(true);
    el.toggleGroup(v.id);
    expect(el.expanded.has(v.id)).toBe(false);
    el.remove();
  });
});

describe('stock list reads derived shares', () => {
  it('shows a tracked holding\'s units and marks an untracked one', async () => {
    const f: any = createMockFinance();
    const vas: any = await createStock(f, {
      stock_code: 'VAS',
      stock_full_name: 'V',
      shares: 0,
    });
    await createStock(f, { stock_code: 'VHY', stock_full_name: 'V', shares: 22 });
    await createTrade(f, {
      stock_id: vas.id,
      date: '2025-01-17',
      side: 'buy',
      quantity: 2,
      price: 100.7245,
    });
    await rebuildParcels(f, vas.id);

    const list = document.createElement('stock-list') as any;
    document.body.appendChild(list);
    await list.setFinance(f);
    await list.updateComplete;
    expect(list.tracked.has(vas.id)).toBe(true);
    expect(list.tracked.has(2)).toBe(false);
    // VHY has no parcels, so its derived 0 must never be shown as if it were
    // a real holding of nothing.
    expect(list.renderRoot.textContent).toMatch(/not yet tracked/i);
    list.remove();
  });
});