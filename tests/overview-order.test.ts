// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { createMockFinance } from '../src/mock/finance-mock.js';
import '../src/ui/overview-view.js';

/** The four titled sections, by a fragment of their header. */
function sectionByTitle(root: any, title: string): any {
  return [...root.querySelectorAll('.section.flush')].find((s: any) =>
    s.querySelector('.section-title')?.textContent?.includes(title),
  );
}

function orderOf(node: any): number {
  return Number((node as HTMLElement).style.order);
}

async function viewWith(order?: string[]): Promise<any> {
  const el: any = document.createElement('overview-view');
  document.body.appendChild(el);
  el.fy = '2025-2026';
  if (order) el.sectionOrder = order;
  await el.setFinance(createMockFinance());
  await el.updateComplete;
  return el;
}

describe('overview section order', () => {
  it('renders the canonical order by default', async () => {
    const el = await viewWith();
    const root = el.renderRoot;

    expect(orderOf(sectionByTitle(root, 'Combined'))).toBe(0);
    expect(orderOf(sectionByTitle(root, 'Dividends'))).toBe(1);
    expect(orderOf(sectionByTitle(root, 'Interest'))).toBe(2);
    expect(orderOf(sectionByTitle(root, 'Superannuation'))).toBe(3);
    expect(orderOf(root.querySelector('cgt-section').parentElement)).toBe(4);
    // The DOM order matches, so the tab order and a screen reader read the
    // sections in the order they appear without any saved preference.
    const stack = root.querySelector('.order-stack') as HTMLElement;
    const kids = [...stack.children];
    expect(kids.indexOf(sectionByTitle(root, 'Superannuation'))).toBeLessThan(
      kids.indexOf(root.querySelector('cgt-section').parentElement as any),
    );
    el.remove();
  });

  it('moves every section to the order it is given', async () => {
    // The Reorder Sections modal saves this order; before the fix the view
    // ignored it and every section carried order 0, so nothing moved.
    const el = await viewWith([
      'super',
      'combined',
      'dividends',
      'interest',
      'cgt',
    ]);
    const root = el.renderRoot;

    expect(orderOf(sectionByTitle(root, 'Superannuation'))).toBe(0);
    expect(orderOf(sectionByTitle(root, 'Combined'))).toBe(1);
    expect(orderOf(sectionByTitle(root, 'Dividends'))).toBe(2);
    expect(orderOf(sectionByTitle(root, 'Interest'))).toBe(3);
    expect(orderOf(root.querySelector('cgt-section').parentElement)).toBe(4);
    el.remove();
  });

  it('re-renders when a new order arrives after the view is mounted', async () => {
    // This is how the orchestrator applies a save: it assigns sectionOrder and
    // asks the child to update, without remounting it.
    const el = await viewWith();
    el.sectionOrder = ['cgt', 'super', 'combined', 'dividends', 'interest'];
    el.requestUpdate?.();
    await el.updateComplete;

    expect(
      orderOf(el.renderRoot.querySelector('cgt-section').parentElement),
    ).toBe(0);
    expect(orderOf(sectionByTitle(el.renderRoot, 'Superannuation'))).toBe(1);
    el.remove();
  });
});
