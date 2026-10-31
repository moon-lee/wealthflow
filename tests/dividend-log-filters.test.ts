// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { createMockFinance } from '../src/mock/finance-mock.js';
import { createStock } from '../src/dao/stocks.js';
import { createDividend } from '../src/dao/dividends.js';
import '../src/ui/dividend-log.js';

/**
 * The filter select in a named column header. The stock filter lives where its
 * column name is, like the superannuation Entry filter, rather than in a strip
 * above the table.
 */
function headerFilter(root: ShadowRoot, column: string): HTMLSelectElement {
  const th = [...root.querySelectorAll('th')].find((h) =>
    h.textContent?.includes(column),
  ) as HTMLTableCellElement | undefined;
  const select = th?.querySelector('.col-filter') as HTMLSelectElement | null;
  if (!select) throw new Error(`no filter in the ${column} header`);
  return select;
}

/** Pick an option the way the native list does, then wait for the reload. */
async function choose(
  view: any,
  select: HTMLSelectElement,
  value: string,
): Promise<void> {
  select.value = value;
  select.dispatchEvent(new Event('change'));
  await new Promise((r) => setTimeout(r, 0));
  await view.updateComplete;
}

async function mount(): Promise<{
  el: any;
  root: ShadowRoot;
  vas: any;
  vhy: any;
  vgs: any;
}> {
  const finance: any = createMockFinance();
  const vas: any = await createStock(finance, {
    stock_code: 'VAS',
    stock_full_name: 'Vanguard Australian Shares',
    shares: 10,
  });
  const vhy: any = await createStock(finance, {
    stock_code: 'VHY',
    stock_full_name: 'Vanguard High Yield',
    shares: 20,
  });
  // A holding with no receipts, so a filter can legitimately match nothing.
  const vgs: any = await createStock(finance, {
    stock_code: 'VGS',
    stock_full_name: 'Vanguard Global Shares',
    shares: 5,
  });
  await createDividend(
    finance,
    {
      stock_id: vas.id,
      date: '2025-08-01',
      type: 'trust',
      gross: 100,
      franking: 30,
      finance_year: '2025-2026',
    },
    '07-01',
  );
  await createDividend(
    finance,
    {
      stock_id: vhy.id,
      date: '2025-09-01',
      type: 'non_trust',
      gross: 200,
      franking: 0,
      finance_year: '2025-2026',
    },
    '07-01',
  );
  const el: any = document.createElement('dividend-log');
  document.body.appendChild(el);
  el.fy = '2025-2026';
  await el.setFinance(finance);
  await el.updateComplete;
  return { el, root: el.renderRoot as ShadowRoot, vas, vhy, vgs };
}

describe('dividend log filters', () => {
  it('puts the stock filter in its column header, and only there', async () => {
    const { el, root } = await mount();

    // The old strip above the table is gone; the filter moved into the table.
    expect(root.querySelector('.log-filters')).toBeNull();

    const holding = headerFilter(root, 'Holding');
    expect(holding.closest('th')?.textContent).toContain('Holding');

    // Type is a plain column: the type filter was removed, not relocated.
    const typeTh = [...root.querySelectorAll('th')].find((h) =>
      h.textContent?.includes('Type'),
    ) as HTMLTableCellElement | undefined;
    expect(typeTh?.querySelector('.col-filter')).toBeNull();
    expect(typeTh?.querySelector('.th-filter')).toBeNull();
    expect(typeTh?.textContent?.trim()).toBe('Type');

    // Starts unfiltered, so nothing is hidden before the person asks.
    expect(holding.value).toBe('all');
    expect([...holding.options].map((o) => o.textContent?.trim())).toEqual([
      'All stocks',
      'VAS',
      'VGS',
      'VHY',
    ]);
    // The header states the current choice, not just the column name.
    expect(
      holding.closest('th')?.querySelector('.th-filter .current')?.textContent,
    ).toContain('All stocks');

    el.remove();
  });

  it('narrows by holding from the header', async () => {
    const { el, root, vas, vhy } = await mount();
    const holding = headerFilter(root, 'Holding');
    const stockIds = () => el.sortedEntries.map((e: any) => e.stock_id).sort();

    expect(stockIds()).toEqual([vas.id, vhy.id].sort());

    await choose(el, holding, String(vas.id));
    expect(el.stockFilter).toBe(vas.id);
    expect(stockIds()).toEqual([vas.id]);
    expect(holding.value).toBe(String(vas.id));
    expect(
      holding.closest('th')?.querySelector('.th-filter .current')?.textContent,
    ).toContain('VAS');

    // Back to everything: the filter must not be a one-way door.
    await choose(el, holding, 'all');
    expect(stockIds()).toEqual([vas.id, vhy.id].sort());
    el.remove();
  });

  it('keeps the header filter when the holding matches nothing', async () => {
    const { el, root, vgs } = await mount();
    const holding = headerFilter(root, 'Holding');

    await choose(el, holding, String(vgs.id));
    expect(el.entries).toHaveLength(0);

    // Without a table there would be no way back to All, so the header stays.
    expect(root.querySelector('.table-wrap')).toBeTruthy();
    expect(headerFilter(root, 'Holding').value).toBe(String(vgs.id));
    expect(root.textContent?.replace(/\s+/g, ' ')).toContain(
      'No receipts match this filter.',
    );
    el.remove();
  });
});
