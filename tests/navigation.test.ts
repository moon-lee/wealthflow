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
});
