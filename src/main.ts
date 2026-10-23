import type { FinanceApi } from 'finance';
import { ExtensionLogger } from 'finance-logger';
import './styles/ext-tokens.css';

const logger = new ExtensionLogger('wealthflow');
let _finance: FinanceApi | null = null;

export async function registerUIComponents(): Promise<void> {
  if (typeof window !== 'undefined') await import('./ui/index.js');
}

export async function activate(
  finance: FinanceApi,
  ctx: { viewId?: string } & Record<string, unknown> = {},
): Promise<void> {
  _finance = finance;
  logger.info('activate wealthflow', { viewId: ctx.viewId });

  // Nav-bar Refresh (Quick Links group), same pattern as taxflow. pushData
  // rather than requestMount: the latter would create the panel if it were
  // closed, popping a view the user had deliberately shut. Dropped when nothing
  // is mounted, which is what a Refresh item should do.
  finance.commands.registerCommand(
    'wealthflow.refresh',
    'Refresh Wealth Flow',
    async () => {
      // A refresh means "give me the current numbers", and the current price
      // is the one that moves. The host is plain Node, so the fetch belongs
      // here rather than in the panel.
      try {
        const { updatePrices } = await import('./services/price-service.js');
        const prices = await updatePrices(finance);
        logger.info('refreshed prices', {
          updated: prices.updated,
          failed: prices.failed,
        });
      } catch (err) {
        logger.error('wealthflow refresh prices failed', err);
      }
      try {
        // No `view` in the payload: this is DATA, not a navigation. The panel
        // re-reads the current screen and stays where it is.
        await finance.ui?.pushData?.('wealthflow', { refreshedAt: Date.now() });
      } catch (err) {
        logger.error('wealthflow refresh failed', err);
      }
    },
  );
  // Fetch the current market price for every holding.
  //
  // HOST SIDE ONLY, and deliberately so. The panel is a browser context: a
  // cross-origin fetch from there is blocked, and the extension has no way to
  // relax that. The host is plain Node, so it can reach the ASX and Yahoo
  // endpoints directly.
  //
  // The panel calls this through the command bridge and then re-reads the
  // price table, so nothing is pushed back to it — a push would retarget the
  // open panel, which is not what updating a price should do.
  finance.commands.registerCommand(
    'wealthflow.update-prices',
    'Wealth Flow: Update Prices',
    async () => {
      try {
        const { updatePrices } = await import('./services/price-service.js');
        const result = await updatePrices(finance);
        logger.info('update-prices', {
          updated: result.updated,
          failed: result.failed,
        });
        return result;
      } catch (err) {
        logger.error('update-prices failed', err);
        return null;
      }
    },
  );
  const openView = (view: string, focus?: string) => async () => {
    await finance.ui?.requestMount(
      'wealthflow',
      focus ? { view, focus } : { view },
    );
  };
  finance.commands.registerCommand(
    'wealthflow.show-banks',
    'Wealth Flow: Show Banks',
    openView('banks'),
  );
  finance.commands.registerCommand(
    'wealthflow.add-interest',
    'Wealth Flow: Add Interest',
    openView('overview', 'interest'),
  );
  finance.commands.registerCommand(
    'wealthflow.show-stocks',
    'Wealth Flow: Show Stocks',
    openView('stocks'),
  );
  finance.commands.registerCommand(
    'wealthflow.show-trades',
    'Wealth Flow: Show Trades',
    openView('trades'),
  );
  finance.commands.registerCommand(
    'wealthflow.add-dividend',
    'Wealth Flow: Add Dividend',
    openView('overview', 'dividend'),
  );
  finance.commands.registerCommand(
    'wealthflow.show-overview',
    'Wealth Flow: Show Overview',
    openView('overview'),
  );
  const { createPublicWealthAdapter } =
    await import('./services/public-wealth-adapter.js');
  finance.services.register(
    'wealthflow',
    createPublicWealthAdapter(finance) as unknown as Record<
      string,
      (p?: unknown) => unknown
    >,
  );
  if (typeof window !== 'undefined') await import('./ui/index.js');
  if (ctx.viewId && typeof document !== 'undefined') {
    const app = document.getElementById('app');
    if (app) {
      const el = document.createElement('wealthflow-orchestrator') as any;
      app.innerHTML = '';
      app.appendChild(el);
      const base = { ...(ctx as Record<string, unknown>) };
      delete (base as any).viewId;
      queueMicrotask(() => {
        if (typeof el.init === 'function')
          void el.init(finance, { view: 'overview', ...base });
        else if (typeof el.setFinance === 'function')
          void el.setFinance(finance);
        else el.finance = finance;
      });
      // Retargets of the open panel (sidebar nav while mounted) arrive as DOM
      // 'mount-update' dispatched ON #app by panel-bootstrap — listen there,
      // not on the orchestrator child (parent-dispatched events never reach children).
      listenForHostPush(app, el, finance, base);
    }
  }
}

/**
 * Listen for the host's panel pushes.
 *
 * A push that carries a `view` is a RETARGET — the sidebar moved the panel.
 * A push without one is DATA — a refresh — and must re-read the current
 * screen WITHOUT moving the user. Treating a refresh as a retarget used to
 * throw the user to Overview.
 */
export function listenForHostPush(
  app: HTMLElement,
  el: any,
  finance: FinanceApi,
  base: Record<string, unknown> = {},
): void {
  app.addEventListener('mount-update', (e: Event) => {
    const detail = (e as CustomEvent).detail as
      { view?: string } | Record<string, unknown>;
    if (typeof el.init !== 'function') return;
    const view = (detail as { view?: string })?.view;
    if (typeof view === 'string') {
      void el.init(finance, { view, ...base });
      return;
    }
    if (typeof el.refresh === 'function') void el.refresh();
  });
}

export function deactivate(): void {
  if (_finance) _finance.services.unregister('wealthflow');
  logger.info('deactivate wealthflow');
}
