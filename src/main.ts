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
  const openView = (view: string) => async () => {
    await finance.ui?.requestMount('wealthflow', { view });
  };
  finance.commands.registerCommand('wealthflow.show-banks', 'Wealth Flow: Show Banks', openView('banks'));
  finance.commands.registerCommand('wealthflow.add-interest', 'Wealth Flow: Add Interest', openView('banks'));
  finance.commands.registerCommand('wealthflow.show-stocks', 'Wealth Flow: Show Stocks', openView('stocks'));
  finance.commands.registerCommand('wealthflow.add-dividend', 'Wealth Flow: Add Dividend', openView('dividends'));
  finance.commands.registerCommand('wealthflow.show-overview', 'Wealth Flow: Show Overview', openView('overview'));
  const { createPublicWealthAdapter } = await import('./services/public-wealth-adapter.js');
  finance.services.register('wealthflow', createPublicWealthAdapter(finance) as unknown as Record<string, (p?: unknown) => unknown>);
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
        if (typeof el.init === 'function') void el.init(finance, { view: 'banks', ...base });
        else if (typeof el.setFinance === 'function') void el.setFinance(finance);
        else el.finance = finance;
      });
      el.addEventListener('mount-update', (e: Event) => {
        const detail = (e as CustomEvent).detail as { view?: string } & Record<string, unknown>;
        void el.init(finance, { view: detail.view ?? 'banks', ...detail });
      });
    }
  }
}

export function deactivate(): void {
  if (_finance) _finance.services.unregister('wealthflow');
  logger.info('deactivate wealthflow');
}
