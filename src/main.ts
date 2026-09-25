import type { FinanceApi } from 'finance';
import { ExtensionLogger } from 'finance-logger';
import './styles/ext-tokens.css';
const logger = new ExtensionLogger('wealthflow');
export async function registerUIComponents(): Promise<void> { if (typeof window !== 'undefined') await import('./ui/index.js'); }
let _finance: FinanceApi | null = null;
export async function activate(finance: FinanceApi, ctx: { viewId?: string } & Record<string, unknown> = {}): Promise<void> {
  _finance = finance;
  logger.info('activate wealthflow', { viewId: ctx.viewId });
  // Single panel identity ('wealthflow' → tab always "Wealthflow"); extra screens ride as mountData.view.
  const openView = (childTag: string): (() => Promise<void>) => async () => {
    await finance.ui?.requestMount('wealthflow', { view: childTag });
  };
  finance.commands.registerCommand('wealthflow.hello', 'Wealthflow: Hello', () => openView('wealthflow-view')());
  // Example Domain Service — other extensions can call finance.services.invoke('wealthflow','hello')
  // When you add tables (e.g. wealthflow_items), add methods that use finance.db.table('wealthflow_items').find/count/insert
  finance.services.register('wealthflow', {
    hello: async (p?: unknown) => `Hello from wealthflow: ${JSON.stringify(p ?? {})}`,
  });
  if (typeof window !== 'undefined') await import('./ui/index.js');
  if (ctx.viewId && typeof document !== 'undefined') {
    const app = document.getElementById('app');
    if (app) {
      // Without an orchestrator, mount the single view directly. When you add a
      // second child view (AGENTS.md §5b), replace this with a 'wealthflow-orchestrator'
      // element that maps mount.view → child tag and handles 'mount-update' retargets.
      const viewEl = document.createElement('wealthflow-view') as any;
      app.innerHTML = '';
      app.appendChild(viewEl);
      queueMicrotask(() => { if (typeof viewEl.setFinance === 'function') viewEl.setFinance(finance); else viewEl.finance = finance; });
      setTimeout(() => { if (viewEl.finance == null && typeof viewEl.setFinance === 'function') viewEl.setFinance(finance); }, 50);
    }
  }
}
export function deactivate(): void { if (_finance) _finance.services.unregister('wealthflow'); logger.info('deactivate wealthflow'); }
