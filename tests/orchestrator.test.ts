// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { createMockFinance } from '../src/mock/finance-mock.js';

describe('orchestrator mapping', () => {
  it('maps mount.view to tab', async () => {
    const { WealthOrchestrator, viewForMount } =
      await import('../src/ui/wealthflow-orchestrator.js');
    expect(viewForMount({ view: 'stocks' })).toBe('stocks');
    expect(viewForMount({ view: 'banks' })).toBe('banks');
    expect(viewForMount({})).toBe('overview');
    expect(viewForMount({ view: 'nope' })).toBe('overview');
    expect(viewForMount({ view: 'dividends' })).toBe('overview');
    expect(typeof WealthOrchestrator).toBe('function');
  });

  it('keeps the FY dropdown in sync with fy in both directions', async () => {
    const { WealthOrchestrator } =
      await import('../src/ui/wealthflow-orchestrator.js');
    const el = document.createElement(
      'wealthflow-orchestrator',
    ) as WealthOrchestrator & { fy: string };
    document.body.appendChild(el);
    el.fy = '2026-2027';
    await el.updateComplete;
    const select = () =>
      (el as any).renderRoot.querySelector(
        '.topbar select',
      ) as HTMLSelectElement;
    // First render: Lit commits .value before the <option> children exist, so
    // this is the case that used to show the wrong year.
    expect(select().value).toBe('2026-2027');
    // A user pick must not leave the control showing a stale year.
    (select() as HTMLSelectElement).value = '2025-2026';
    el.dispatchEvent(
      new CustomEvent('fy-changed', {
        detail: { fy: '2025-2026' },
        bubbles: true,
        composed: true,
      }),
    );
    await el.updateComplete;
    expect(el.fy).toBe('2025-2026');
    expect(select().value).toBe('2025-2026');
    el.remove();
  });

  it('labels the section in the crumb and the FY control in the bar', async () => {
    const { WealthOrchestrator } =
      await import('../src/ui/wealthflow-orchestrator.js');
    const el = document.createElement(
      'wealthflow-orchestrator',
    ) as WealthOrchestrator;
    document.body.appendChild(el);
    el.fy = '2026-2027';
    await el.updateComplete;
    const root = (el as any).renderRoot as ShadowRoot;
    // Overview is the default tab, and the crumb names both the extension and
    // the section — "Wealth Flow" alone says where you are, not what you see.
    expect(root.querySelector('.crumb-current')?.textContent?.trim()).toBe(
      'Wealth Flow · Overview',
    );
    const label = root.querySelector('.fy-label') as HTMLLabelElement | null;
    expect(label?.textContent?.trim()).toBe('Finance year');
    expect(label?.getAttribute('for')).toBe('fy-select');
    expect(root.querySelector('#fy-select')).toBeTruthy();
    el.remove();
  });

  it('keeps the crumb honest as the host retargets the panel', async () => {
    const { WealthOrchestrator } =
      await import('../src/ui/wealthflow-orchestrator.js');
    const finance: any = createMockFinance();
    const el = document.createElement(
      'wealthflow-orchestrator',
    ) as WealthOrchestrator;
    document.body.appendChild(el);
    await el.init(finance, { view: 'banks', fy: '2025-2026' });
    await el.updateComplete;
    const root = (el as any).renderRoot as ShadowRoot;
    const crumb = () =>
      root.querySelector('.crumb-current')?.textContent?.trim();
    expect(crumb()).toBe('Wealth Flow · Banks');
    // The bar states the section; it does not offer a second way to change it,
    // so a control here can never disagree with the host's navigation.
    expect(root.querySelector('.tab-bar')).toBeNull();
    expect(root.querySelector('#fy-action')).toBeNull();
    expect(root.querySelectorAll('.topbar button')).toHaveLength(0);
    await el.init(finance, { view: 'stocks', fy: '2025-2026' });
    await el.updateComplete;
    expect(crumb()).toBe('Wealth Flow · Stocks');
    expect(root.querySelector('stock-list')).toBeTruthy();
    await el.init(finance, { view: 'overview', fy: '2025-2026' });
    await el.updateComplete;
    expect(crumb()).toBe('Wealth Flow · Overview');
    expect(root.querySelector('overview-view')).toBeTruthy();
    el.remove();
  });
});
