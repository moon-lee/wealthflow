// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { buildPortfolio, AS_OF } from './fixtures/portfolio.js';
import { listPrices } from '../src/dao/prices.js';
import '../src/ui/index.js';

/**
 * The Trades page shows the same money in two places: the Trades Summary
 * cards above and the Investment table below. They are siblings, each with its
 * own copy of the portfolio summary, so a change to one that is not announced
 * leaves the other showing a stale figure — two numbers for the same money,
 * which is worse than no number at all.
 */
async function mount() {
  const { finance } = await buildPortfolio();
  const view: any = document.createElement('wealthflow-orchestrator');
  document.body.appendChild(view);
  await view.init(finance, { view: 'trades' });
  await view.updateComplete;
  const page: any = view.renderRoot.querySelector('trades-view');
  const summary: any = page.renderRoot.querySelector('trades-summary');
  const table: any = page.renderRoot.querySelector('investment-table');
  await summary.updateComplete;
  await table.updateComplete;
  return { finance, view, page, summary, table };
}

describe('the Trades page', () => {
  it('shows the same Portfolio value in the summary and the table', async () => {
    const { view, summary, table } = await mount();
    expect(summary.summary.totalValue).toBeCloseTo(table.totals.value, 2);
    await view.updateComplete;
    view.remove();
  });

  it('updates BOTH sections after a price update', async () => {
    const { finance, view, summary, table } = await mount();
    const before = summary.summary.totalValue;

    // The real path: the table asks the HOST for the price, the host fetches
    // and records it, and the page is told so the sibling sections re-read.
    const rows = await listPrices(finance);
    (globalThis as any).financeShell = {
      extensions: {
        executeCommand: async () => {
          await finance.db
            .table('wealthflow_prices')
            .update(
              { stock_id: rows[0].stock_id },
              { price: 200, source: 'api' },
            );
          return { executed: true };
        },
      },
    };
    await table.updatePricesFromApi();
    await new Promise((r) => setTimeout(r, 0));
    await view.updateComplete;
    await summary.updateComplete;
    await table.updateComplete;

    expect(table.totals.value).not.toBeCloseTo(before, 2);
    // AND the summary must move with it. They are the same money.
    expect(summary.summary.totalValue).toBeCloseTo(table.totals.value, 2);
    delete (globalThis as any).financeShell;
    await view.updateComplete;
    view.remove();
  });

  it('keeps Value in currency and makes the other percentages per annum', async () => {
    const { view, table } = await mount();
    const currency = table.rows.map((r: any) => r.valueLabel);
    table.mode = 'percent';
    table.requestUpdate?.();
    await table.updateComplete;
    // The Value column does not convert: the portfolio is not a percentage of
    // itself.
    expect(table.rows.map((r: any) => r.valueLabel)).toEqual(currency);
    // The gain columns become an ANNUALISED rate — the same measure the
    // Trades Summary shows.
    const vas = table.rows.find((r: any) => r.code === 'VAS')!;
    expect(vas.capitalGainLabel).toBe(
      `${(vas.capitalGainRate * 100).toFixed(2)}%`,
    );
    // And the note says so, because a bare "12.34%" next to the summary's
    // "12.34% p.a." should read as the same number.
    const note = table.renderRoot.querySelector('.portfolio-note') as any;
    expect(note.textContent).toMatch(/per annum/i);
    expect(note.textContent).toMatch(/Prices as of/);
    await view.updateComplete;
    view.remove();
  });

  it('gives each holding its OWN rate, not the portfolio rate on every row', async () => {
    const { view, table } = await mount();
    table.mode = 'percent';
    table.requestUpdate?.();
    await table.updateComplete;
    const rates = table.rows.map((r: any) => r.returnRate);
    // Every holding has a rate...
    expect(rates.every((r: any) => typeof r === 'number')).toBe(true);
    // ...and they are not all the same number: a row's % describes that row.
    expect(
      new Set(rates.map((r: number) => r.toFixed(4))).size,
    ).toBeGreaterThan(1);
    // The totals row is the portfolio's rate, which is a different measure.
    expect(table.totals.returnRate).not.toBe(table.rows[0].returnRate);
    await view.updateComplete;
    view.remove();
  });

  it('shows no total Quantity in the totals row', async () => {
    const { view, table } = await mount();
    // 1,297 units of three different stocks is not a quantity of anything.
    const foot = table.renderRoot.querySelector('.portfolio-totals') as any;
    const cells = [...foot.querySelectorAll('td')];
    // Holding | Price | Quantity | Value | Capital gain | Income | Currency
    // | Return — the third cell is the Quantity, and it is empty.
    expect(cells.length).toBe(8);
    expect(cells[2].textContent.trim()).toBe('');
    await view.updateComplete;
    view.remove();
  });

  it('shows the SAME rate in the total row as the Trades Summary', async () => {
    const { view, page, table } = await mount();
    const summary: any = page.renderRoot.querySelector('trades-summary');
    table.mode = 'percent';
    table.requestUpdate?.();
    await table.updateComplete;
    await summary.updateComplete;
    // The table's total row and the summary card are the same money, so they
    // must show the same rate. They used not to: the table showed a share of
    // the portfolio and the summary an annualised rate.
    expect(table.totals.totalReturnLabel).toBe(
      `${(summary.summary.totalReturnRate * 100).toFixed(2)}%`,
    );
    expect(table.totals.capitalGainLabel).toBe(
      `${(summary.summary.capitalGainRate * 100).toFixed(2)}%`,
    );
    await view.updateComplete;
    view.remove();
  });
});
