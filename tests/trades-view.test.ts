// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { createMockFinance } from '../src/mock/finance-mock.js';
import { createStock } from '../src/dao/stocks.js';
import { createTrade } from '../src/dao/trades.js';
import { rebuildParcels } from '../src/services/parcel-service.js';
import '../src/ui/trade-log.js';
import '../src/ui/trade-form.js';
import '../src/ui/trades-view.js';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('trades ui', () => {
  it('orders trades newest first and exposes them for assertion', async () => {
    const f: any = createMockFinance();
    const s: any = await createStock(f, {
      stock_code: 'VAS',
      stock_full_name: 'V',
      shares: 0,
    });
    await createTrade(f, {
      stock_id: s.id,
      date: '2023-09-22',
      side: 'buy',
      quantity: 10,
      price: 87.48,
      brokerage: 3,
    });
    await createTrade(f, {
      stock_id: s.id,
      date: '2026-09-10',
      side: 'buy',
      quantity: 7,
      price: 110,
      brokerage: 3,
    });
    const log = document.createElement('trade-log') as any;
    document.body.appendChild(log);
    await log.setFinance(f);
    await log.updateComplete;
    // happy-dom drops tbody, so the order is asserted where it is decided.
    expect(log.sortedTrades.map((t: any) => t.date)).toEqual([
      '2026-09-10',
      '2023-09-22',
    ]);
    expect(log.rowCount).toBe(2);
    log.remove();
  });

  it('styles the date column like the dividends list does', async () => {
    const f: any = createMockFinance();
    const s: any = await createStock(f, {
      stock_code: 'VAS',
      stock_full_name: 'V',
      shares: 0,
    });
    await createTrade(f, {
      stock_id: s.id,
      date: '2026-09-10',
      side: 'buy',
      quantity: 7,
      price: 110,
    });
    const log = document.createElement('trade-log') as any;
    document.body.appendChild(log);
    await log.setFinance(f);
    await log.updateComplete;

    // The shared sort control, not a hand-rolled button. The trade log used
    // a `sort-btn` class that has no CSS at all, so the header rendered as
    // the browser's default grey button next to every other log.
    const header = log.renderRoot.querySelector('th[aria-sort]') as any;
    expect(header).toBeTruthy();
    expect(header.getAttribute('aria-sort')).toBe('descending');
    expect(header.querySelector('.th-sort')).toBeTruthy();
    expect(header.querySelector('.caret')).toBeTruthy();
    expect(log.renderRoot.querySelector('.sort-btn')).toBeNull();

    // The date cell carries the same class the dividends list uses.
    const cell = log.renderRoot.querySelector('tbody td') as any;
    expect(cell.classList.contains('mono')).toBe(true);
    expect(cell.textContent.trim()).toBe('2026-09-10');
    log.remove();
  });

  it('flips the order when the date header is used', async () => {
    const f: any = createMockFinance();
    const s: any = await createStock(f, {
      stock_code: 'VAS',
      stock_full_name: 'V',
      shares: 0,
    });
    await createTrade(f, {
      stock_id: s.id,
      date: '2023-09-22',
      side: 'buy',
      quantity: 10,
      price: 87.48,
    });
    await createTrade(f, {
      stock_id: s.id,
      date: '2026-09-10',
      side: 'buy',
      quantity: 7,
      price: 110,
    });
    const log = document.createElement('trade-log') as any;
    document.body.appendChild(log);
    await log.setFinance(f);
    log.sortByDate();
    expect(log.sortedTrades.map((t: any) => t.date)).toEqual([
      '2023-09-22',
      '2026-09-10',
    ]);
    log.remove();
  });

  it('offers a Buy/Sell toggle and previews the allocation on Sell', async () => {
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

    const form = document.createElement('trade-form') as any;
    document.body.appendChild(form);
    await form.setFinance(f);
    form.editTrade(null);
    expect(form.side).toBe('buy');
    // No preview on the Buy state: a buy has no tax consequence.
    expect(form.allocation).toEqual([]);

    form.setSide('sell');
    await form.updateComplete;
    expect(form.side).toBe('sell');
    form.stockId = s.id;
    form.date = '2026-10-16';
    form.quantity = '25';
    form.price = '112';
    await form.refreshPreview();
    await form.updateComplete;
    expect(form.allocation.map((r: any) => r.quantity)).toEqual([20, 5]);
    expect(form.allocation[0].eligible).toBe(true);
    expect(form.allocation[1].eligible).toBe(false);
    expect(form.previewNet).toBeCloseTo(213, 2);
    form.remove();
  });

  it('explains a sell of more than is held in the form, not in a rejection', async () => {
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
    await rebuildParcels(f, s.id);

    const form = document.createElement('trade-form') as any;
    document.body.appendChild(form);
    await form.setFinance(f);
    form.setSide('sell');
    form.stockId = s.id;
    form.quantity = '99';
    form.price = '112';
    await form.refreshPreview();
    await form.updateComplete;
    expect(form.allocation).toEqual([]);
    expect(form.previewError).toMatch(/20 units on hand/i);
    form.remove();
  });

  it('refuses to save a sell that will not balance', async () => {
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
    await rebuildParcels(f, s.id);

    const form = document.createElement('trade-form') as any;
    document.body.appendChild(form);
    await form.setFinance(f);
    form.setSide('sell');
    form.stockId = s.id;
    form.date = '2026-10-16';
    form.quantity = '99';
    form.price = '112';
    form.requestUpdate?.();
    await form.updateComplete;
    await form.onSubmit(new Event('submit'));
    await flush();
    expect(
      await f.db.table('wealthflow_trades').find({ side: 'sell' }),
    ).toHaveLength(0);
    expect(form.error).toMatch(/on hand/i);
    form.remove();
  });

  it('writes a buy on submit', async () => {
    const f: any = createMockFinance();
    const s: any = await createStock(f, {
      stock_code: 'VAS',
      stock_full_name: 'V',
      shares: 0,
    });
    const form = document.createElement('trade-form') as any;
    document.body.appendChild(form);
    await form.setFinance(f);
    form.editTrade(null);
    form.stockId = s.id;
    form.date = '2026-09-10';
    form.quantity = '7';
    form.price = '110';
    form.brokerage = '3';
    form.requestUpdate?.();
    await form.updateComplete;
    await form.onSubmit(new Event('submit'));
    await flush();
    const rows = await f.db.table('wealthflow_trades').find({});
    expect(rows).toHaveLength(1);
    expect(rows[0].quantity).toBe(7);
    form.remove();
  });

  it('surfaces a validation failure rather than swallowing it', async () => {
    const f: any = createMockFinance();
    await createStock(f, {
      stock_code: 'VAS',
      stock_full_name: 'V',
      shares: 0,
    });
    const form = document.createElement('trade-form') as any;
    document.body.appendChild(form);
    await form.setFinance(f);
    form.editTrade(null);
    form.stockId = 1;
    form.date = '2026-09-10';
    form.quantity = '0';
    form.price = '110';
    form.requestUpdate?.();
    await form.updateComplete;
    await form.onSubmit(new Event('submit'));
    await flush();
    expect(form.renderRoot.textContent).toMatch(/quantity/i);
    expect(await f.db.table('wealthflow_trades').find({})).toHaveLength(0);
    form.remove();
  });

  it('shows a price to three decimals and keeps the ledger at full precision', async () => {
    const f: any = createMockFinance();
    const s: any = await createStock(f, {
      stock_code: 'VHY',
      stock_full_name: 'V',
      shares: 0,
    });
    await createTrade(f, {
      stock_id: s.id,
      date: '2026-07-16',
      side: 'buy',
      quantity: 0.1504,
      price: 82.7065,
      source: 'drp',
    });
    const log = document.createElement('trade-log') as any;
    document.body.appendChild(log);
    await log.setFinance(f);
    await log.updateComplete;
    // The DISPLAY is three decimals, so a column of prices lines up.
    expect(log.renderRoot.textContent).toContain('$82.707');
    // The STORED price keeps its fourth decimal: rounding is a display
    // concern, and the cost base is computed from the exact figure.
    expect(log.sortedTrades[0].price).toBe(82.7065);
    // And a fractional quantity survives.
    expect(log.sortedTrades[0].quantity).toBe(0.1504);
    expect(log.renderRoot.textContent).toContain('0.1504');
    log.remove();
  });

  it('renders four sections on one page, with no segment control', async () => {
    const f: any = createMockFinance();
    await createStock(f, {
      stock_code: 'VAS',
      stock_full_name: 'V',
      shares: 0,
    });
    const el: any = document.createElement('trades-view');
    document.body.appendChild(el);
    await el.setFinance(f);
    await el.updateComplete;
    expect(el.renderRoot.querySelectorAll('.section').length).toBe(4);
    expect(el.renderRoot.querySelector('.segment')).toBeNull();
    await el.updateComplete;
    el.remove();
  });

  it('collapses the parcels ledger by default and leaves the rest open', async () => {
    const f: any = createMockFinance();
    await createStock(f, {
      stock_code: 'VAS',
      stock_full_name: 'V',
      shares: 0,
    });
    const el: any = document.createElement('trades-view');
    document.body.appendChild(el);
    await el.setFinance(f);
    await el.updateComplete;
    expect(el.collapsed.parcels).toBe(true);
    expect(el.collapsed.summary).toBe(false);
    expect(el.collapsed.investment).toBe(false);
    expect(el.collapsed.trades).toBe(false);
    await el.updateComplete;
    el.remove();
  });

  it('gives every section header a count badge', async () => {
    const f: any = createMockFinance();
    const s: any = await createStock(f, {
      stock_code: 'VAS',
      stock_full_name: 'V',
      shares: 0,
    });
    const el: any = document.createElement('trades-view');
    document.body.appendChild(el);
    await el.setFinance(f);
    await el.updateComplete;
    // A stock with no trades has no units, so it is not a holding.
    expect(el.holdingCount).toBe(0);
    expect(el.tradeCount).toBe(0);
    expect(el.parcelCount).toBe(0);

    await createTrade(f, {
      stock_id: s.id,
      date: '2024-03-15',
      side: 'buy',
      quantity: 20,
      price: 95.4,
      brokerage: 3,
    });
    await el.reload();
    await el.updateComplete;
    expect(el.holdingCount).toBe(1);
    expect(el.tradeCount).toBe(1);
    expect(el.parcelCount).toBe(1);
    await el.updateComplete;
    el.remove();
  });

  it('still reveals the form when a trade is edited', async () => {
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
    const el: any = document.createElement('trades-view');
    document.body.appendChild(el);
    await el.setFinance(f);
    await el.updateComplete;
    el.dispatchEvent(
      new CustomEvent('trade-edit-request', {
        detail: {
          trade: {
            id: 1,
            stock_id: s.id,
            date: '2024-03-15',
            side: 'buy',
            quantity: 20,
            price: 95.4,
            brokerage: 3,
            source: 'manual',
            dividend_id: null,
            notes: null,
          },
        },
        bubbles: true,
        composed: true,
      }),
    );
    await flush();
    expect(el.showForm).toBe(true);
    await el.updateComplete;
    el.remove();
  });

  it('actually renders the form and the log inside the Trades section', async () => {
    // A root-level binding in the section's body template used to keep both of
    // these out of happy-dom's tree, so every test above was blind to them.
    const f: any = createMockFinance();
    const s: any = await createStock(f, {
      stock_code: 'VAS',
      stock_full_name: 'V',
      shares: 0,
    });
    await createTrade(f, {
      stock_id: s.id,
      date: '2026-09-10',
      side: 'buy',
      quantity: 7,
      price: 110,
      brokerage: 3,
    });
    const el: any = document.createElement('trades-view');
    document.body.appendChild(el);
    await el.setFinance(f);
    await el.updateComplete;

    const form = el.renderRoot.querySelector('trade-form');
    const log = el.renderRoot.querySelector('trade-log') as any;
    expect(form).toBeTruthy();
    expect(log).toBeTruthy();
    await log.updateComplete;
    expect(log.renderRoot.querySelector('table.hist-table')).toBeTruthy();
    expect(log.renderRoot.textContent).toContain('VAS');
    el.remove();
  });

  it('rebuilds parcels when a trade event fires', async () => {
    const f: any = createMockFinance();
    const s: any = await createStock(f, {
      stock_code: 'VAS',
      stock_full_name: 'V',
      shares: 0,
    });
    await createTrade(f, {
      stock_id: s.id,
      date: '2026-09-10',
      side: 'buy',
      quantity: 7,
      price: 110,
      brokerage: 3,
    });
    const v = document.createElement('trades-view') as any;
    document.body.appendChild(v);
    v.finance = f;
    await v.setFinance(f);
    expect(await f.db.table('wealthflow_parcels').find({})).toHaveLength(1);
    const stock = (await f.db.table('wealthflow_stocks').find({}))[0] as any;
    expect(stock.shares).toBe(7);
    v.remove();
  });
});
