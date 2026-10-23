// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { buildPortfolio, AS_OF } from './fixtures/portfolio.js';
import { listenForHostPush } from '../src/main.js';
import '../src/ui/investment-table.js';

describe('the host push', () => {
  it('treats a push with NO view as a refresh, not a retarget', async () => {
    const app = document.createElement('div');
    let refreshed = 0;
    let inited = 0;
    const el = {
      refresh: async () => {
        refreshed += 1;
      },
      init: async () => {
        inited += 1;
      },
    };
    listenForHostPush(app, el, {} as any);
    app.dispatchEvent(
      new CustomEvent('mount-update', { detail: { refreshedAt: 1 } }),
    );
    // A refresh re-reads the screen. It must NOT move the user to Overview.
    expect(refreshed).toBe(1);
    expect(inited).toBe(0);
  });

  it('treats a push WITH a view as a retarget', async () => {
    const app = document.createElement('div');
    let refreshed = 0;
    let inited = 0;
    const el = {
      refresh: async () => {
        refreshed += 1;
      },
      init: async () => {
        inited += 1;
      },
    };
    listenForHostPush(app, el, {} as any);
    app.dispatchEvent(
      new CustomEvent('mount-update', { detail: { view: 'trades' } }),
    );
    expect(inited).toBe(1);
    expect(refreshed).toBe(0);
  });
});

describe('the price editor fetches on open', () => {
  it('asks the host for the price when what it holds is stale', async () => {
    const { finance } = await buildPortfolio();
    const el: any = document.createElement('investment-table');
    document.body.appendChild(el);
    // The fixture's price is dated 2026-10-21; forty days later it is stale.
    el.asOf = '2026-11-30';
    const calls: string[] = [];
    (globalThis as any).financeShell = {
      extensions: {
        executeCommand: async (id: string) => {
          calls.push(id);
          return { executed: true };
        },
      },
    };
    await el.setFinance(finance);
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toEqual(['wealthflow.update-prices']);
    delete (globalThis as any).financeShell;
    await el.updateComplete;
    el.remove();
  });

  it('does not refetch a price that is still fresh', async () => {
    const { finance } = await buildPortfolio();
    const el: any = document.createElement('investment-table');
    document.body.appendChild(el);
    el.asOf = AS_OF;
    const calls: string[] = [];
    (globalThis as any).financeShell = {
      extensions: {
        executeCommand: async (id: string) => {
          calls.push(id);
          return { executed: true };
        },
      },
    };
    await el.setFinance(finance);
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toEqual([]);
    delete (globalThis as any).financeShell;
    await el.updateComplete;
    el.remove();
  });
});
