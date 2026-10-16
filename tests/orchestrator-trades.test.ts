// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { createMockFinance } from '../src/mock/finance-mock.js';
import { createStock } from '../src/dao/stocks.js';
import { createTrade } from '../src/dao/trades.js';
import { rebuildParcels } from '../src/services/parcel-service.js';
import '../src/ui/index.js';

const flush = () => new Promise((r) => setTimeout(r, 0));

async function mountOrchestrator() {
  const o = document.createElement('wealthflow-orchestrator') as any;
  document.body.appendChild(o);
  o.finance = createMockFinance();
  await o.pushFinance?.();
  return o;
}

describe('orchestrator: trades tab', () => {
  it('registers the new elements', () => {
    for (const tag of [
      'trades-view',
      'trade-log',
      'trade-form',
      'parcel-ledger',
    ])
      expect(customElements.get(tag), tag).toBeDefined();
  });

  it('renders trades-view when the tab is trades', async () => {
    const o = await mountOrchestrator();
    o.navigate('trades');
    await o.updateComplete;
    expect(
      o.renderRoot.querySelector('#child')?.tagName.toLowerCase(),
    ).toBe('trades-view');
    o.remove();
  });

  it('labels the crumb Trades', async () => {
    const o = await mountOrchestrator();
    o.navigate('trades');
    await o.updateComplete;
    expect(o.renderRoot.querySelector('.crumb-current')?.textContent).toMatch(
      /Trades/,
    );
    o.remove();
  });

  it('still renders the other tabs', async () => {
    const o = await mountOrchestrator();
    for (const [tab, tag] of [
      ['overview', 'overview-view'],
      ['banks', 'bank-list'],
      ['stocks', 'stock-list'],
    ] as const) {
      o.navigate(tab as any);
      await o.updateComplete;
      expect(
        o.renderRoot.querySelector('#child')?.tagName.toLowerCase(),
        tab,
      ).toBe(tag);
    }
    o.remove();
  });

  it('switches between the Trades log and the parcel ledger', async () => {
    const v = document.createElement('trades-view') as any;
    document.body.appendChild(v);
    v.finance = createMockFinance();
    await v.setFinance(v.finance);
    await v.updateComplete;
    expect(v.renderRoot.querySelector('trade-log')).toBeTruthy();
    expect(v.renderRoot.querySelector('parcel-ledger')).toBeFalsy();
    v.segment = 'parcels';
    v.requestUpdate?.();
    await v.updateComplete;
    expect(v.renderRoot.querySelector('parcel-ledger')).toBeTruthy();
    expect(v.renderRoot.querySelector('trade-log')).toBeFalsy();
    v.remove();
  });

  it('mounts a populated Trades tab from the orchestrator', async () => {
    const f: any = createMockFinance();
    const vas: any = await createStock(f, {
      stock_code: 'VAS',
      stock_full_name: 'V',
      shares: 0,
    });
    await createTrade(f, {
      stock_id: vas.id,
      date: '2026-09-10',
      side: 'buy',
      quantity: 7,
      price: 110,
      brokerage: 3,
    });
    await rebuildParcels(f, vas.id);

    const o = document.createElement('wealthflow-orchestrator') as any;
    document.body.appendChild(o);
    o.finance = f;
    o.navigate('trades');
    await o.updateComplete;
    await flush();
    await o.updateComplete;
    const child = o.renderRoot.querySelector('#child') as any;
    expect(child).toBeTruthy();
    const log = child.renderRoot.querySelector('trade-log') as any;
    expect(log.sortedTrades.map((t: any) => t.date)).toEqual(['2026-09-10']);
    o.remove();
  });

  it('opens Trades from init(), which is how the dev harness mounts it', async () => {
    // index.html calls panel.init(finance, { view }) directly rather than
    // navigate(), because it owns the panel instead of activate().
    const f: any = createMockFinance();
    const o = document.createElement('wealthflow-orchestrator') as any;
    document.body.appendChild(o);
    await o.init(f, { view: 'trades', fy: '2026-2027' });
    await o.updateComplete;
    expect(o.tab).toBe('trades');
    expect(o.fy).toBe('2026-2027');
    expect(o.renderRoot.querySelector('#child')?.tagName.toLowerCase()).toBe(
      'trades-view',
    );
    o.remove();
  });
});