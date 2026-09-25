import { LitElement, html } from 'lit';
import { sharedStyles } from '../styles/shared-styles.js';
import { formatAUD } from '../utils/format.js';

const Base = typeof HTMLElement !== 'undefined' ? LitElement : (class {} as unknown as typeof LitElement);

export type WealthTab = 'banks' | 'stocks' | 'dividends' | 'overview';

export function viewForMount(mount: Record<string, unknown> = {}): WealthTab {
  const v = (mount.view ?? mount.viewId) as string | undefined;
  if (v === 'stocks' || v === 'stock-list') return 'stocks';
  if (v === 'dividends' || v === 'dividend-log') return 'dividends';
  if (v === 'overview' || v === 'overview-view') return 'overview';
  return 'banks';
}

export function currentFy(d = new Date()): string {
  const y = d.getFullYear();
  const start = d >= new Date(y, 6, 1) ? y : y - 1;
  return `${start}-${start + 1}`;
}

function fyOptions(center: string): string[] {
  const s = Number(center.slice(0, 4));
  return [`${s - 1}-${s}`, center, `${s + 1}-${s + 2}`];
}

export class WealthOrchestrator extends Base {
  static override styles = typeof HTMLElement !== 'undefined' ? [sharedStyles] as any : [];
  finance: any = null;
  tab: WealthTab = 'banks';
  fy = currentFy();
  footerTotal: number | null = null;
  error = '';

  async setFinance(f: any): Promise<void> {
    this.finance = f;
    await this.pushFinance();
  }

  async init(f: any, mount: Record<string, unknown> = {}): Promise<void> {
    this.finance = f;
    this.tab = viewForMount(mount);
    if (typeof mount.fy === 'string') this.fy = mount.fy as string;
    await this.pushFinance();
  }

  navigate(tab: WealthTab): void {
    this.tab = tab;
    (this as any).requestUpdate?.();
    void this.pushFinance();
  }

  private child(): any {
    const root = (this as any).renderRoot as ShadowRoot | undefined;
    return root?.querySelector('#child');
  }

  async pushFinance(): Promise<void> {
    (this as any).requestUpdate?.();
    try {
      await (this as any).updateComplete;
    } catch {
      /* non-Lit context */
    }
    await this.refreshFooter();
    const c = this.child() as any;
    if (c && this.finance) {
      c.finance = this.finance;
      try {
        c.fy = this.fy;
      } catch {
        /* child without fy */
      }
      if (typeof c.setFinance === 'function') {
        try {
          await c.setFinance(this.finance);
        } catch (e: any) {
          this.error = String(e?.message || e);
        }
      } else if (typeof c.reload === 'function') {
        try {
          await c.reload();
        } catch (e: any) {
          this.error = String(e?.message || e);
        }
      }
    }
  }

  /** Footer sums the same DAO queries as the grid/log — single totals source. */
  private async refreshFooter(): Promise<void> {
    if (!this.finance?.db) return;
    try {
      const { listBanks } = await import('../dao/banks.js');
      const { getInterestTotals } = await import('../services/bank-service.js');
      const banks = await listBanks(this.finance, { status: 'all' });
      const { total } = await getInterestTotals(this.finance, banks, this.fy);
      let combined = total;
      try {
        // Variable specifier keeps tsc quiet until the stock milestone lands (Tasks 11-13).
        const stocksMod: string = '../dao/stocks.js';
        const stockSvcMod: string = '../services/stock-service.js';
        const { listStocks } = (await import(/* @vite-ignore */ stocksMod)) as typeof import('../dao/banks.js') & {
          listStocks: any;
        };
        const { getDividendTotals } = (await import(/* @vite-ignore */ stockSvcMod)) as { getDividendTotals: any };
        const stocks = await listStocks(this.finance, { status: 'all' });
        const div = await getDividendTotals(this.finance, stocks, this.fy);
        combined = Math.round((total + div.gross) * 100) / 100;
      } catch {
        /* stock module not built yet — interest-only footer */
      }
      this.footerTotal = combined;
    } catch (e: any) {
      this.error = String(e?.message || e);
    }
  }

