// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { createMockFinance } from '../src/mock/finance-mock.js';
import { createStock } from '../src/dao/stocks.js';
import { createTrade, deleteTrade } from '../src/dao/trades.js';
import '../src/ui/trade-log.js';

const flush = () => new Promise((r) => setTimeout(r, 0));

/** Distinct, sortable dates in January 2025, `n` of them. */
function dates(n: number): string[] {
  return Array.from(
    { length: n },
    (_, i) => `2025-01-${String(i + 1).padStart(2, '0')}`,
  );
}

async function seed(f: any, code: string, days: string[]): Promise<any> {
  const s: any = await createStock(f, {
    stock_code: code,
    stock_full_name: code,
    shares: 0,
  });
  for (const [i, date] of days.entries())
    await createTrade(f, {
      stock_id: s.id,
      date,
      side: 'buy',
      quantity: 1,
      price: 100 + i,
      brokerage: 0,
    });
  return s;
}

async function logFor(f: any): Promise<any> {
  const log: any = document.createElement('trade-log');
  document.body.appendChild(log);
  await log.setFinance(f);
  await log.updateComplete;
  return log;
}

describe('trade log paging', () => {
  it('shows ten trades a page, newest first', async () => {
    const f: any = createMockFinance();
    await seed(f, 'VAS', dates(12));
    const log = await logFor(f);

    expect(log.rowCount).toBe(12);
    expect(log.pages).toBe(2);
    expect(log.pageRows).toHaveLength(10);
    expect(log.pageRows[0].date).toBe('2025-01-12');
    expect(log.pageRows[9].date).toBe('2025-01-03');

    const pager = log.renderRoot.querySelector('.table-pager') as any;
    expect(pager).toBeTruthy();
    expect(pager.textContent.replace(/\s+/g, ' ')).toContain('Page 1 of 2');
    expect(pager.textContent.replace(/\s+/g, ' ')).toContain('12 trades');
    log.remove();
  });

  it('walks to the last page and clamps outside the range', async () => {
    const f: any = createMockFinance();
    await seed(f, 'VAS', dates(12));
    const log = await logFor(f);

    log.gotoPage(1);
    expect(log.page).toBe(1);
    expect(log.pageRows.map((t: any) => t.date)).toEqual([
      '2025-01-02',
      '2025-01-01',
    ]);

    log.gotoPage(99);
    expect(log.page).toBe(1);
    log.gotoPage(-5);
    expect(log.page).toBe(0);
    expect(log.pageRows).toHaveLength(10);
    log.remove();
  });

  it('leaves no pager when the log fits on one page', async () => {
    const f: any = createMockFinance();
    await seed(f, 'VAS', dates(3));
    const log = await logFor(f);

    expect(log.pages).toBe(1);
    expect(log.renderRoot.querySelector('.table-pager')).toBeNull();
    log.remove();
  });

  it('never loses or repeats a row across pages, even on one date', async () => {
    const f: any = createMockFinance();
    const s: any = await createStock(f, {
      stock_code: 'VAS',
      stock_full_name: 'V',
      shares: 0,
    });
    for (let i = 0; i < 11; i++)
      await createTrade(f, {
        stock_id: s.id,
        date: '2025-01-01',
        side: 'buy',
        quantity: 1,
        price: 100 + i,
        brokerage: 0,
      });
    const log = await logFor(f);

    const seen: number[] = [];
    for (let p = 0; p < log.pages; p++) {
      log.gotoPage(p);
      seen.push(...log.pageRows.map((t: any) => t.id));
    }
    expect(seen).toHaveLength(11);
    expect(new Set(seen).size).toBe(11);
    log.remove();
  });

  it('returns to the first page when the date order flips', async () => {
    const f: any = createMockFinance();
    await seed(f, 'VAS', dates(12));
    const log = await logFor(f);

    log.gotoPage(1);
    log.sortByDate();
    expect(log.page).toBe(0);
    expect(log.pageRows[0].date).toBe('2025-01-01');
    log.remove();
  });

  it('returns to the first page when the log shrinks under it', async () => {
    const f: any = createMockFinance();
    await seed(f, 'VAS', dates(12));
    const log = await logFor(f);
    log.gotoPage(1);

    const rows = await f.db.table('wealthflow_trades').find({});
    for (const r of rows.slice(0, 7)) await deleteTrade(f, r.id);
    await log.reload();

    expect(log.pages).toBe(1);
    expect(log.page).toBe(0);
    log.remove();
  });
});

