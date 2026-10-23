// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { createMockFinance } from '../src/mock/finance-mock.js';
import { createStock } from '../src/dao/stocks.js';
import { createTrade } from '../src/dao/trades.js';
import { rebuildParcels } from '../src/services/parcel-service.js';
import '../src/ui/trade-form.js';
import '../src/ui/trades-view.js';

const flush = () => new Promise((r) => setTimeout(r, 0));

function labels(el: any): string[] {
  return Array.from(el.renderRoot.querySelectorAll('button')).map((b: any) =>
    b.textContent.trim(),
  );
}

async function formFor(f: any): Promise<any> {
  const form: any = document.createElement('trade-form');
  document.body.appendChild(form);
  await form.setFinance(f);
  await form.updateComplete;
  return form;
}

describe('trade form controls', () => {
  it('has no Hide form button of its own: the section header owns that', async () => {
    const f: any = createMockFinance();
    await createStock(f, {
      stock_code: 'VAS',
      stock_full_name: 'V',
      shares: 0,
    });
    const form = await formFor(f);
    form.editTrade(null);
    await form.updateComplete;

    const buttons = labels(form);
    expect(buttons).not.toContain('Hide form');
    expect(buttons).toContain('Clear');
    expect(buttons).toContain('Save');
    form.remove();
  });

  it('offers Cancel edit instead of Clear while a trade is being amended', async () => {
    const f: any = createMockFinance();
    await createStock(f, {
      stock_code: 'VAS',
      stock_full_name: 'V',
      shares: 0,
    });
    const form = await formFor(f);
    form.editTrade({
      id: 7,
      stock_id: 1,
      date: '2024-03-15',
      side: 'buy',
      quantity: 20,
      price: 95.4,
      brokerage: 3,
      source: 'manual',
      dividend_id: null,
      notes: null,
    });
    await form.updateComplete;

    expect(labels(form)).toContain('Cancel edit');
    expect(labels(form)).not.toContain('Clear');
    form.remove();
  });

  it('leaves one Hide form control on the Trades page, in the section header', async () => {
    const f: any = createMockFinance();
    await createStock(f, {
      stock_code: 'VAS',
      stock_full_name: 'V',
      shares: 0,
    });
    const view: any = document.createElement('trades-view');
    document.body.appendChild(view);
    await view.setFinance(f);
    await view.updateComplete;

    // Both roots: the section header's button and the form's own header. A
    // query on the view alone cannot see the form's shadow root, and that is
    // exactly how the duplicate survived the suite.
    const form = view.renderRoot.querySelector('trade-form') as any;
    expect(form).toBeTruthy();
    await form.updateComplete;
    const hide = [
      ...view.renderRoot.querySelectorAll('button'),
      ...form.renderRoot.querySelectorAll('button'),
    ].filter((b: any) => b.textContent.trim() === 'Hide form');
    expect(hide).toHaveLength(1);
    expect(view.renderRoot.contains(hide[0])).toBe(true);
    view.remove();
  });

  it('prefills a new trade with the local date', async () => {
    const f: any = createMockFinance();
    await createStock(f, {
      stock_code: 'VAS',
      stock_full_name: 'V',
      shares: 0,
    });
    const form = await formFor(f);
    form.editTrade(null);

    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
      2,
      '0',
    )}-${String(now.getDate()).padStart(2, '0')}`;
    expect(form.date).toBe(today);
    form.remove();
  });

  it('adds up a buy before it is saved', async () => {
    const f: any = createMockFinance();
    await createStock(f, {
      stock_code: 'VAS',
      stock_full_name: 'V',
      shares: 0,
    });
    const form = await formFor(f);
    form.editTrade(null);
    form.quantity = '10';
    form.price = '100.50';
    form.brokerage = '3';
    form.requestUpdate?.();
    await form.updateComplete;

    expect(form.buyTotal).toBe(1008);
    const text = form.renderRoot.textContent.replace(/\s+/g, ' ');
    expect(text).toContain('Total cost');
    expect(text).toContain('$1,008.00');
    form.remove();
  });

  it('clears a stale error as soon as a field is edited', async () => {
    const f: any = createMockFinance();
    await createStock(f, {
      stock_code: 'VAS',
      stock_full_name: 'V',
      shares: 0,
    });
    const form = await formFor(f);
    form.error = 'quantity must be greater than 0';

    form.onInput('quantity', '5');
    expect(form.error).toBe('');
    expect(form.quantity).toBe('5');
    form.remove();
  });

  it('refreshes the sell preview while the quantity is typed', async () => {
    const f: any = createMockFinance();
    const s: any = await createStock(f, {
      stock_code: 'VAS',
      stock_full_name: 'V',
      shares: 0,
    });
    await createTrade(f, {
      stock_id: s.id,
      date: '2024-03-15',
      side: 'buy',
      quantity: 20,
      price: 95.4,
      brokerage: 3,
    });
    await createTrade(f, {
      stock_id: s.id,
      date: '2025-11-20',
      side: 'buy',
      quantity: 15,
      price: 102.1,
      brokerage: 3,
    });
    await rebuildParcels(f, s.id);

    const form = await formFor(f);
    form.setSide('sell');
    form.stockId = s.id;
    form.price = '112';
    form.onInput('quantity', '25');
    await flush();
    await flush();

    expect(form.allocation.map((r: any) => r.quantity)).toEqual([20, 5]);
    form.remove();
  });

  it('labels every field and marks the ones the browser must check', async () => {
    const f: any = createMockFinance();
    await createStock(f, {
      stock_code: 'VAS',
      stock_full_name: 'V',
      shares: 0,
    });
    const form = await formFor(f);
    const root = form.renderRoot;

    // A control inside its own label: clicking the caption focuses the field,
    // and a screen reader announces it.
    const qty = root.querySelector('input[placeholder="0"]') as any;
    expect(qty).toBeTruthy();
    expect(qty.closest('label')?.textContent).toContain('Quantity');
    expect(qty.hasAttribute('required')).toBe(true);

    const date = root.querySelector('input[type="date"]') as any;
    expect(date.closest('label')?.textContent).toContain('Date');
    expect(date.hasAttribute('required')).toBe(true);

    expect(root.querySelector('input[placeholder="0.000"]')).toBeTruthy();
    expect(root.querySelector('input[placeholder="0.00"]')).toBeTruthy();
    form.remove();
  });

  it('refuses a second submit while the first is still saving', async () => {
    const f: any = createMockFinance();
    const s: any = await createStock(f, {
      stock_code: 'VAS',
      stock_full_name: 'V',
      shares: 0,
    });
    const form = await formFor(f);
    form.editTrade(null);
    form.stockId = s.id;
    form.date = '2026-09-10';
    form.quantity = '7';
    form.price = '110';
    form.brokerage = '3';

    form.saving = true;
    form.requestUpdate?.();
    await form.updateComplete;
    const save = form.renderRoot.querySelector('button[type="submit"]') as any;
    expect(save.disabled).toBe(true);

    await form.onSubmit(new Event('submit'));
    expect(await f.db.table('wealthflow_trades').find({})).toHaveLength(0);
    form.remove();
  });
});
