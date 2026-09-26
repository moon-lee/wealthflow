// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { createMockFinance } from '../src/mock/finance-mock.js';
import { createBank } from '../src/dao/banks.js';
import { createInterestEntry } from '../src/dao/interest-entries.js';
import { createStock } from '../src/dao/stocks.js';
import { createDividend } from '../src/dao/dividends.js';

describe('overview-view', () => {
  it('registers element', async () => {
    await import('../src/ui/overview-view.js');
    expect(customElements.get('overview-view')).toBeDefined();
  });

  it('renders mortgage-style cards for seeded FY data', async () => {
    const finance: any = createMockFinance();
    const bank: any = await createBank(finance, {
      bank_code: 'UBank',
      account_number: '9',
    });
    await createInterestEntry(
      finance,
      {
        bank_id: bank.id,
        date: '2025-07-31',
        amount: 10,
        finance_year: '2025-2026',
      },
      '07-01',
    );
    const stock: any = await createStock(finance, {
      stock_code: 'VAS',
      stock_full_name: 'Vanguard',
      shares: 5,
    });
    await createDividend(
      finance,
      {
        stock_id: stock.id,
        date: '2025-08-01',
        type: 'non_trust',
        gross: 100,
        franking: 30,
        finance_year: '2025-2026',
      },
      '07-01',
    );
    const el = document.createElement('overview-view') as any;
    document.body.appendChild(el);
    el.fy = '2025-2026';
    await el.setFinance(finance);
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;
    const root = el.renderRoot as ShadowRoot;
    // Mortgage dialect: section headers with badges, stat-grids per card.
    expect(
      root.querySelectorAll('.section-header').length,
    ).toBeGreaterThanOrEqual(3);
    expect(root.querySelectorAll('.stat-grid').length).toBeGreaterThanOrEqual(
      3,
    );
    expect(root.querySelectorAll('.rate-badge').length).toBeGreaterThanOrEqual(
      3,
    );
    const text = root.textContent ?? '';
    expect(text).toContain('Dividends');
    expect(text).toContain('Interest');
    expect(text).toContain('Combined taxable');
    expect(text).toContain('$100.00');
    // Per-stock breakdown is asserted at the data contract level: happy-dom
    // drops conditionally-rendered nested <table> parts (verified with an
    // identical-markup direct-render probe), while real browsers render
    // mortgage's identical hist-table pattern. Do not assert table DOM here.
    expect(el.summary.dividends.byStock).toEqual([
      {
        stockId: stock.id,
        stock_code: 'VAS',
        stock_full_name: 'Vanguard',
        gross: 100,
        franking: 30,
      },
    ]);
    expect(el.summary.combined).toEqual({ gross: 110, franking: 30 });
    el.remove();
  });

  it('toggles the log forms inside each section', async () => {
    const finance: any = createMockFinance();
    const el = document.createElement('overview-view') as any;
    document.body.appendChild(el);
    el.fy = '2025-2026';
    await el.setFinance(finance);
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;
    const root = el.renderRoot as ShadowRoot;
    const btn = (label: string) =>
      [...root.querySelectorAll('button')].find(
        (b: any) => b.textContent?.trim() === label,
      ) as HTMLButtonElement;
    expect(root.querySelector('dividend-form')).toBeFalsy();
    expect(root.querySelector('interest-form')).toBeFalsy();
    btn('Log dividend').click();
    await el.updateComplete;
    expect(root.querySelector('dividend-form')).toBeTruthy();
    btn('Log interest').click();
    await el.updateComplete;
    expect(root.querySelector('interest-form')).toBeTruthy();
    btn('Hide form').click();
    await el.updateComplete;
    expect(root.querySelector('dividend-form')).toBeFalsy();
    expect(root.querySelector('interest-form')).toBeTruthy();
    el.remove();
  });
});
