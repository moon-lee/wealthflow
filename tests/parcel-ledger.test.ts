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
    await createStock(f, {
      stock_code: 'VHY',
      stock_full_name: 'V',
      shares: 22,
    });
    const el = await mount(f);
    const g = el.groups.find((x: any) => x.stockCode === 'VHY');
    expect(g.notTracked).toBe(true);
    expect(el.renderRoot.textContent).toMatch(/not yet tracked/i);
    el.remove();
  });

  it('lists a group latest first, the default order', async () => {
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
    el.selectStock(v.id);
    await el.updateComplete;
    expect(el.expandedParcels(v.id).map((p: any) => p.acquired_date)).toEqual([
      '2026-09-10',
      '2021-09-28',
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
    el.selectStock(v.id);
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
    el.selectStock(v.id);
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
    el.selectStock(v.id);
    await el.updateComplete;
    expect(el.expandedParcels(v.id)[0].quantity).toBe(0.1504);
    expect(el.renderRoot.textContent).toContain('0.1504');
    el.remove();
  });

  it('styles the acquired date like the other logs do', async () => {
    const f: any = createMockFinance();
    const v: any = await createStock(f, {
      stock_code: 'VAS',
      stock_full_name: 'V',
      shares: 0,
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
    el.selectStock(v.id);
    await el.updateComplete;
    // The same class the dividends list and the trade log use for a date
    // cell, so the two read as one product.
    const cell = el.renderRoot.querySelector('tbody td') as any;
    expect(cell.classList.contains('mono')).toBe(true);
    expect(cell.textContent.trim()).toBe('2021-09-28');
    el.remove();
  });

  it('sorts the Acquired column and returns to page one', async () => {
    const f: any = createMockFinance();
    const v: any = await createStock(f, {
      stock_code: 'VAS',
      stock_full_name: 'V',
      shares: 0,
    });
    for (let day = 1; day <= 12; day++) {
      await createTrade(f, {
        stock_id: v.id,
        date: `2024-01-${String(day).padStart(2, '0')}`,
        side: 'buy',
        quantity: 1,
        price: 100,
        brokerage: 0,
      });
    }
    await rebuildParcels(f, v.id);
    const el = await mount(f);
    el.selectStock(v.id);
    await el.updateComplete;

    const dates = (): string[] =>
      [...el.renderRoot.querySelectorAll('tbody tr td:first-child')].map(
        (td: any) => td.textContent.trim(),
      );
    const sortButton = (): any => el.renderRoot.querySelector('th .th-sort');
    const sortState = (): string =>
      (el.renderRoot.querySelector('th[aria-sort]') as any)?.getAttribute(
        'aria-sort',
      );

    // Latest first is the default, and the header says so.
    expect(sortState()).toBe('descending');
    expect(dates()[0]).toBe('2024-01-12');

    // Page two of the old order is not page two of the new one, so a sort
    // returns to the first page.
    el.page = 1;
    await el.updateComplete;
    expect(el.page).toBe(1);
    sortButton().click();
    await el.updateComplete;

    expect(el.page).toBe(0);
    expect(sortState()).toBe('ascending');
    expect(dates()[0]).toBe('2024-01-01');

    sortButton().click();
    await el.updateComplete;
    expect(sortState()).toBe('descending');
    expect(dates()[0]).toBe('2024-01-12');
    el.remove();
  });

  it('opens one card at a time and closes it on a second click', async () => {
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
    el.selectStock(v.id);
    expect(el.selectedStockId).toBe(v.id);
    el.selectStock(v.id);
    expect(el.selectedStockId).toBe(null);
    el.remove();
  });
});

describe('stock list reads derived shares', () => {
  it("shows a tracked holding's units and marks an untracked one", async () => {
    const f: any = createMockFinance();
    const vas: any = await createStock(f, {
      stock_code: 'VAS',
      stock_full_name: 'V',
      shares: 0,
    });
    await createStock(f, {
      stock_code: 'VHY',
      stock_full_name: 'V',
      shares: 22,
    });
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
