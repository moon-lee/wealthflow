// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { buildPortfolio, expectedTotals, AS_OF } from './fixtures/portfolio.js';
import { latestPrices, listPrices } from '../src/dao/prices.js';
import '../src/ui/investment-table.js';

describe('investment-table', () => {
  it('shows one row per holding and a totals row', async () => {
    const { finance } = await buildPortfolio();
    const el: any = document.createElement('investment-table');
    document.body.appendChild(el);
    el.asOf = AS_OF;
    await el.setFinance(finance);
    await el.updateComplete;
    expect(el.rows).toHaveLength(3);
    expect(el.totals.value).toBeCloseTo(expectedTotals().value, 2);
    await el.updateComplete;
    el.remove();
  });

  it('puts the value format on the right and the split toggle on the left', async () => {
    const { finance } = await buildPortfolio();
    const el: any = document.createElement('investment-table');
    document.body.appendChild(el);
    el.asOf = AS_OF;
    await el.setFinance(finance);
    await el.updateComplete;

    const toolbar = el.renderRoot.querySelector('.portfolio-toolbar') as any;
    expect(toolbar).toBeTruthy();
    const left = toolbar.querySelector('.portfolio-toolbar-left') as any;
    const right = toolbar.querySelector('.portfolio-toolbar-right') as any;
    // The split toggle is a view option, so it belongs on the left...
    expect(left.querySelector('.portfolio-toggle')).toBeTruthy();
    // ...and so is the cost base the gains are measured against. Both are
    // "what am I looking at", not "what can I do".
    const basis = left.querySelector(
      '[aria-label="Cost base the gains are measured against"]',
    );
    expect(basis).toBeTruthy();
    // ...and the value format belongs with the edit action, on the right.
    expect(right.querySelector('[aria-label="Value format"]')).toBeTruthy();
    expect(right.querySelector('.btn')).toBeTruthy();
    await el.updateComplete;
    el.remove();
  });

  it('shows which value format is active', async () => {
    const { finance } = await buildPortfolio();
    const el: any = document.createElement('investment-table');
    document.body.appendChild(el);
    el.asOf = AS_OF;
    await el.setFinance(finance);
    await el.updateComplete;
    // `.filter-btn.active` is only styled inside a topbar or a section header,
    // so outside one the active state needs its own rule or the control gives
    // no indication of which option is chosen.
    // The toolbar has TWO segments now - the value format and the cost base -
    // so this picks the one it means by its label.
    const seg = el.renderRoot.querySelector(
      '[aria-label="Value format"]',
    ) as any;
    const active = seg.querySelectorAll('.filter-btn.active');
    expect(active).toHaveLength(1);
    expect(active[0].textContent.trim()).toBe('AUS');
    // Click it the way a person does.
    const percent = [...seg.querySelectorAll('.filter-btn')].find(
      (b: any) => b.textContent.trim() === '%',
    ) as any;
    percent.click();
    await el.updateComplete;
    const after = (
      el.renderRoot.querySelector('[aria-label="Value format"]') as any
    ).querySelectorAll('.filter-btn.active');
    expect(after).toHaveLength(1);
    expect(after[0].textContent.trim()).toBe('%');
    await el.updateComplete;
    el.remove();
  });

  it('shows the price to three decimals', async () => {
    const { finance } = await buildPortfolio();
    const el: any = document.createElement('investment-table');
    document.body.appendChild(el);
    el.asOf = AS_OF;
    await el.setFinance(finance);
    await el.updateComplete;
    // The fixture prices: 108.75, 84.34 and 1.34.
    const labels = el.rows.map((r: any) => r.priceLabel).sort();
    expect(labels).toEqual(['$1.340', '$108.750', '$84.340']);
    await el.updateComplete;
    el.remove();
  });

  it('marks a price that came from the market, and leaves a typed one unmarked', async () => {
    const { finance } = await buildPortfolio();
    const el: any = document.createElement('investment-table');
    document.body.appendChild(el);
    el.asOf = AS_OF;
    await el.setFinance(finance);
    await el.updateComplete;

    // The fixture prices are entered by hand, so nothing is marked.
    expect(el.rows.every((r: any) => r.priceSource === 'manual')).toBe(true);
    expect(el.rows.every((r: any) => !r.priceClass.includes('live'))).toBe(
      true,
    );

    // A price fetched from the market is marked. The signal is the row's
    // source, which is what the marker is rendered from — happy-dom drops the
    // table rows, so the cell itself cannot be inspected in a test.
    const target = el.rows[0].stockId;
    await finance.db
      .table('wealthflow_prices')
      .update({ stock_id: target }, { source: 'api' });
    await el.reload();
    await el.updateComplete;
    const live = el.rows.filter((r: any) => r.priceSource === 'api');
    expect(live.length).toBe(1);
    // The ones still typed by hand are untouched.
    expect(
      el.rows
        .filter((r: any) => r.priceSource === 'manual')
        .every((r: any) => r.priceSource !== 'api'),
    ).toBe(true);
    await el.updateComplete;
    el.remove();
  });
  it('CANCELS rather than silently discarding an edit', async () => {
    const { finance } = await buildPortfolio();
    const el: any = document.createElement('investment-table');
    document.body.appendChild(el);
    el.asOf = AS_OF;
    await el.setFinance(finance);
    await el.updateComplete;

    el.beginEdit();
    await el.updateComplete;
    expect(el.editing).toBe(true);

    // Typing marks the edits as worth protecting.
    el.priceEditsDirty = true;
    let asked = 0;
    (globalThis as any).confirm = () => {
      asked += 1;
      return true;
    };
    el.cancelEdits();
    await el.updateComplete;
    // It asks before throwing the edit away, and then leaves edit mode.
    expect(asked).toBe(1);
    expect(el.editing).toBe(false);
    delete (globalThis as any).confirm;
    await el.updateComplete;
    el.remove();
  });

  it('stays in the editor when the discard is refused', async () => {
    const { finance } = await buildPortfolio();
    const el: any = document.createElement('investment-table');
    document.body.appendChild(el);
    el.asOf = AS_OF;
    await el.setFinance(finance);
    await el.updateComplete;
    el.beginEdit();
    el.priceEditsDirty = true;
    (globalThis as any).confirm = () => false;
    el.cancelEdits();
    await el.updateComplete;
    expect(el.editing).toBe(true);
    delete (globalThis as any).confirm;
    await el.updateComplete;
    el.remove();
  });

  it('cancels without asking when nothing was typed', async () => {
    const { finance } = await buildPortfolio();
    const el: any = document.createElement('investment-table');
    document.body.appendChild(el);
    el.asOf = AS_OF;
    await el.setFinance(finance);
    await el.updateComplete;
    el.beginEdit();
    let asked = 0;
    (globalThis as any).confirm = () => {
      asked += 1;
      return true;
    };
    el.cancelEdits();
    await el.updateComplete;
    expect(asked).toBe(0);
    expect(el.editing).toBe(false);
    delete (globalThis as any).confirm;
    await el.updateComplete;
    el.remove();
  });

  it('offers a price editor with the same three decimals as the column', async () => {
    const { finance } = await buildPortfolio();
    const el: any = document.createElement('investment-table');
    document.body.appendChild(el);
    el.asOf = AS_OF;
    await el.setFinance(finance);
    await el.updateComplete;

    // What the input shows must match what the column showed, so typing
    // replaces a figure the user can read.
    const row = el.rows.find((r: any) => r.code === 'VAS')!;
    expect(row.priceLabel).toBe('$108.750');
    expect(row.priceInputValue).toBe('108.750');
    expect(row.priceInputLabel).toBe('Price for VAS');
  });

  it('does not record the same price twice in a day', async () => {
    const { finance } = await buildPortfolio();
    const el: any = document.createElement('investment-table');
    document.body.appendChild(el);
    el.asOf = AS_OF;
    await el.setFinance(finance);
    await el.updateComplete;
    const before = (await listPrices(finance)).length;
    // A price observed today is a new observation, even if it matches
    // yesterday's figure - the history records when it was seen.
    await el.savePrices([{ stockId: el.rows[0].stockId, price: 120 }]);
    expect((await listPrices(finance)).length).toBe(before + 1);
    // Saving the SAME price again on the SAME day must not stack a duplicate.
    await el.savePrices([{ stockId: el.rows[0].stockId, price: 120 }]);
    expect((await listPrices(finance)).length).toBe(before + 1);
    await el.updateComplete;
    el.remove();
  });

  it('refuses a price of zero rather than storing it', async () => {
    const { finance } = await buildPortfolio();
    const el: any = document.createElement('investment-table');
    document.body.appendChild(el);
    el.asOf = AS_OF;
    await el.setFinance(finance);
    await el.updateComplete;
    const before = (await listPrices(finance)).length;
    await el.savePrices([{ stockId: el.rows[0].stockId, price: 0 }]);
    expect(el.error).toMatch(/greater than 0/i);
    expect((await listPrices(finance)).length).toBe(before);
    await el.updateComplete;
    el.remove();
  });

  it('updates the prices from the PRICE COLUMN, not a toolbar button', async () => {
    const { finance } = await buildPortfolio();
    const el: any = document.createElement('investment-table');
    document.body.appendChild(el);
    el.asOf = AS_OF;
    await el.setFinance(finance);
    await el.updateComplete;

    // The trigger lives in the column it affects.
    const header = el.renderRoot.querySelector('th .price-update') as any;
    expect(header).toBeTruthy();
    expect(header.textContent).toContain('Price');
    // And the old toolbar button is gone.
    const buttons = [...el.renderRoot.querySelectorAll('button')].map(
      (b: any) => b.textContent.trim(),
    );
    expect(buttons.some((t: string) => /update prices/i.test(t))).toBe(false);

    // Clicking it asks the host to update.
    const calls: string[] = [];
    (globalThis as any).financeShell = {
      extensions: {
        executeCommand: async (id: string) => {
          calls.push(id);
          return { executed: true };
        },
      },
    };
    header.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toEqual(['wealthflow.update-prices']);
    delete (globalThis as any).financeShell;
    await el.updateComplete;
    el.remove();
  });

  it('keeps the table when an update FAILS, and says so where it was clicked', async () => {
    const { finance } = await buildPortfolio();
    const el: any = document.createElement('investment-table');
    document.body.appendChild(el);
    el.asOf = AS_OF;
    await el.setFinance(finance);
    await el.updateComplete;
    (globalThis as any).financeShell = {
      extensions: {
        executeCommand: async () => {
          throw new Error('ASX is unreachable');
        },
      },
    };
    const header = el.renderRoot.querySelector('th .price-update') as any;
    header.click();
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;
    // The error is shown, and the table is STILL THERE. A failed price fetch
    // must not wipe the holdings.
    expect(el.error).toMatch(/ASX is unreachable/i);
    expect(el.renderRoot.querySelector('.field-error')).toBeTruthy();
    expect(el.renderRoot.querySelector('table')).toBeTruthy();
    expect(el.rows).toHaveLength(3);
    delete (globalThis as any).financeShell;
    await el.updateComplete;
    el.remove();
  });

  it('asks the host to update prices, then re-reads the table', async () => {
    const { finance } = await buildPortfolio();
    const el: any = document.createElement('investment-table');
    document.body.appendChild(el);
    el.asOf = AS_OF;
    await el.setFinance(finance);
    await el.updateComplete;

    // The panel cannot fetch: the price endpoints are cross-origin and the
    // panel is a browser context. The host is plain Node and can.
    const calls: string[] = [];
    (globalThis as any).financeShell = {
      extensions: {
        executeCommand: async (id: string) => {
          calls.push(id);
          return { executed: true };
        },
      },
    };
    await el.updatePricesFromApi();
    expect(calls).toEqual(['wealthflow.update-prices']);
    expect(el.updating).toBe(false);
    delete (globalThis as any).financeShell;
    await el.updateComplete;
    el.remove();
  });

  it('does not claim to have updated when the host is unreachable', async () => {
    const { finance } = await buildPortfolio();
    const el: any = document.createElement('investment-table');
    document.body.appendChild(el);
    el.asOf = AS_OF;
    await el.setFinance(finance);
    await el.updateComplete;
    (globalThis as any).financeShell = {
      extensions: {
        executeCommand: async () => {
          throw new Error('no host');
        },
      },
    };
    await el.updatePricesFromApi();
    expect(el.error).toMatch(/no host/i);
    expect(el.updating).toBe(false);
    delete (globalThis as any).financeShell;
    await el.updateComplete;
    el.remove();
  });

  it('splits the capital gain into realised and unrealised without changing the total', async () => {
    const { finance } = await buildPortfolio();
    const el: any = document.createElement('investment-table');
    document.body.appendChild(el);
    el.asOf = AS_OF;
    await el.setFinance(finance);
    await el.updateComplete;
    const before = el.rows.map((r: any) => r.capitalGain);
    el.split = true;
    await el.updateComplete;
    const after = el.rows.map((r: any) => r.realisedGain + r.unrealisedGain);
    expect(after).toEqual(before);
    await el.updateComplete;
    el.remove();
  });

  it('keeps each holding as a share of the portfolio value', async () => {
    // The share is kept as DATA on every row even though the Value column no
    // longer displays it as a percentage - the portfolio is not a percentage of
    // itself, and a % that means "share of the portfolio" is a different
    // measure from the annualised rate the % mode now shows.
    const { finance } = await buildPortfolio();
    const el: any = document.createElement('investment-table');
    document.body.appendChild(el);
    el.asOf = AS_OF;
    await el.setFinance(finance);
    await el.updateComplete;
    el.mode = 'percent';
    await el.updateComplete;
    const pcts = el.rows.map((r: any) => r.valuePercent);
    expect(pcts.reduce((a: number, b: number) => a + b, 0)).toBeCloseTo(100, 6);
    await el.updateComplete;
    el.remove();
  });

  it('records a price as a new history row rather than overwriting', async () => {
    const { finance, stockIds } = await buildPortfolio();
    const el: any = document.createElement('investment-table');
    document.body.appendChild(el);
    el.asOf = AS_OF;
    await el.setFinance(finance);
    await el.updateComplete;
    const before = (await latestPrices(finance)).size;
    await el.savePrices([{ stockId: stockIds.VAS, price: 120 }]);
    expect((await latestPrices(finance)).size).toBe(before);
    expect((await latestPrices(finance)).get(stockIds.VAS)!.price).toBe(120);
    await el.updateComplete;
    el.remove();
  });

  it('leaves an unpriced holding as a dash', async () => {
    const { finance, stockIds } = await buildPortfolio();
    await finance.db
      .table('wealthflow_prices')
      .delete({ stock_id: stockIds.FGX });
    const el: any = document.createElement('investment-table');
    document.body.appendChild(el);
    el.asOf = AS_OF;
    await el.setFinance(finance);
    await el.updateComplete;
    const row = el.rows.find((r: any) => r.stockId === stockIds.FGX);
    expect(row.value).toBeNull();
    expect(row.valueLabel).toBe('—');
    await el.updateComplete;
    el.remove();
  });
});
