// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { createMockFinance } from '../src/mock/finance-mock.js';
import { createStock, listStocks } from '../src/dao/stocks.js';
import { recordTrade } from '../src/services/holding-service.js';
import '../src/ui/stock-form.js';
import '../src/ui/stock-list.js';

const flush = () => new Promise((r) => setTimeout(r, 0));

async function mountForm(f: any): Promise<any> {
  const el: any = document.createElement('stock-form');
  document.body.appendChild(el);
  await el.setFinance(f);
  await el.updateComplete;
  return el;
}

async function mountList(f: any): Promise<any> {
  const el: any = document.createElement('stock-list');
  document.body.appendChild(el);
  await el.setFinance(f);
  await el.updateComplete;
  return el;
}

/** The Shares box, wherever the stock screen is showing it. */
function sharesInput(root: any): any {
  return root.querySelector('input[aria-label="Shares"]');
}

describe('shares are derived, never typed', () => {
  it('adds a holding from code and name alone, at zero shares', async () => {
    const f: any = createMockFinance();
    const el = await mountForm(f);
    el.stockCode = 'CBA';
    el.stockName = 'Commonwealth Bank';
    await el.updateComplete;

    // The field is derived data, so it must neither be required nor block Add.
    expect(el.canSave).toBe(true);
    const input = sharesInput(el.renderRoot);
    expect(input.readOnly).toBe(true);
    expect(input.value).toBe('0');

    await el.onSubmit({ preventDefault() {} });
    const [row] = await listStocks(f, { status: 'all' });
    expect(row!.stock_code).toBe('CBA');
    expect(row!.shares).toBe(0);
    el.remove();
  });

  it('shows the trade log quantity, read-only, when editing a holding', async () => {
    const f: any = createMockFinance();
    const s: any = await createStock(f, {
      stock_code: 'VAS',
      stock_full_name: 'Vanguard Australian Shares',
      shares: 0,
    });
    await recordTrade(f, {
      stock_id: s.id,
      date: '2026-08-01',
      side: 'buy',
      quantity: 100,
      price: 10,
      brokerage: 0,
    });

    const list = await mountList(f);
    await list.startEdit(s);
    await flush();
    await list.updateComplete;

    const input = sharesInput(list.renderRoot.querySelector('tr.editing'));
    expect(input.readOnly).toBe(true);
    expect(input.value).toBe('100');
    // A derived number can never gate the save either.
    expect(list.canSaveEdit).toBe(true);
    list.remove();
  });

  it('says "not yet tracked" rather than repeating a stale number', async () => {
    const f: any = createMockFinance();
    const s: any = await createStock(f, {
      stock_code: 'VHY',
      stock_full_name: 'Vanguard Australian Shares High Yield',
      shares: 22,
    });

    const list = await mountList(f);
    await list.startEdit(s);
    await flush();
    await list.updateComplete;

    const input = sharesInput(list.renderRoot.querySelector('tr.editing'));
    expect(input.readOnly).toBe(true);
    expect(input.value).toBe('');
    expect(input.placeholder).toMatch(/not yet tracked/i);
    list.remove();
  });

  it('saves an edit without touching the derived quantity', async () => {
    const f: any = createMockFinance();
    const s: any = await createStock(f, {
      stock_code: 'VHY',
      stock_full_name: 'Vanguard Australian Shares High Yield',
      shares: 22,
    });

    const list = await mountList(f);
    await list.startEdit(s);
    await flush();
    await list.updateComplete;
    list.editStockName = 'Vanguard High Yield';
    await list.saveEdit(s);

    const [row] = await listStocks(f, { status: 'all' });
    expect(row!.stock_full_name).toBe('Vanguard High Yield');
    expect(row!.shares).toBe(22);
    expect(list.error).toBe('');
    list.remove();
  });
});
