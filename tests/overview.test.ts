// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { createMockFinance } from '../src/mock/finance-mock.js';
import { createBank, setBankActive } from '../src/dao/banks.js';
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
    // Combined taxable leads: it is the FY answer the other two add up to.
    const sections = [...root.querySelectorAll('.section.flush')].map((el) =>
      (el.querySelector('.section-title')?.textContent ?? '').trim(),
    );
    expect(sections).toEqual([
      'Combined taxable — FY 2025-2026',
      'Dividends — FY 2025-2026',
      'Interest — FY 2025-2026',
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
});
