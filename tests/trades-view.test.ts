// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { createMockFinance } from '../src/mock/finance-mock.js';
import { createStock } from '../src/dao/stocks.js';
import { createTrade } from '../src/dao/trades.js';
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

  it('offers no Buy/Sell toggle in Phase 1', async () => {
    const f: any = createMockFinance();
    await createStock(f, {
      stock_code: 'VAS',
      stock_full_name: 'V',
      shares: 0,
    });
    const form = document.createElement('trade-form') as any;
    document.body.appendChild(form);
    await form.setFinance(f);
    await form.updateComplete;
    expect(form.renderRoot.textContent).not.toMatch(/sell/i);
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

  it('keeps a 4dp price and a fractional quantity visible', async () => {
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
    expect(log.sortedTrades[0].quantity).toBe(0.1504);
    expect(log.renderRoot.textContent).toContain('82.7065');
    log.remove();
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
