// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { createMockFinance } from '../src/mock/finance-mock.js';
import { createBank } from '../src/dao/banks.js';
import { createInterestEntry } from '../src/dao/interest-entries.js';
import '../src/ui/interest-grid.js';

const flush = () => new Promise((r) => setTimeout(r, 0));

async function seed(f: any): Promise<any> {
  const bank: any = await createBank(f, {
    bank_code: 'UBank',
    account_number: '9',
  });
  const entry: any = await createInterestEntry(
    f,
    {
      bank_id: bank.id,
      date: '2025-08-31',
      amount: 12.5,
      finance_year: '2025-2026',
    },
    '07-01',
  );
  return { bank, entry };
}

async function gridFor(f: any): Promise<any> {
  const el: any = document.createElement('interest-grid');
  document.body.appendChild(el);
  el.fy = '2025-2026';
  await el.setFinance(f);
  await el.updateComplete;
  await flush();
  await el.updateComplete;
  return el;
}

describe('interest grid entry action', () => {
  it('uses a pencil icon button instead of a text Edit button', async () => {
    const f: any = createMockFinance();
    await seed(f);
    const el = await gridFor(f);

    const btn = el.renderRoot.querySelector('tbody button') as any;
    expect(btn).toBeTruthy();
    expect(btn.getAttribute('aria-label')).toBe(
      'Edit UBank entry for Aug 2025',
    );
    expect(btn.classList.contains('icon-btn')).toBe(true);
    expect(btn.querySelectorAll('svg')).toHaveLength(1);
    expect(btn.textContent.trim()).toBe('');
    el.remove();
  });

  it('still asks the host to edit the entry the pencil belongs to', async () => {
    const f: any = createMockFinance();
    const { entry } = await seed(f);
    const el = await gridFor(f);

    const seen: any[] = [];
    el.addEventListener('interest-edit-request', (e: any) =>
      seen.push(e.detail),
    );
    (el.renderRoot.querySelector('tbody button') as any).click();

    expect(seen).toHaveLength(1);
    expect(seen[0].entry.id).toBe(entry.id);
    el.remove();
  });
});
