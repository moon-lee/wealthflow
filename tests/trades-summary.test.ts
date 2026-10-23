// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { buildPortfolio, expectedTotals, AS_OF } from './fixtures/portfolio.js';
import { formatAUD } from '../src/utils/format.js';
import '../src/ui/trades-summary.js';

describe('trades-summary', () => {
  it('shows the five cards', async () => {
    const { finance } = await buildPortfolio();
    const el: any = document.createElement('trades-summary');
    document.body.appendChild(el);
    el.asOf = AS_OF;
    await el.setFinance(finance);
    await el.updateComplete;
    expect(el.summary.totalValue).toBeCloseTo(expectedTotals().value, 2);
    expect(el.summary.totalReturnRate).not.toBeNull();
    await el.updateComplete;
    el.remove();
  });

  it('shows a dash rather than a partial value when a price is missing', async () => {
    const { finance, stockIds } = await buildPortfolio();
    await finance.db
      .table('wealthflow_prices')
      .delete({ stock_id: stockIds.VAS });
    const el: any = document.createElement('trades-summary');
    document.body.appendChild(el);
    el.asOf = AS_OF;
    await el.setFinance(finance);
    await el.updateComplete;
    expect(el.summary.totalValue).toBeNull();
    expect(el.valueLabel).toBe('—');
    await el.updateComplete;
    el.remove();
  });

  it('says when the prices were fetched, and when they were typed', async () => {
    const { finance, stockIds } = await buildPortfolio();
    const el: any = document.createElement('trades-summary');
    document.body.appendChild(el);
    el.asOf = AS_OF;
    await el.setFinance(finance);
    await el.updateComplete;
    // The fixture prices are typed by hand, so the card does not claim live.
    expect(el.summary.pricesLive).toBe(false);

    // Fetch them all from the market, and the card says so.
    await finance.db
      .table('wealthflow_prices')
      .update({ stock_id: stockIds.VAS }, { source: 'api' });
    await finance.db
      .table('wealthflow_prices')
      .update({ stock_id: stockIds.VHY }, { source: 'api' });
    await finance.db
      .table('wealthflow_prices')
      .update({ stock_id: stockIds.FGX }, { source: 'api' });
    await el.reload();
    await el.updateComplete;
    expect(el.summary.pricesLive).toBe(true);
    await el.updateComplete;
    el.remove();
  });

  it('exposes the card order and the value it renders', async () => {
    const { finance } = await buildPortfolio();
    const el: any = document.createElement('trades-summary');
    document.body.appendChild(el);
    el.asOf = AS_OF;
    await el.setFinance(finance);
    await el.updateComplete;
    expect(el.cardLabels).toEqual([
      'Portfolio value',
      'Capital gain',
      'Income',
      'Currency gain',
      'Total return',
    ]);
    expect(el.valueLabel).toBe(formatAUD(expectedTotals().value));
    await el.updateComplete;
    el.remove();
  });

  it('hides the stale-price warning when the prices are fresh', async () => {
    const { finance } = await buildPortfolio();
    const el: any = document.createElement('trades-summary');
    document.body.appendChild(el);
    el.asOf = AS_OF;
    await el.setFinance(finance);
    await el.updateComplete;
    // The warning is always in the DOM now - a binding at the root level of a
    // template is dropped by happy-dom's parser, so the conditional moved onto
    // the element. It must therefore be HIDDEN when there is nothing to warn
    // about, or the screen grows an empty coloured box.
    const warning = el.renderRoot.querySelector(
      '.portfolio-warning',
    ) as HTMLElement;
    expect(warning).toBeTruthy();
    expect(warning.hasAttribute('hidden')).toBe(true);

    // Make the prices stale and the warning appears.
    el.summary = { ...el.summary, stalePrices: true, priceAsAt: '2026-09-01' };
    (el as any).requestUpdate?.();
    await el.updateComplete;
    const shown = el.renderRoot.querySelector(
      '.portfolio-warning',
    ) as HTMLElement;
    expect(shown.hasAttribute('hidden')).toBe(false);
    expect(shown.textContent).toContain('2026-09-01');
    await el.updateComplete;
    el.remove();
  });
});
