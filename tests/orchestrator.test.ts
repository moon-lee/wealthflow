// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';

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
});
