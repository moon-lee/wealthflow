// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { createMockFinance } from '../src/mock/finance-mock.js';
import { createStock } from '../src/dao/stocks.js';
import { createTrade, listTrades } from '../src/dao/trades.js';
import { createDividend } from '../src/dao/dividends.js';
import '../src/ui/trade-log.js';

const flush = () => new Promise((r) => setTimeout(r, 0));

async function logFor(f: any): Promise<any> {
  const log: any = document.createElement('trade-log');
  document.body.appendChild(log);
  await log.setFinance(f);
  await log.updateComplete;
  await flush();
  await log.updateComplete;
  return log;
}

async function holding(f: any): Promise<any> {
  return createStock(f, {
    stock_code: 'CBA',
    stock_full_name: 'Commonwealth Bank',
    shares: 0,
  });
}

async function buy(f: any, s: any) {
  return createTrade(f, {
    stock_id: s.id,
    date: '2026-08-01',
    side: 'buy',
    quantity: 100,
    price: 10,
    brokerage: 0,
  });
}

describe('trade log row actions', () => {
  it('offers edit and delete icons, each with an accessible name', async () => {
    const f: any = createMockFinance();
    const s = await holding(f);
    await buy(f, s);
    const log = await logFor(f);

    const buttons = [...log.renderRoot.querySelectorAll('td.actions button')];
    expect(buttons).toHaveLength(2);
    expect(buttons.map((b: any) => b.getAttribute('aria-label'))).toEqual([
      'Edit buy 100 CBA on 2026-08-01',
      'Delete buy 100 CBA on 2026-08-01',
    ]);
    expect(buttons.map((b: any) => b.querySelectorAll('svg').length)).toEqual([
      1, 1,
    ]);
    log.remove();
  });

  it('asks the form to edit when the pencil is clicked', async () => {
    const f: any = createMockFinance();
    const s = await holding(f);
    await buy(f, s);
    const log = await logFor(f);

    const seen: any[] = [];
    log.addEventListener('trade-edit-request', (e: any) => seen.push(e.detail));
    (log.renderRoot.querySelector('td.actions button') as any).click();

    expect(seen).toHaveLength(1);
    expect(seen[0].trade.stock_id).toBe(s.id);
    log.remove();
  });

  it('deletes the trade once the confirmation is accepted', async () => {
    const f: any = createMockFinance();
    const s = await holding(f);
    await buy(f, s);
    const log = await logFor(f);

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    (log.renderRoot.querySelectorAll('td.actions button')[1] as any).click();
    await flush();
    await flush();

    expect(await listTrades(f)).toHaveLength(0);
    expect(log.renderRoot.textContent).toMatch(/No trades yet/);
    log.remove();
  });

  it('keeps a reinvestment buy and says where to change it', async () => {
    const f: any = createMockFinance();
    const s = await holding(f);
    const div: any = await createDividend(f, {
      stock_id: s.id,
      date: '2026-08-01',
      type: 'non_trust',
      gross: 100,
      franking: 0,
      amount_reinvested: 100,
      units_acquired: 4,
    });
    await createTrade(f, {
      stock_id: s.id,
      date: '2026-08-01',
      side: 'buy',
      quantity: 4,
      price: 25,
      brokerage: 0,
      source: 'drp',
      dividend_id: div.id,
    });
    const log = await logFor(f);

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    (log.renderRoot.querySelectorAll('td.actions button')[1] as any).click();
    await flush();
    await flush();

    expect(await listTrades(f)).toHaveLength(1);
    expect(log.error).toMatch(/Dividends section/);
    log.remove();
  });
});
