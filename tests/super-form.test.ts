// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { createMockFinance } from '../src/mock/finance-mock.js';
import { createSuperEntry } from '../src/dao/super-entries.js';
import '../src/ui/super-form.js';

describe('super form', () => {
  it('date picker stores a date-derived FY entry and shows the auto line', async () => {
    const finance: any = createMockFinance();
    const form = document.createElement('super-form') as any;
    document.body.appendChild(form);
    await form.setFinance(finance);
    await form.updateComplete;
    const dateInput = form.renderRoot.querySelector(
      'input[type="date"]',
    ) as HTMLInputElement;
    expect(dateInput).toBeTruthy();
    dateInput.value = '2025-08-15';
    dateInput.dispatchEvent(new Event('input', { bubbles: true }));
    const kind = form.renderRoot.querySelector('select') as HTMLSelectElement;
    kind.value = 'contribution';
    kind.dispatchEvent(new Event('change', { bubbles: true }));
    const amount = form.renderRoot.querySelector(
      'input[inputmode="decimal"]',
    ) as HTMLInputElement;
    amount.value = '1000';
    amount.dispatchEvent(new Event('input', { bubbles: true }));
    await form.updateComplete;
    expect(form.renderRoot.textContent).toContain('2025-2026');
    form.renderRoot
      .querySelector('form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 0));
    const rows = await finance.db.table('wealthflow_super_entries').find({});
    expect(rows).toHaveLength(1);
    expect(rows[0].finance_year).toBe('2025-2026');
    expect(rows[0].kind).toBe('contribution');
    form.remove();
  });

  it('offers SG contribution as its own entry kind', async () => {
    const finance: any = createMockFinance();
    const form = document.createElement('super-form') as any;
    document.body.appendChild(form);
    await form.setFinance(finance);
    await form.updateComplete;
    const kind = form.renderRoot.querySelector('select') as HTMLSelectElement;
    expect([...kind.options].map((o) => o.value)).toContain('sg');
    kind.value = 'sg';
    kind.dispatchEvent(new Event('change', { bubbles: true }));
    const dateInput = form.renderRoot.querySelector(
      'input[type="date"]',
    ) as HTMLInputElement;
    dateInput.value = '2025-09-28';
    dateInput.dispatchEvent(new Event('input', { bubbles: true }));
    const amount = form.renderRoot.querySelector(
      'input[inputmode="decimal"]',
    ) as HTMLInputElement;
    amount.value = '350.50';
    amount.dispatchEvent(new Event('input', { bubbles: true }));
    await form.updateComplete;
    form.renderRoot
      .querySelector('form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 0));
    const rows = await finance.db.table('wealthflow_super_entries').find({});
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('sg');
    expect(rows[0].amount).toBe(350.5);
    expect(rows[0].finance_year).toBe('2025-2026');
    form.remove();
  });

  it('names the kind being deleted in the confirm prompt', async () => {
    const finance: any = createMockFinance();
    const row: any = await createSuperEntry(
      finance,
      { date: '2025-09-28', kind: 'sg', amount: 350.5 },
      '07-01',
    );
    const form = document.createElement('super-form') as any;
    document.body.appendChild(form);
    await form.setFinance(finance);
    form.editEntry(row);
    await form.updateComplete;
    const asked: string[] = [];
    const originalConfirm = globalThis.confirm;
    (globalThis as any).confirm = (q: string) => {
      asked.push(q);
      return true;
    };
    try {
      await form.onDelete();
    } finally {
      (globalThis as any).confirm = originalConfirm;
    }
    expect(asked).toEqual(['Delete SG contribution $350.50 on 2025-09-28?']);
    form.remove();
  });

  it('overview toggles the super form', async () => {
    await import('../src/ui/overview-view.js');
    const finance: any = createMockFinance();
    const el = document.createElement('overview-view') as any;
    document.body.appendChild(el);
    el.fy = '2025-2026';
    await el.setFinance(finance);
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;
    const root = el.renderRoot as ShadowRoot;
    expect(root.textContent).toContain('Superannuation');
    const btn = [...root.querySelectorAll('button')].find(
      (b: any) => b.textContent?.trim() === 'Log super',
    ) as HTMLButtonElement;
    expect(btn).toBeTruthy();
    expect(root.querySelector('super-form')).toBeFalsy();
    btn.click();
    await el.updateComplete;
    expect(root.querySelector('super-form')).toBeTruthy();
    el.remove();
  });
});
