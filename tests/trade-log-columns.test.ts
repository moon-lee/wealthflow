// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { createMockFinance } from '../src/mock/finance-mock.js';
import { createStock } from '../src/dao/stocks.js';
import { createTrade } from '../src/dao/trades.js';
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

async function seed(f: any): Promise<void> {
  const s: any = await createStock(f, {
    stock_code: 'VAS',
    stock_full_name: 'Vanguard Australian Shares',
    shares: 0,
  });
  await createTrade(f, {
    stock_id: s.id,
    date: '2025-01-02',
    side: 'buy',
    quantity: 1,
    price: 100,
    brokerage: 0,
  });
}

/** The declared width of each column, in the table's own order. */
function widths(log: any): number[] {
  const cols = [...log.renderRoot.querySelectorAll('colgroup col')] as any[];
  return cols.map((c) => Number.parseFloat(c.style.width || '0'));
}

describe('trade log column widths', () => {
  it('declares one width per column, and they add up', async () => {
    const f: any = createMockFinance();
    await seed(f);
    const log = await logFor(f);

    const headers = [...log.renderRoot.querySelectorAll('thead th')];
    const cols = widths(log);
    expect(cols).toHaveLength(headers.length);
    expect(cols.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 5);
    log.remove();
  });

  it('gives Stock more room than Side or Qty', async () => {
    const f: any = createMockFinance();
    await seed(f);
    const log = await logFor(f);

    const headers = [...log.renderRoot.querySelectorAll('thead th')].map(
      (h: any) => h.textContent?.trim().split(/\s+/)[0],
    );
    const col = (name: string) => widths(log)[headers.indexOf(name)];
    // Side ("buy"/"sell") and Qty are the narrowest columns; the Stock cell
    // also carries the header filter, so it needs the most of the three.
    expect(col('Stock')).toBeGreaterThan(col('Side'));
    expect(col('Stock')).toBeGreaterThan(col('Qty'));
    expect(col('Side')).toBeLessThan(col('Date'));
    expect(col('Qty')).toBeLessThan(col('Price'));
    log.remove();
  });
});
