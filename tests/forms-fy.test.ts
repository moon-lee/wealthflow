// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { createMockFinance } from '../src/mock/finance-mock.js';
import { createBank } from '../src/dao/banks.js';
import '../src/ui/interest-form.js';

describe('interest-form date picker + auto FY', () => {
  it('uses a date selector and stores the date-derived financial year', async () => {
    const finance: any = createMockFinance();
    const bank: any = await createBank(finance, {
      name: 'UBank',
      account_number: '9',
    });
    const form = document.createElement('interest-form') as any;
    document.body.appendChild(form);
    await form.setFinance(finance);
    await form.updateComplete;

    const dateInput = form.renderRoot.querySelector(
      'input[type="date"]',
    ) as HTMLInputElement;
    expect(dateInput).toBeTruthy();
    dateInput.value = '2025-08-15';
    dateInput.dispatchEvent(new Event('input', { bubbles: true }));
    await form.updateComplete;
    expect(form.renderRoot.textContent).toContain('2025-2026');

    form.bankId = bank.id;
    const amount = form.renderRoot.querySelector(
      'input[inputmode="decimal"]',
    ) as HTMLInputElement;
    amount.value = '12.5';
    amount.dispatchEvent(new Event('input', { bubbles: true }));
    await form.updateComplete;
    form.renderRoot
      .querySelector('form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 0));
    const rows = await finance.db.table('wealthflow_interest_entries').find({});
    expect(rows).toHaveLength(1);
    expect(rows[0].finance_year).toBe('2025-2026');
    expect(rows[0].date).toBe('2025-08-15');
    form.remove();
  });
});
