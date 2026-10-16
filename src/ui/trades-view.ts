import { LitElement, html } from 'lit';
import { sharedStyles } from '../styles/shared-styles.js';
import { wealthflowStyles } from '../styles/wealthflow-styles.js';
import { rebuildAllParcels } from '../services/parcel-service.js';

const Base =
  typeof HTMLElement !== 'undefined'
    ? LitElement
    : (class {} as unknown as typeof LitElement);

/**
 * Trades section: the buy form above the log, and the parcel ledger behind a
 * segment control.
 *
 * This element is the ONLY caller of rebuildAllParcels. Nothing else may call
 * it: parcel-ledger reads wealthflow_parcels, it never recomputes. One caller
 * means one place to look, and a buy typed above is reflected in `shares` and
 * the ledger on the same tick.
 */
export class TradesView extends Base {
  static override styles =
    typeof HTMLElement !== 'undefined'
      ? ([sharedStyles, wealthflowStyles] as any)
      : [];
  finance: any = null;
  error = '';
  segment: 'trades' | 'parcels' = 'trades';
  showForm = true;

  async setFinance(f: any): Promise<void> {
    this.finance = f;
    await this.reload();
  }

  async reload(): Promise<void> {
    if (!this.finance) return;
    try {
      // Every load rebuilds. Two rules here would drift; one is simpler than
      // remembering to refresh on every path that can change a trade — and at
      // 46 parcels the cost is nothing.
      await rebuildAllParcels(this.finance);
      await this.pushToChildren();
    } catch (e: any) {
      this.error = String(e?.message || e);
    }
    (this as any).requestUpdate?.();
  }

  private async pushToChildren(): Promise<void> {
    try {
      await (this as any).updateComplete;
    } catch {
      /* non-Lit */
    }
    const root = (this as any).renderRoot as ShadowRoot | undefined;
    if (!root || !this.finance) return;
    for (const tag of ['trade-log', 'trade-form', 'parcel-ledger']) {
      const el = root.querySelector(tag) as any;
      if (!el) continue;
      el.finance = this.finance;
      if (typeof el.setFinance === 'function') await el.setFinance(this.finance);
      else if (typeof el.reload === 'function') await el.reload();
    }
  }

  private setSegment(s: 'trades' | 'parcels'): void {
    this.segment = s;
    (this as any).requestUpdate?.();
    void this.pushToChildren();
  }

  override connectedCallback(): void {
    (super.connectedCallback as (() => void) | undefined)?.call(this);
    this.addEventListener('trade-create', this._onTradeChanged as EventListener);
    this.addEventListener('trade-edit', this._onTradeChanged as EventListener);
    this.addEventListener('trade-delete', this._onTradeChanged as EventListener);
    this.addEventListener(
      'trade-edit-request',
      this._onEditRequest as EventListener,
    );
  }

  override disconnectedCallback(): void {
    this.removeEventListener(
      'trade-create',
      this._onTradeChanged as EventListener,
    );
    this.removeEventListener('trade-edit', this._onTradeChanged as EventListener);
    this.removeEventListener(
      'trade-delete',
      this._onTradeChanged as EventListener,
    );
    this.removeEventListener(
      'trade-edit-request',
      this._onEditRequest as EventListener,
    );
    (super.disconnectedCallback as (() => void) | undefined)?.call(this);
  }

  private _onTradeChanged = async (): Promise<void> => {
    await this.reload();
  };

  private _onEditRequest = (e: Event): void => {
    const trade = (e as CustomEvent).detail?.trade;
    if (!trade) return;
    this.showForm = true;
    this.segment = 'trades';
    (this as any).requestUpdate?.();
    void (async () => {
      await this.pushToChildren();
      (this as any).renderRoot?.querySelector('trade-form')?.editTrade?.(trade);
    })();
  };

  override render(): unknown {
    if (typeof HTMLElement === 'undefined') return html``;
    return html`
      <div class="order-stack">
        ${this.error
          ? html`<p class="field-error">Error: ${this.error}</p>`
          : ''}
        <div class="segment" role="tablist">
          <button
            role="tab"
            class=${this.segment === 'trades' ? 'on' : ''}
            aria-selected=${this.segment === 'trades'}
            @click=${() => this.setSegment('trades')}
          >
            Trades
          </button>
          <button
            role="tab"
            class=${this.segment === 'parcels' ? 'on' : ''}
            aria-selected=${this.segment === 'parcels'}
            @click=${() => this.setSegment('parcels')}
          >
            Parcels
          </button>
        </div>

        ${this.segment === 'trades'
          ? html`
              <div class="section flush">
                <div class="section-header is-toggle">
                  <h3 class="section-title">Trades</h3>
                  <div class="header-actions">
                    <button
                      class="btn btn-secondary btn-small"
                      @click=${() => {
                        this.showForm = !this.showForm;
                        (this as any).requestUpdate?.();
                      }}
                    >
                      ${this.showForm ? 'Hide form' : 'Log buy'}
                    </button>
                  </div>
                </div>
                <div class="section-body">
                  ${this.showForm ? html`<trade-form></trade-form>` : ''}
                  <trade-log></trade-log>
                </div>
              </div>
            `
          : html`<parcel-ledger></parcel-ledger>`}
      </div>
    `;
  }
}

if (
  typeof customElements !== 'undefined' &&
  !customElements.get('trades-view')
) {
  customElements.define(
    'trades-view',
    TradesView as unknown as CustomElementConstructor,
  );
}