  override connectedCallback(): void {
    (super.connectedCallback as (() => void) | undefined)?.call(this);
    this.addEventListener('fy-changed', this._onFy as EventListener);
    this.addEventListener('wealthflow-navigate', this._onNav as EventListener);
    this.addEventListener('host-navigate', this._onHostNav as EventListener);
    this.addEventListener('bank-create', this._onDataChanged as EventListener);
    this.addEventListener('bank-edit', this._onDataChanged as EventListener);
    this.addEventListener('interest-create', this._onDataChanged as EventListener);
    this.addEventListener('interest-edit', this._onDataChanged as EventListener);
    this.addEventListener('interest-delete', this._onDataChanged as EventListener);
    this.addEventListener('stock-create', this._onDataChanged as EventListener);
    this.addEventListener('stock-edit', this._onDataChanged as EventListener);
    this.addEventListener('dividend-create', this._onDataChanged as EventListener);
    this.addEventListener('dividend-edit', this._onDataChanged as EventListener);
    this.addEventListener('dividend-delete', this._onDataChanged as EventListener);
  }

  override disconnectedCallback(): void {
    this.removeEventListener('fy-changed', this._onFy as EventListener);
    this.removeEventListener('wealthflow-navigate', this._onNav as EventListener);
    this.removeEventListener('host-navigate', this._onHostNav as EventListener);
    this.removeEventListener('bank-create', this._onDataChanged as EventListener);
    this.removeEventListener('bank-edit', this._onDataChanged as EventListener);
    this.removeEventListener('interest-create', this._onDataChanged as EventListener);
    this.removeEventListener('interest-edit', this._onDataChanged as EventListener);
    this.removeEventListener('interest-delete', this._onDataChanged as EventListener);
    this.removeEventListener('stock-create', this._onDataChanged as EventListener);
    this.removeEventListener('stock-edit', this._onDataChanged as EventListener);
    this.removeEventListener('dividend-create', this._onDataChanged as EventListener);
    this.removeEventListener('dividend-edit', this._onDataChanged as EventListener);
    this.removeEventListener('dividend-delete', this._onDataChanged as EventListener);
    (super.disconnectedCallback as (() => void) | undefined)?.call(this);
  }

  private _onFy = (e: Event): void => {
    const fy = (e as CustomEvent).detail?.fy as string | undefined;
    if (fy) {
      this.fy = fy;
      void this.pushFinance();
    }
  };

  private _onNav = (e: Event): void => {
    const view = (e as CustomEvent).detail?.view as string | undefined;
    if (view) this.navigate(viewForMount({ view }));
  };

  private _onHostNav = (e: Event): void => {
    const d = (e as CustomEvent).detail as { view?: string; mountData?: Record<string, unknown> };
    void this.init(this.finance, { view: d.view, ...(d.mountData ?? {}) });
  };

  private _onDataChanged = (): void => {
    void this.refreshFooter().then(() => (this as any).requestUpdate?.());
  };

  override render(): unknown {
    if (typeof HTMLElement === 'undefined') return html``;
    const tabs: WealthTab[] = ['banks', 'stocks', 'dividends', 'overview'];
    return html`
      <div class="view-scroll">
        <div class="topbar">
          <span class="crumb-current">Wealth Flow</span>
          <div class="spacer"></div>
          ${tabs.map(
            (t) => html`<button class="filter-btn" @click=${() => this.navigate(t)}>${t[0].toUpperCase() + t.slice(1)}</button>`,
          )}
          <select
            @change=${(e: Event) => {
              const fy = (e.target as HTMLSelectElement).value;
              this.dispatchEvent(new CustomEvent('fy-changed', { detail: { fy }, bubbles: true, composed: true }));
            }}
          >
            ${fyOptions(this.fy).map((f) => html`<option value=${f} ?selected=${f === this.fy}>FY ${f}</option>`)}
          </select>
        </div>
        <div class="view-container">
          <div class="view-container-inner">
            ${this.error ? html`<p class="field-error">Error: ${this.error}</p>` : ''}
            ${this.tab === 'banks' ? html`<bank-list id="child"></bank-list>` : ''}
            ${this.tab === 'stocks' ? html`<stock-list id="child"></stock-list>` : ''}
            ${this.tab === 'dividends' ? html`<dividend-log id="child"></dividend-log>` : ''}
            ${this.tab === 'overview' ? html`<overview-view id="child"></overview-view>` : ''}
            <div class="section">
              <span>FY ${this.fy} total (context):</span>
              <strong>${this.footerTotal == null ? '—' : formatAUD(this.footerTotal)}</strong>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('wealthflow-orchestrator')) {
  customElements.define('wealthflow-orchestrator', WealthOrchestrator as unknown as CustomElementConstructor);
}
