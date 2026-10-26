// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { createMockFinance } from '../src/mock/finance-mock.js';
// The panel registers every view before `activate` runs, so the orchestrator's
// <overview-view> is upgraded by the time it renders. Without this the element
// is a plain HTMLElement and has no sectionOrder to receive the saved order.
import '../src/ui/overview-view.js';
import '../src/ui/reorder-overview-sections-modal.js';

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

  it('pushes the saved section order into the Overview on load', async () => {
    const { WealthOrchestrator } =
      await import('../src/ui/wealthflow-orchestrator.js');
    const finance: any = createMockFinance();
    const saved = ['super', 'combined', 'dividends', 'interest', 'cgt'];
    await finance.settings.set(
      'wealthflow.overviewSectionOrder',
      JSON.stringify(saved),
    );

    const el = document.createElement(
      'wealthflow-orchestrator',
    ) as WealthOrchestrator;
    document.body.appendChild(el);
    await el.init(finance, { view: 'overview', fy: '2025-2026' });
    await el.updateComplete;

    const view = (el as any).renderRoot.querySelector('overview-view') as any;
    expect(view).toBeTruthy();
    expect(view.sectionOrder).toEqual(saved);
    el.remove();
  });

  it('persists a reorder and applies it without a remount', async () => {
    const { WealthOrchestrator } =
      await import('../src/ui/wealthflow-orchestrator.js');
    const finance: any = createMockFinance();
    const el = document.createElement(
      'wealthflow-orchestrator',
    ) as WealthOrchestrator;
    document.body.appendChild(el);
    await el.init(finance, { view: 'overview', fy: '2025-2026' });
    await el.updateComplete;

    const next = ['cgt', 'super', 'combined', 'dividends', 'interest'];
    // What the Reorder Sections modal emits when Save is pressed.
    el.dispatchEvent(
      new CustomEvent('section-order-change', {
        detail: next,
        bubbles: true,
        composed: true,
      }),
    );
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 0));

    const view = (el as any).renderRoot.querySelector('overview-view') as any;
    expect(view.sectionOrder).toEqual(next);
    expect(await finance.settings.get('wealthflow.overviewSectionOrder')).toBe(
      JSON.stringify(next),
    );
    el.remove();
  });

  it('reorders from the toolbar button through the modal', async () => {
    // The whole path the owner reported as dead: button -> modal -> move ->
    // Save -> persisted setting -> mounted Overview re-rendered.
    const { WealthOrchestrator } =
      await import('../src/ui/wealthflow-orchestrator.js');
    const finance: any = createMockFinance();
    const el = document.createElement(
      'wealthflow-orchestrator',
    ) as WealthOrchestrator;
    document.body.appendChild(el);
    await el.init(finance, { view: 'overview', fy: '2025-2026' });
    await el.updateComplete;

    const root = (el as any).renderRoot as ShadowRoot;
    const open = [...root.querySelectorAll('.topbar button')].find((b: any) =>
      b.textContent?.includes('Reorder Sections'),
    ) as any;
    expect(open).toBeTruthy();
    open.click();
    await el.updateComplete;

    const modal = root.querySelector('reorder-overview-sections-modal') as any;
    expect(modal).toBeTruthy();
    await modal.updateComplete;

    // "Combined taxable" starts first; move it down one place.
    const down = modal.renderRoot.querySelector(
      '.reorder-item .reorder-down',
    ) as any;
    down.click();
    await modal.updateComplete;
    const save = [...modal.renderRoot.querySelectorAll('button')].find(
      (b: any) => b.textContent?.trim() === 'Save',
    ) as any;
    save.click();
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 0));

    const next = ['dividends', 'combined', 'interest', 'super', 'cgt'];
    const view = root.querySelector('overview-view') as any;
    expect(view.sectionOrder).toEqual(next);
    expect(await finance.settings.get('wealthflow.overviewSectionOrder')).toBe(
      JSON.stringify(next),
    );
    // Saving closes the modal.
    expect(root.querySelector('reorder-overview-sections-modal')).toBeNull();
    el.remove();
  });

  it('ends the topbar with Reorder Sections, after the finance year', async () => {
    const { WealthOrchestrator } =
      await import('../src/ui/wealthflow-orchestrator.js');
    const finance: any = createMockFinance();
    const el = document.createElement(
      'wealthflow-orchestrator',
    ) as WealthOrchestrator;
    document.body.appendChild(el);
    await el.init(finance, { view: 'overview', fy: '2025-2026' });
    await el.updateComplete;

    const bar = (el as any).renderRoot.querySelector('.topbar') as HTMLElement;
    const kids = [...bar.children];
    const select = bar.querySelector('#fy-select') as HTMLElement;
    const button = [...bar.querySelectorAll('button')].find((b: any) =>
      b.textContent?.includes('Reorder Sections'),
    ) as HTMLElement;
    expect(select).toBeTruthy();
    expect(button).toBeTruthy();
    // The year control keeps its label on the right; the action ends the bar.
    expect(kids.indexOf(select)).toBeLessThan(kids.indexOf(button));
    expect(kids.indexOf(button)).toBe(kids.length - 1);
    el.remove();
  });
});
