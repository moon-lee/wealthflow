// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { createMockFinance } from '../src/mock/finance-mock.js';
import '../src/ui/index.js';
import { WealthOrchestrator } from '../src/ui/wealthflow-orchestrator.js';

async function mount(): Promise<{ el: WealthOrchestrator; finance: any }> {
  const finance: any = createMockFinance();
  const el = document.createElement(
    'wealthflow-orchestrator',
  ) as unknown as WealthOrchestrator;
  document.body.appendChild(el);
  await el.init(finance, { view: 'banks' });
  await (el as any).updateComplete;
  return { el, finance };
}

function tabButtons(el: WealthOrchestrator): HTMLButtonElement[] {
  return [
    ...(el as any).renderRoot.querySelectorAll('.topbar .filter-btn'),
  ].filter((b: any) =>
    ['Banks', 'Stocks', 'Dividends', 'Overview'].includes(
      b.textContent?.trim(),
    ),
  ) as HTMLButtonElement[];
}

describe('orchestrator click navigation', () => {
  it('clicking Stocks switches the visible child', async () => {
    const { el } = await mount();
    expect((el as any).renderRoot.querySelector('bank-list')).toBeTruthy();
    for (const [label, tag] of [
      ['Stocks', 'stock-list'],
      ['Dividends', 'dividend-log'],
      ['Overview', 'overview-view'],
      ['Banks', 'bank-list'],
    ] as const) {
      const btn = tabButtons(el).find((b) => b.textContent?.trim() === label)!;
      expect(btn).toBeTruthy();
      btn.click();
      await (el as any).updateComplete;
      await new Promise((r) => setTimeout(r, 0));
      await (el as any).updateComplete;
      expect((el as any).renderRoot.querySelector(tag)).toBeTruthy();
    }
    el.remove();
  });

  it('child wealthflow-navigate event retargets the tab', async () => {
    const { el } = await mount();
    el.dispatchEvent(
      new CustomEvent('wealthflow-navigate', {
        detail: { view: 'dividends' },
        bubbles: true,
        composed: true,
      }),
    );
    await (el as any).updateComplete;
    expect(el.tab).toBe('dividends');
    expect((el as any).renderRoot.querySelector('dividend-log')).toBeTruthy();
    el.remove();
  });

  it('typing in bank-form enables the Add button', async () => {
    const { finance } = await mount();
    document.body.innerHTML = '';
    const form = document.createElement('bank-form') as any;
    document.body.appendChild(form);
    await form.setFinance(finance);
    await form.updateComplete;
    const btn = () =>
      (form as any).renderRoot.querySelector(
        'button[type="submit"]',
      ) as HTMLButtonElement;
    expect(btn().disabled).toBe(true);
    const inputs = [
      ...(form as any).renderRoot.querySelectorAll('input'),
    ] as HTMLInputElement[];
    const set = (i: number, v: string) => {
      inputs[i].value = v;
      inputs[i].dispatchEvent(new Event('input', { bubbles: true }));
    };
    set(0, 'Macquarie');
    set(2, '1234567');
    await form.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await form.updateComplete;
    expect(btn().disabled).toBe(false);
    form.remove();
  });

  it('bank-list Edit reveals the inline edit row', async () => {
    const { finance } = await mount();
    await finance.db
      .table('wealthflow_banks')
      .insert({ name: 'BOQ', account_number: '9', is_active: true } as any);
    document.body.innerHTML = '';
    const list = document.createElement('bank-list') as any;
    document.body.appendChild(list);
    list.fy = '2025-2026';
    await list.setFinance(finance);
    await list.updateComplete;
    const editBtn = [
      ...(list as any).renderRoot.querySelectorAll('button'),
    ].find((b: any) => b.textContent?.trim() === 'Edit') as HTMLButtonElement;
    expect(editBtn).toBeTruthy();
    editBtn.click();
    await list.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await list.updateComplete;
    expect((list as any).renderRoot.querySelector('td input')).toBeTruthy();
    list.remove();
  });
});
