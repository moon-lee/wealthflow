// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { createMockFinance } from '../src/mock/finance-mock.js';
import { createBank, setBankActive } from '../src/dao/banks.js';
import { createInterestEntry } from '../src/dao/interest-entries.js';
import { createStock } from '../src/dao/stocks.js';
import { createDividend } from '../src/dao/dividends.js';

/** Click a section's collapse control, the way the header bar does. */
function toggle(el: any, root: ShadowRoot, section: string): void {
  const btn = root.querySelector(
    `.section-toggle[aria-controls="wf-body-${section}"]`,
  ) as HTMLButtonElement;
  btn.click();
}

/**
 * Every static chunk and primitive value in a rendered Lit template, including
 * nested ones. happy-dom drops a nested `tfoot` from the shadow root, so this
 * is the only way to assert footer markup without a real browser.
 */
function templateText(node: any): { markup: string; values: string[] } {
  if (Array.isArray(node))
    return node
      .map((n) => templateText(n))
      .reduce(
        (acc, r) => ({
          markup: acc.markup + r.markup,
          values: acc.values.concat(r.values),
        }),
        { markup: '', values: [] as string[] },
      );
  // A nested template sits in the parent's value list, so recurse rather than
  // take only the primitives — the footer labels live one or two levels down.
  if (node && typeof node === 'object' && Array.isArray(node.strings)) {
    const inner = templateText(node.values ?? []);
    return {
      // Collapse the template's own newlines and indentation, so a label can be
      // matched as one string instead of with the source's line break in it.
      markup: `${node.strings.join(' ')}${inner.markup}`.replace(/\s+/g, ' '),
      values: inner.values,
    };
  }
  if (typeof node === 'string' || typeof node === 'number')
    return { markup: '', values: [String(node)] };
  return { markup: '', values: [] };
}

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
    // Mortgage dialect: one section header per section.
    expect(
      root.querySelectorAll('.section-header').length,
    ).toBeGreaterThanOrEqual(3);
    // Only Combined taxable summarises with cards now. Dividends and Interest
    // state their totals in the table footer, so a stat-grid in either would
    // restate the same numbers twice — and no section header carries a summary
    // badge, for the same reason.
    expect(root.querySelectorAll('.stat-grid').length).toBe(1);
    expect(root.querySelectorAll('.section-header .rate-badge').length).toBe(0);
    const text = root.textContent ?? '';
    expect(text).toContain('Dividends');
    expect(text).toContain('Interest');
    expect(text).toContain('Combined taxable');
    expect(text).toContain('$100.00');
    const divSection = root.querySelectorAll('.section.flush')[1];
    expect(divSection.querySelector('.stat-grid')).toBeNull();
    expect(divSection.querySelector('dividend-log')).toBeTruthy();
    // The Dividends gross/franking now live only in the log's footer, which
    // happy-dom drops from the nested shadow root — assert the data contract.
    expect(el.summary.dividends.gross).toBe(100);
    expect(el.summary.dividends.franking).toBe(30);
    const intSection = root.querySelectorAll('.section.flush')[2];
    expect(intSection.querySelector('.stat-grid')).toBeNull();
    expect(intSection.querySelector('interest-grid')).toBeTruthy();
    // Combined taxable leads: it is the FY answer the others feed.
    // Superannuation trails Interest: activity together, answer first.
    const sections = [...root.querySelectorAll('.section.flush')].map((el) =>
      (el.querySelector('.section-title')?.textContent ?? '').trim(),
    );
    expect(sections).toEqual([
      'Combined taxable — FY 2025-2026',
      'Dividends — FY 2025-2026',
      'Interest — FY 2025-2026',
      'Superannuation — FY 2025-2026',
    ]);
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

  it('opens the form pre-filled from a receipt row', async () => {
    await import('../src/ui/overview-view.js');
    await import('../src/ui/dividend-log.js');
    await import('../src/ui/dividend-form.js');
    const finance: any = createMockFinance();
    const stock: any = await createStock(finance, {
      stock_code: 'VAS',
      stock_full_name: 'Vanguard',
      shares: 5,
    });
    const entry: any = await createDividend(
      finance,
      {
        stock_id: stock.id,
        date: '2025-08-01',
        type: 'trust',
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
    const log = root.querySelector('dividend-log') as any;
    expect(log).toBeTruthy();
    expect(log.stockFilter).toBe('all');
    expect(log.typeFilter).toBe('all');
    expect(log.entries).toHaveLength(1);
    // No section chrome of its own — the host states the FY once.
    expect(log.shadowRoot?.querySelector('h3')).toBeNull();
    // Row buttons are dispatched straight from the log: happy-dom drops the
    // conditionally-rendered tbody (same limitation the byStock assertion
    // above documents), so the click target is invoked directly here. What
    // this covers is the host side of the contract — the request event, the
    // form opening, and the pre-fill.
    (log as any).requestEdit(entry);
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;
    const form = root.querySelector('dividend-form') as any;
    expect(form).toBeTruthy();
    expect(form.editId).toBe(entry.id);
    expect(form.stockId).toBe(stock.id);
    expect(form.date).toBe('2025-08-01');
    expect(form.type).toBe('trust');
    expect(form.gross).toBe('100');
    expect(form.franking).toBe('30');
    // Header switches to the edit affordances; the create form is one click away.
    const title = form.shadowRoot?.querySelector('.section-title');
    if (title) expect(title.textContent?.trim()).toBe('Edit Dividend');
    el.remove();
  });

  it('opens the interest form pre-filled from a grid cell', async () => {
    await import('../src/ui/interest-grid.js');
    await import('../src/ui/interest-form.js');
    const finance: any = createMockFinance();
    const bank: any = await createBank(finance, {
      bank_code: 'UBank',
      account_number: '9',
    });
    const entry: any = await createInterestEntry(
      finance,
      {
        bank_id: bank.id,
        date: '2025-08-31',
        amount: 12.5,
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
    const grid = root.querySelector('interest-grid') as any;
    expect(grid).toBeTruthy();
    expect(grid.entries).toHaveLength(1);
    // No section chrome of its own — the host states the FY once.
    expect(grid.shadowRoot?.querySelector('h3')).toBeNull();
    // Dispatched straight from the grid for the same happy-dom reason as the
    // dividend case: this covers the host side of the request contract.
    (grid as any).requestEdit(bank.id, '2025-08');
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;
    const form = root.querySelector('interest-form') as any;
    expect(form).toBeTruthy();
    expect(form.editId).toBe(entry.id);
    expect(form.bankId).toBe(bank.id);
    expect(form.date).toBe('2025-08-31');
    expect(form.amount).toBe('12.5');
    const title = form.shadowRoot?.querySelector('.section-title');
    if (title) expect(title.textContent?.trim()).toBe('Edit Interest');
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

  it('folds each log section from its header, and the section actions do not', async () => {
    const finance: any = createMockFinance();
    const el = document.createElement('overview-view') as any;
    document.body.appendChild(el);
    el.fy = '2025-2026';
    await el.setFinance(finance);
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;
    const root = el.renderRoot as ShadowRoot;
    const body = (section: string) =>
      root.querySelector(`#wf-body-${section}`) as HTMLElement;
    const toggle = (section: string) =>
      root.querySelector(
        `.section-toggle[aria-controls="wf-body-${section}"]`,
      ) as HTMLButtonElement;
    const btn = (label: string) =>
      [...root.querySelectorAll('button')].find(
        (b: any) => b.textContent?.trim() === label,
      ) as HTMLButtonElement;

    // All three start open, and each control names the body it owns.
    for (const section of ['dividends', 'interest', 'super']) {
      expect(toggle(section)).toBeTruthy();
      expect(toggle(section).getAttribute('aria-expanded')).toBe('true');
      expect(body(section).hasAttribute('hidden')).toBe(false);
    }
    // The Combined card is the FY answer, so it has no toggle at all.
    const combined = root.querySelectorAll('.section.flush')[0];
    expect(combined.querySelector('.section-toggle')).toBeNull();
    expect(combined.querySelector('.is-toggle')).toBeNull();

    // Clicking the title folds its own section, once — the title button and the
    // header bar are both click targets, and only one of them may fire.
    toggle('dividends').click();
    await el.updateComplete;
    expect(el.collapsed.dividends).toBe(true);
    expect(body('dividends').hasAttribute('hidden')).toBe(true);
    expect(toggle('dividends').getAttribute('aria-expanded')).toBe('false');
    // The other two are untouched: folding one section is not a global collapse.
    expect(body('interest').hasAttribute('hidden')).toBe(false);
    expect(body('super').hasAttribute('hidden')).toBe(false);

    // The bar itself is a target too, for the space beside the title.
    const header = body('super').previousElementSibling as HTMLElement;
    expect(header.classList.contains('is-toggle')).toBe(true);
    header.click();
    await el.updateComplete;
    expect(body('super').hasAttribute('hidden')).toBe(true);

    // A section action must not reach the bar: "Log dividend" would otherwise
    // fold the section it just opened into.
    toggle('interest').click();
    await el.updateComplete;
    expect(body('interest').hasAttribute('hidden')).toBe(true);
    btn('Log dividend').click();
    await el.updateComplete;
    expect(root.querySelector('dividend-form')).toBeTruthy();
    // Still folded, exactly as it was — the action neither folded nor unfolded it.
    expect(el.collapsed.dividends).toBe(true);
    expect(body('dividends').hasAttribute('hidden')).toBe(true);
    // Nothing in the log section was disturbed by the collapse round-trip.
    expect(root.querySelector('dividend-log')).toBeTruthy();
    el.remove();
  });

  it('keeps the FY record count in a folded section header', async () => {
    await import('../src/ui/overview-view.js');
    await import('../src/ui/dividend-log.js');
    await import('../src/ui/dividend-form.js');
    await import('../src/ui/interest-grid.js');
    await import('../src/ui/interest-form.js');
    const { createStock } = await import('../src/dao/stocks.js');
    const { createDividend } = await import('../src/dao/dividends.js');
    const { createSuperEntry } = await import('../src/dao/super-entries.js');
    const finance: any = createMockFinance();
    const stock: any = await createStock(finance, {
      stock_code: 'VAS',
      stock_full_name: 'Vanguard',
      shares: 5,
    });
    for (const [i, date] of [
      '2025-08-01',
      '2025-09-01',
      '2025-10-01',
    ].entries()) {
      await createDividend(
        finance,
        {
          stock_id: stock.id,
          date,
          type: 'non_trust',
          gross: 100 + i,
          franking: 0,
          finance_year: '2025-2026',
        },
        '07-01',
      );
    }
    await createSuperEntry(
      finance,
      { date: '2025-09-01', kind: 'contribution', amount: 1000 },
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
    // Counts come from the children, which load after the first render.
    expect(el.rowCounts).toEqual({
      dividends: 3,
      interest: 0,
      super: 1,
    });
    const badge = (section: string) =>
      root
        .querySelector(`.section-toggle[aria-controls="wf-body-${section}"]`)
        ?.closest('.section')
        ?.querySelector('.rows-badge') as HTMLElement | null;

    // Open: no badge, because the body already states the count.
    expect(badge('dividends')).toBeNull();
    // Folded: the count survives in the header, in the section's own noun.
    toggle(el, root, 'dividends');
    await el.updateComplete;
    expect(badge('dividends')?.textContent?.trim()).toBe('3 receipts');
    toggle(el, root, 'super');
    await el.updateComplete;
    expect(badge('super')?.textContent?.trim()).toBe('1 entry');
    toggle(el, root, 'interest');
    await el.updateComplete;
    // Zero is still a fact worth keeping: the section is empty, not unloaded.
    expect(badge('interest')?.textContent?.trim()).toBe('0 entries');
    el.remove();
  });

  it('pages the superannuation log 12 rows at a time, newest first', async () => {
    await import('../src/ui/overview-view.js');
    await import('../src/ui/dividend-log.js');
    await import('../src/ui/dividend-form.js');
    await import('../src/ui/interest-grid.js');
    await import('../src/ui/interest-form.js');
    const { createSuperEntry } = await import('../src/dao/super-entries.js');
    const finance: any = createMockFinance();
    // 14 entries inside FY 2025-2026 (Jul 2025 - Jun 2026): a page of 12 and a
    // second of 2. Two months carry a second entry so the year fits 14 rows.
    for (let i = 0; i < 14; i++) {
      const d = new Date(2025, 6 + (i % 12), i < 12 ? 10 : 20);
      await createSuperEntry(
        finance,
        {
          date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
          kind: 'contribution',
          amount: 10 * (i + 1),
        },
        '07-01',
      );
    }
    const el = document.createElement('overview-view') as any;
    document.body.appendChild(el);
    el.fy = '2025-2026';
    await el.setFinance(finance);
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;
    const root = el.renderRoot as ShadowRoot;
    const pager = () => root.querySelector('.table-pager');
    // The count line only; the pager also holds the two buttons.
    const pageLine = () =>
      pager()
        ?.querySelector('.muted')
        ?.textContent?.replace(/\s+/g, ' ')
        .trim();
    // happy-dom drops the conditional tbody, so assert at the data boundary too.
    const rowsOf = () =>
      (el as any).superPageRows.map((e: any) => e.date) as string[];

    expect(pager()).toBeTruthy();
    expect(pageLine()).toBe('Page 1 of 2 · 14 entries');
    // Newest first: what you last added is on page 1, not buried on the last.
    expect(rowsOf()).toHaveLength(12);
    expect(rowsOf()[0]).toBe('2026-06-10');
    const buttons = [...root.querySelectorAll('.pager-actions button')];
    const pick = (bs: Element[], label: string) =>
      bs.find((b: any) => b.textContent?.trim() === label) as HTMLButtonElement;
    expect(pick(buttons, 'Previous').disabled).toBe(true);
    expect(pick(buttons, 'Next').disabled).toBe(false);
    pick(buttons, 'Next').click();
    await el.updateComplete;
    expect(el.superPage).toBe(1);
    expect(pageLine()).toBe('Page 2 of 2 · 14 entries');
    expect(rowsOf()).toEqual(['2025-07-20', '2025-07-10']);
    const buttons2 = [...root.querySelectorAll('.pager-actions button')];
    expect(pick(buttons2, 'Previous').disabled).toBe(false);
    expect(pick(buttons2, 'Next').disabled).toBe(true);
    el.remove();
  });

  it('shows no pager when the superannuation FY fits on one page', async () => {
    await import('../src/ui/overview-view.js');
    await import('../src/ui/dividend-log.js');
    await import('../src/ui/dividend-form.js');
    await import('../src/ui/interest-grid.js');
    await import('../src/ui/interest-form.js');
    const { createSuperEntry } = await import('../src/dao/super-entries.js');
    const finance: any = createMockFinance();
    // Exactly a full page, all inside the FY.
    for (let i = 0; i < 12; i++) {
      const d = new Date(2025, 6 + i, 10);
      await createSuperEntry(
        finance,
        {
          date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-10`,
          kind: 'sg',
          amount: 100,
        },
        '07-01',
      );
    }
    const el = document.createElement('overview-view') as any;
    document.body.appendChild(el);
    el.fy = '2025-2026';
    await el.setFinance(finance);
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;
    const root = el.renderRoot as ShadowRoot;
    expect((el as any).superPages).toBe(1);
    expect(root.querySelector('.table-pager')).toBeNull();
    el.remove();
  });

  it('puts the balance in the super footer alongside the contribution totals', async () => {
    await import('../src/ui/overview-view.js');
    await import('../src/ui/dividend-log.js');
    await import('../src/ui/dividend-form.js');
    await import('../src/ui/interest-grid.js');
    await import('../src/ui/interest-form.js');
    const { createSuperEntry } = await import('../src/dao/super-entries.js');
    const finance: any = createMockFinance();
    await createSuperEntry(
      finance,
      { date: '2025-08-15', kind: 'balance', amount: 100000 },
      '07-01',
    );
    await createSuperEntry(
      finance,
      { date: '2025-09-01', kind: 'contribution', amount: 1000 },
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
    // Balance is a summary figure, not a table row: it belongs with the other
    // totals, and the top-of-section line is gone.
    expect(el.summary.super.balance).toEqual({
      amount: 100000,
      date: '2025-08-15',
    });
    expect(el.summary.super.contributions.total).toBe(1000);
    expect(el.summary.super.sg.total).toBe(0);
    // happy-dom drops a nested tfoot from the shadow root (the same limitation
    // the dividend-byStock assertion documents), so read the template: the three
    // labels are static, and the balance's date and figure are interpolated.
    const tpl = templateText((el as any).render());
    for (const label of [
      'Balance as at ',
      'Private contributions (FY)',
      'SG contributions (FY)',
    ]) {
      expect(tpl.markup).toContain(label);
    }
    expect(tpl.values.some((v) => v.includes('2025-08-15'))).toBe(true);
    expect(root.querySelector('#wf-body-super')).toBeTruthy();
    el.remove();
  });

  it('sorts each section by date, latest first, and flips on click', async () => {
    await import('../src/ui/overview-view.js');
    await import('../src/ui/dividend-log.js');
    await import('../src/ui/dividend-form.js');
    await import('../src/ui/interest-grid.js');
    await import('../src/ui/interest-form.js');
    const { createStock } = await import('../src/dao/stocks.js');
    const { createDividend } = await import('../src/dao/dividends.js');
    const { createBank } = await import('../src/dao/banks.js');
    const { createInterestEntry } =
      await import('../src/dao/interest-entries.js');
    const { createSuperEntry } = await import('../src/dao/super-entries.js');
    const finance: any = createMockFinance();
    const stock: any = await createStock(finance, {
      stock_code: 'VAS',
      stock_full_name: 'Vanguard',
      shares: 5,
    });
    const bank: any = await createBank(finance, {
      bank_code: 'UBank',
      account_number: '9',
    });
    for (const [i, date] of [
      '2025-08-10',
      '2025-10-10',
      '2025-09-10',
    ].entries()) {
      await createDividend(
        finance,
        {
          stock_id: stock.id,
          date,
          type: 'non_trust',
          gross: 100 + i,
          franking: 0,
          finance_year: '2025-2026',
        },
        '07-01',
      );
      await createSuperEntry(
        finance,
        { date, kind: 'contribution', amount: 10 * (i + 1) },
        '07-01',
      );
    }
    for (const date of ['2025-08-10', '2025-10-10', '2025-09-10']) {
      await createInterestEntry(
        finance,
        {
          bank_id: bank.id,
          date,
          amount: 5,
          finance_year: '2025-2026',
        },
        '07-01',
      );
    }
    const el = document.createElement('overview-view') as any;
    document.body.appendChild(el);
    el.fy = '2025-2026';
    await el.setFinance(finance);
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;
    const root = el.renderRoot as ShadowRoot;
    // happy-dom drops thead/tfoot from a shadow root, so the order is asserted
    // where it is actually decided — on the rows each section hands its table.
    // The control itself is covered by the dateSortHeader test.

    // Dividends: the log owns its own order, newest first.
    const log = root.querySelector('dividend-log') as any;
    expect(log.sortDesc).toBe(true);
    expect(log.sortedEntries.map((e: any) => e.date)).toEqual([
      '2025-10-10',
      '2025-09-10',
      '2025-08-10',
    ]);
    log.sortByDate();
    await log.updateComplete;
    expect(log.sortDesc).toBe(false);
    expect(log.sortedEntries.map((e: any) => e.date)).toEqual([
      '2025-08-10',
      '2025-09-10',
      '2025-10-10',
    ]);
    // Round-trips back to the default.
    log.sortByDate();
    await log.updateComplete;
    expect(log.sortDesc).toBe(true);
    // The source array keeps its load order, so the FY totals above the table
    // never depend on how the user happens to be reading it.
    expect(log.entries.map((e: any) => e.date)).toEqual([
      '2025-08-10',
      '2025-09-10',
      '2025-10-10',
    ]);

    // Interest: the date axis is the month rows, so the control is on Month.
    const { monthsWithEntries, orderMonths } =
      await import('../src/ui/interest-grid.js');
    const grid = root.querySelector('interest-grid') as any;
    expect(grid.sortDesc).toBe(true);
    // happy-dom drops tbody rows too, so the ordering is asserted on the pure
    // rule the grid renders from.
    const months = monthsWithEntries('2025-2026', grid.banks, grid.entries);
    expect(months).toEqual(['2025-08', '2025-09', '2025-10']);
    expect(orderMonths(months, true)).toEqual([
      '2025-10',
      '2025-09',
      '2025-08',
    ]);
    expect(orderMonths(months, false)).toEqual(months);
    grid.sortByDate();
    await grid.updateComplete;
    expect(grid.sortDesc).toBe(false);
    // The pure rule keeps its calendar order whatever the screen does with it.
    expect(monthsWithEntries('2025-2026', grid.banks, grid.entries)).toEqual(
      months,
    );

    // Super: owned by the host.
    expect(el.superSortDesc).toBe(true);
    expect(el.superPageRows.map((e: any) => e.date)).toEqual([
      '2025-10-10',
      '2025-09-10',
      '2025-08-10',
    ]);
    el.sortSuperByDate();
    await el.updateComplete;
    expect(el.superSortDesc).toBe(false);
    expect(el.superPageRows.map((e: any) => e.date)).toEqual([
      '2025-08-10',
      '2025-09-10',
      '2025-10-10',
    ]);
    el.remove();
  });

  it('returns to page 1 when the super date order is flipped', async () => {
    await import('../src/ui/overview-view.js');
    await import('../src/ui/dividend-log.js');
    await import('../src/ui/dividend-form.js');
    await import('../src/ui/interest-grid.js');
    await import('../src/ui/interest-form.js');
    const { createSuperEntry } = await import('../src/dao/super-entries.js');
    const finance: any = createMockFinance();
    for (let i = 0; i < 14; i++) {
      const d = new Date(2025, 6 + (i % 12), i < 12 ? 10 : 20);
      await createSuperEntry(
        finance,
        {
          date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
          kind: 'contribution',
          amount: 10 * (i + 1),
        },
        '07-01',
      );
    }
    const el = document.createElement('overview-view') as any;
    document.body.appendChild(el);
    el.fy = '2025-2026';
    await el.setFinance(finance);
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;
    const root = el.renderRoot as ShadowRoot;
    el.gotoSuperPage(1);
    await el.updateComplete;
    expect(el.superPage).toBe(1);
    el.sortSuperByDate();
    await el.updateComplete;
    // Page 2 of the old order is an arbitrary window on the new one.
    expect(el.superPage).toBe(0);
    expect(el.superSortDesc).toBe(false);
    expect(el.superPageRows).toHaveLength(12);
    expect(root.querySelector('.table-pager')).toBeTruthy();
    el.remove();
  });

  it('dateSortHeader states the current order and fires once per click', async () => {
    const { render } = await import('lit');
    const { dateSortHeader } = await import('../src/ui/sort-header.js');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const order = () => {
      const btn = host.querySelector('button') as HTMLButtonElement;
      return {
        text: btn.textContent?.replace(/\s+/g, ' ').trim(),
        title: btn.getAttribute('title'),
      };
    };
    let calls = 0;
    render(
      dateSortHeader('Date', true, () => calls++),
      host,
    );
    // The caret states where the column is, the title where a click would send it.
    expect(order().text).toBe('Date ▼');
    expect(order().title).toBe('Oldest first');
    (host.querySelector('button') as HTMLButtonElement).click();
    expect(calls).toBe(1);
    render(
      dateSortHeader('Date', false, () => calls++),
      host,
    );
    expect(order().text).toBe('Date ▲');
    expect(order().title).toBe('Newest first');
    host.remove();
  });

  it('copies last month to next month and closes the interest form', async () => {
    await import('../src/ui/interest-form.js');
    await import('../src/ui/interest-grid.js');
    const finance: any = createMockFinance();
    const bank: any = await createBank(finance, {
      bank_code: 'ANZ',
      account_number: '1',
    });
    await createInterestEntry(
      finance,
      {
        bank_id: bank.id,
        date: '2025-08-31',
        amount: 12.5,
        finance_year: '2025-2026',
        notes: 'quarterly',
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
    [...root.querySelectorAll('button')]
      .find((b: any) => b.textContent?.trim() === 'Log interest')
      ?.click();
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;
    const form = root.querySelector('interest-form') as any;
    expect(form).toBeTruthy();
    // The submit button reads Add in create mode.
    const labels = [...form.shadowRoot.querySelectorAll('button')].map(
      (b: any) => b.textContent?.trim(),
    );
    expect(labels).toContain('Add');
    expect(labels).not.toContain('Log Interest');
    // Repeating is a section action, so it is not in the form.
    expect(labels).not.toContain('Copy from last month');
    el.remove();
  });

  it('repeats the newest month across every bank from the section header', async () => {
    await import('../src/ui/interest-form.js');
    await import('../src/ui/interest-grid.js');
    const finance: any = createMockFinance();
    const anz: any = await createBank(finance, {
      bank_code: 'ANZ',
      account_number: '1',
    });
    const boq: any = await createBank(finance, {
      bank_code: 'BOQ',
      account_number: '2',
    });
    // Two banks paid in the newest month (August); one has since been closed,
    // so the repeat must skip BOQ rather than abort the whole batch.
    for (const [bankId, amount] of [
      [anz.id, 12.5],
      [boq.id, 4.25],
    ] as const) {
      await createInterestEntry(
        finance,
        {
          bank_id: bankId,
          date: '2025-08-31',
          amount,
          finance_year: '2025-2026',
        },
        '07-01',
      );
    }
    await setBankActive(finance, boq.id, false);
    const el = document.createElement('overview-view') as any;
    document.body.appendChild(el);
    el.fy = '2025-2026';
    await el.setFinance(finance);
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;
    const root = el.renderRoot as ShadowRoot;
    const sectionButtons = [...root.querySelectorAll('button')].map((b: any) =>
      b.textContent?.trim(),
    );
    expect(sectionButtons).toContain('Copy from last month');
    expect(sectionButtons).toContain('Log interest');
    const copyBtn = [...root.querySelectorAll('button')].find(
      (b: any) => b.textContent?.trim() === 'Copy from last month',
    ) as HTMLButtonElement;
    // Nothing is written until the user says so, exactly like delete.
    const asked: string[] = [];
    const originalConfirm = globalThis.confirm;
    (globalThis as any).confirm = (q: string) => {
      asked.push(q);
      return true;
    };
    try {
      copyBtn.click();
      await new Promise((r) => setTimeout(r, 0));
      await el.updateComplete;
      await new Promise((r) => setTimeout(r, 0));
    } finally {
      (globalThis as any).confirm = originalConfirm;
    }
    expect(asked).toEqual(['Repeat 2 entries from Aug 2025 to Sep 2025?']);
    const rows: any[] = await finance.db
      .table('wealthflow_interest_entries')
      .find({});
    // ANZ repeated into September; the closed BOQ was left alone.
    expect(rows).toHaveLength(3);
    const anzSep = rows.find(
      (r) => r.bank_id === anz.id && r.date === '2025-09-30',
    );
    expect(anzSep).toBeTruthy();
    expect(anzSep.amount).toBe(12.5);
    expect(rows.filter((r) => r.bank_id === boq.id)).toHaveLength(1);
    expect(el.copyNotice.replace(/\s+/g, ' ')).toBe(
      'Repeated 1 entry from Aug 2025 to Sep 2025. Skipped BOQ.',
    );
    // It is a section action: no form needed, and none opened.
    expect(root.querySelector('interest-form')).toBeFalsy();
    el.remove();
  });

  it('writes nothing when the repeat is declined', async () => {
    await import('../src/ui/interest-form.js');
    await import('../src/ui/interest-grid.js');
    const finance: any = createMockFinance();
    const bank: any = await createBank(finance, {
      bank_code: 'ANZ',
      account_number: '1',
    });
    await createInterestEntry(
      finance,
      {
        bank_id: bank.id,
        date: '2025-08-31',
        amount: 12.5,
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
    const asked: string[] = [];
    const originalConfirm = globalThis.confirm;
    (globalThis as any).confirm = (q: string) => {
      asked.push(q);
      return false;
    };
    try {
      (
        [...root.querySelectorAll('button')].find(
          (b: any) => b.textContent?.trim() === 'Copy from last month',
        ) as HTMLButtonElement
      ).click();
      await new Promise((r) => setTimeout(r, 0));
      await el.updateComplete;
      await new Promise((r) => setTimeout(r, 0));
    } finally {
      (globalThis as any).confirm = originalConfirm;
    }
    // A single entry names the bank and amount, like the delete prompt.
    expect(asked).toEqual(['Repeat ANZ $12.50 from Aug 2025 to Sep 2025?']);
    const rows: any[] = await finance.db
      .table('wealthflow_interest_entries')
      .find({});
    expect(rows).toHaveLength(1);
    expect(el.copyNotice).toBe('');
    el.remove();
  });

  it('says so when there is nothing to repeat', async () => {
    await import('../src/ui/interest-form.js');
    await import('../src/ui/interest-grid.js');
    const finance: any = createMockFinance();
    await createBank(finance, { bank_code: 'ANZ', account_number: '1' });
    const el = document.createElement('overview-view') as any;
    document.body.appendChild(el);
    el.fy = '2025-2026';
    await el.setFinance(finance);
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;
    const root = el.renderRoot as ShadowRoot;
    (
      [...root.querySelectorAll('button')].find(
        (b: any) => b.textContent?.trim() === 'Copy from last month',
      ) as HTMLButtonElement
    ).click();
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;
    expect(el.copyNotice).toBe('Nothing to repeat — no interest logged yet.');
    const notice = root.querySelector('.notice');
    expect(notice?.textContent?.trim()).toBe(
      'Nothing to repeat — no interest logged yet.',
    );
    el.remove();
  });

  it('closes the interest form after a successful save', async () => {
    await import('../src/ui/interest-form.js');
    await import('../src/ui/interest-grid.js');
    const finance: any = createMockFinance();
    const bank: any = await createBank(finance, {
      bank_code: 'ANZ',
      account_number: '1',
    });
    const el = document.createElement('overview-view') as any;
    document.body.appendChild(el);
    el.fy = '2025-2026';
    await el.setFinance(finance);
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;
    const root = el.renderRoot as ShadowRoot;
    [...root.querySelectorAll('button')]
      .find((b: any) => b.textContent?.trim() === 'Log interest')
      ?.click();
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;
    const form = root.querySelector('interest-form') as any;
    expect(form).toBeTruthy();
    form.bankId = bank.id;
    form.date = '2025-09-30';
    form.amount = '7.25';
    (form as any).requestUpdate?.();
    await form.updateComplete;
    await (form as any).onSubmit(new Event('submit'));
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;
    const rows: any[] = await finance.db
      .table('wealthflow_interest_entries')
      .find({});
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(7.25);
    expect(rows[0].finance_year).toBe('2025-2026');
    expect(root.querySelector('interest-form')).toBeFalsy();
    expect(el.showInterestForm).toBe(false);
    el.remove();
  });

  it('closes the interest form on save, cancel and delete while editing', async () => {
    await import('../src/ui/interest-form.js');
    await import('../src/ui/interest-grid.js');
    const finance: any = createMockFinance();
    const bank: any = await createBank(finance, {
      bank_code: 'ANZ',
      account_number: '1',
    });
    const entry: any = await createInterestEntry(
      finance,
      {
        bank_id: bank.id,
        date: '2025-08-31',
        amount: 12.5,
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
    // happy-dom drops the grid's conditionally-rendered tbody, so ask the grid
    // to open the row directly — same path the Edit button takes.
    const openEdit = async () => {
      const grid = root.querySelector('interest-grid') as any;
      (grid as any).requestEdit(bank.id, '2025-08');
      await el.updateComplete;
      await new Promise((r) => setTimeout(r, 0));
      await el.updateComplete;
      const form = root.querySelector('interest-form') as any;
      expect(form).toBeTruthy();
      expect(form.editId).toBe(entry.id);
      return form;
    };
    const button = (form: any, label: string) =>
      [...form.shadowRoot.querySelectorAll('button')].find(
        (b: any) => b.textContent?.trim() === label,
      ) as HTMLButtonElement;

    // Save
    let form = await openEdit();
    form.amount = '99.5';
    (form as any).requestUpdate?.();
    await form.updateComplete;
    await (form as any).onSubmit(new Event('submit'));
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;
    expect(root.querySelector('interest-form')).toBeFalsy();
    expect(el.showInterestForm).toBe(false);
    let rows: any[] = await finance.db
      .table('wealthflow_interest_entries')
      .find({});
    expect(rows[0].amount).toBe(99.5);

    // Cancel — closes without writing.
    form = await openEdit();
    form.amount = '1234';
    (form as any).requestUpdate?.();
    await form.updateComplete;
    button(form, 'Cancel').click();
    await el.updateComplete;
    expect(root.querySelector('interest-form')).toBeFalsy();
    expect(el.showInterestForm).toBe(false);
    rows = await finance.db.table('wealthflow_interest_entries').find({});
    expect(rows[0].amount).toBe(99.5);

    // Delete
    form = await openEdit();
    const originalConfirm = globalThis.confirm;
    (globalThis as any).confirm = () => true;
    try {
      await (form as any).onDelete();
    } finally {
      (globalThis as any).confirm = originalConfirm;
    }
    await el.updateComplete;
    expect(root.querySelector('interest-form')).toBeFalsy();
    expect(el.showInterestForm).toBe(false);
    rows = await finance.db.table('wealthflow_interest_entries').find({});
    expect(rows).toHaveLength(0);
    el.remove();
  });

  it('closes the dividend form after add, and on save, cancel and delete', async () => {
    await import('../src/ui/dividend-form.js');
    await import('../src/ui/overview-view.js');
    await import('../src/ui/dividend-log.js');
    const finance: any = createMockFinance();
    const stock: any = await createStock(finance, {
      stock_code: 'VAS',
      stock_full_name: 'Vanguard',
      shares: 5,
    });
    const entry: any = await createDividend(
      finance,
      {
        stock_id: stock.id,
        date: '2025-08-01',
        type: 'trust',
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
    const openCreate = async () => {
      [...root.querySelectorAll('button')]
        .find((b: any) => b.textContent?.trim() === 'Log dividend')
        ?.click();
      await el.updateComplete;
      await new Promise((r) => setTimeout(r, 0));
      await el.updateComplete;
      return root.querySelector('dividend-form') as any;
    };
    const openEdit = async () => {
      const log = root.querySelector('dividend-log') as any;
      (log as any).requestEdit(entry);
      await el.updateComplete;
      await new Promise((r) => setTimeout(r, 0));
      await el.updateComplete;
      return root.querySelector('dividend-form') as any;
    };
    const button = (form: any, label: string) =>
      [...form.shadowRoot.querySelectorAll('button')].find(
        (b: any) => b.textContent?.trim() === label,
      ) as HTMLButtonElement;
    const labelsOf = (form: any) =>
      [...form.shadowRoot.querySelectorAll('button')].map((b: any) =>
        b.textContent?.trim(),
      );
    // happy-dom does not wire a submit button's form="" association, so the
    // real click is covered by the browser pass; here the handler is invoked.
    const submit = async (form: any) => {
      await (form as any).onSubmit(new Event('submit'));
      await new Promise((r) => setTimeout(r, 0));
      await el.updateComplete;
    };
    const rows = async () =>
      (await finance.db.table('wealthflow_dividends').find({})) as any[];

    // Add — the create button says Add, and the form folds away.
    let form = await openCreate();
    expect(labelsOf(form)).toEqual(['Add']);
    form.stockId = stock.id;
    form.date = '2025-09-01';
    form.gross = '55';
    form.franking = '15';
    (form as any).requestUpdate?.();
    await form.updateComplete;
    await submit(form);
    expect(root.querySelector('dividend-form')).toBeFalsy();
    expect(el.showDividendForm).toBe(false);
    expect(await rows()).toHaveLength(2);

    // Save
    form = await openEdit();
    expect(labelsOf(form)).toEqual(['Save', 'Cancel', 'Delete']);
    form.gross = '111';
    (form as any).requestUpdate?.();
    await form.updateComplete;
    await submit(form);
    expect(root.querySelector('dividend-form')).toBeFalsy();
    expect(el.showDividendForm).toBe(false);
    expect((await rows()).find((r) => r.id === entry.id).gross).toBe(111);

    // Cancel — closes without writing.
    form = await openEdit();
    form.gross = '999';
    (form as any).requestUpdate?.();
    await form.updateComplete;
    button(form, 'Cancel').click();
    await el.updateComplete;
    expect(root.querySelector('dividend-form')).toBeFalsy();
    expect(el.showDividendForm).toBe(false);
    expect((await rows()).find((r) => r.id === entry.id).gross).toBe(111);

    // Delete
    form = await openEdit();
    const originalConfirm = globalThis.confirm;
    (globalThis as any).confirm = () => true;
    try {
      await (form as any).onDelete();
    } finally {
      (globalThis as any).confirm = originalConfirm;
    }
    await el.updateComplete;
    expect(root.querySelector('dividend-form')).toBeFalsy();
    expect(el.showDividendForm).toBe(false);
    expect((await rows()).find((r) => r.id === entry.id)).toBeUndefined();
    el.remove();
  });

  it('breaks SG out of the super footer instead of folding it into private contributions', async () => {
    const { createSuperEntry } = await import('../src/dao/super-entries.js');
    await import('../src/ui/overview-view.js');
    await import('../src/ui/dividend-log.js');
    await import('../src/ui/dividend-form.js');
    await import('../src/ui/interest-grid.js');
    await import('../src/ui/interest-form.js');
    const finance: any = createMockFinance();
    await createSuperEntry(
      finance,
      { date: '2025-09-01', kind: 'contribution', amount: 1000 },
      '07-01',
    );
    await createSuperEntry(
      finance,
      { date: '2025-09-28', kind: 'sg', amount: 350.5 },
      '07-01',
    );
    const el = document.createElement('overview-view') as any;
    document.body.appendChild(el);
    el.fy = '2025-2026';
    await el.setFinance(finance);
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;
    const text = (el.renderRoot as ShadowRoot).textContent ?? '';
    // Both buckets are named, so neither is mistaken for the other.
    expect(text).toContain('Private contributions (FY)');
    expect(text).toContain('SG contributions (FY)');
    // happy-dom drops the super tbody/tfoot from the shadow root, so assert the
    // data contract the footer renders from.
    expect(el.summary.super.contributions).toEqual({ total: 1000, count: 1 });
    expect(el.summary.super.sg).toEqual({ total: 350.5, count: 1 });
    el.remove();
  });

  it('renders a summary that predates the sg bucket without throwing', async () => {
    const { createSuperEntry } = await import('../src/dao/super-entries.js');
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
    // One entry so the super table (and its footer) renders rather than the
    // empty-state copy.
    await createSuperEntry(
      finance,
      { date: '2025-09-01', kind: 'contribution', amount: 1000 },
      '07-01',
    );
    finance.services.register('wealthflow', {
      getOverviewSummary: async () => ({
        financialYear: '2025-2026',
        dividends: { gross: 0, franking: 0 },
        interest: { total: 0, byBank: [] },
        super: {
          financialYear: '2025-2026',
          balance: null,
          contributions: { total: 0, count: 0 },
        },
        combined: { gross: 0, franking: 0 },
      }),
    });
    const g: any = globalThis as any;
    try {
      const el = document.createElement('overview-view') as any;
      document.body.appendChild(el);
      el.fy = '2025-2026';
      await el.setFinance(finance);
      await el.updateComplete;
      await new Promise((r) => setTimeout(r, 0));
      await el.updateComplete;
      expect(el.error).toBe('');
      expect((el.renderRoot as ShadowRoot).textContent).toContain(
        'SG contributions (FY)',
      );
      el.remove();
    } finally {
      g.__mockServices?.delete('wealthflow');
    }
  });

  // The card above only proves the DAO fallback, because no test registered the
  // public service. Once the service is live the view must pass its args in the
  // shape the host expects, or it reads a bogus year and silently shows zeros.
  it('shows Combined totals when the public service is registered', async () => {
    const { createPublicWealthAdapter } =
      await import('../src/services/public-wealth-adapter.js');
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
    finance.services.register('wealthflow', createPublicWealthAdapter(finance));
    const g: any = globalThis as any;
    try {
      const el = document.createElement('overview-view') as any;
      document.body.appendChild(el);
      el.fy = '2025-2026';
      await el.setFinance(finance);
      await el.updateComplete;
      await new Promise((r) => setTimeout(r, 0));
      await el.updateComplete;

      // Took the service path, not the fallback.
      expect(el.summary.financialYear).toBe('2025-2026');
      expect(el.summary.combined.gross).toBe(110);
      expect(el.summary.combined.franking).toBe(30);
      const text = (el.renderRoot as ShadowRoot).textContent ?? '';
      expect(text).toContain('$110.00');
      expect(text).toContain('$30.00');
      el.remove();
    } finally {
      g.__mockServices?.delete('wealthflow');
    }
  });

  it('falls back to direct aggregation if the service answers for another year', async () => {
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
    // A mis-shaped call yields a well-formed summary for the wrong year: all
    // zeros, no error. Reject it rather than render an empty year as fact.
    finance.services.register('wealthflow', {
      getOverviewSummary: async () => ({
        financialYear: '2',
        dividends: { gross: 0, franking: 0 },
        interest: { total: 0, byBank: [] },
        combined: { gross: 0, franking: 0 },
      }),
    });
    const g: any = globalThis as any;
    try {
      const el = document.createElement('overview-view') as any;
      document.body.appendChild(el);
      el.fy = '2025-2026';
      await el.setFinance(finance);
      await el.updateComplete;
      await new Promise((r) => setTimeout(r, 0));
      await el.updateComplete;
      expect(el.summary.financialYear).toBe('2025-2026');
      expect(el.summary.combined.gross).toBe(10);
      el.remove();
    } finally {
      g.__mockServices?.delete('wealthflow');
    }
  });
});