describe('trade log stock filter', () => {
  it('puts the stock filter in the Stock column header', async () => {
    const f: any = createMockFinance();
    await seed(f, 'VAS', dates(2));
    const log = await logFor(f);

    // The old strip above the table is gone; the filter moved into the table.
    expect(log.renderRoot.querySelector('.log-filters')).toBeNull();
    const select = log.renderRoot.querySelector('.col-filter') as any;
    expect(select).toBeTruthy();
    expect(select.closest('th')?.textContent).toContain('Stock');
    // The header states the current choice, not just the column name.
    expect(
      select
        .closest('th')
        ?.querySelector('.th-filter .current')
        ?.textContent?.trim(),
    ).toBe('All stocks');
    log.remove();
  });

  it('shows a plain Stock header when the log is empty', async () => {
    const f: any = createMockFinance();
    const log = await logFor(f);

    // Nothing to filter: an option that selects no rows is a control that can
    // only lie, so the header goes back to a label.
    expect(log.renderRoot.querySelector('.col-filter')).toBeNull();
    const stockTh = [...log.renderRoot.querySelectorAll('th')].find(
      (h: any) => h.textContent?.trim() === 'Stock',
    );
    expect(stockTh).toBeTruthy();
    log.remove();
  });

  it('narrows the log to one stock and starts again at page one', async () => {
    const f: any = createMockFinance();
    await seed(f, 'VAS', dates(12));
    const vhy = await seed(f, 'VHY', dates(3));
    const log = await logFor(f);
    expect(log.pages).toBe(2);

    log.gotoPage(1);
    log.setStockFilter(vhy.id);

    expect(log.page).toBe(0);
    expect(log.filteredCount).toBe(3);
    expect(log.pages).toBe(1);
    expect(log.filteredTrades.every((t: any) => t.stock_id === vhy.id)).toBe(
      true,
    );
    expect(log.rowCount).toBe(15);
    log.remove();
  });

  it('offers every stock in the log plus All stocks', async () => {
    const f: any = createMockFinance();
    await seed(f, 'VAS', dates(2));
    await seed(f, 'VHY', dates(2));
    const log = await logFor(f);

    const select = log.renderRoot.querySelector(
      'select[aria-label="Filter trades by stock"]',
    ) as any;
    expect(select).toBeTruthy();
    expect(
      Array.from(select.options).map((o: any) => o.textContent.trim()),
    ).toEqual(['All stocks', 'VAS', 'VHY']);
    log.remove();
  });

  it('filters from the select, the way the reader uses it', async () => {
    const f: any = createMockFinance();
    const vas = await seed(f, 'VAS', dates(2));
    await seed(f, 'VHY', dates(2));
    const log = await logFor(f);

    const select = log.renderRoot.querySelector(
      'select[aria-label="Filter trades by stock"]',
    ) as any;
    select.value = String(vas.id);
    select.dispatchEvent(new Event('change'));
    await log.updateComplete;
    expect(log.stockFilter).toBe(vas.id);
    expect(log.filteredCount).toBe(2);
    expect(
      select
        .closest('th')
        ?.querySelector('.th-filter .current')
        ?.textContent?.trim(),
    ).toBe('VAS');

    select.value = 'all';
    select.dispatchEvent(new Event('change'));
    await flush();
    expect(log.stockFilter).toBeNull();
    expect(log.filteredCount).toBe(4);
    log.remove();
  });

  it('drops a filter whose stock has left the log', async () => {
    const f: any = createMockFinance();
    await seed(f, 'VAS', dates(2));
    const vhy = await seed(f, 'VHY', dates(2));
    const log = await logFor(f);
    log.setStockFilter(vhy.id);

    for (const r of await f.db.table('wealthflow_trades').find({}))
      if (r.stock_id === vhy.id) await deleteTrade(f, r.id);
    await log.reload();

    expect(log.stockFilter).toBeNull();
    log.remove();
  });
});
