import { LitElement, html } from 'lit';
import { sharedStyles } from '../styles/shared-styles.js';
import { wealthflowStyles } from '../styles/wealthflow-styles.js';
import { portfolioStyles } from '../styles/portfolio-styles.js';
import { rebuildAllStocks } from '../services/holding-service.js';
import { listParcels } from '../dao/parcels.js';
import { listDisposals } from '../dao/disposals.js';
import { listTrades } from '../dao/trades.js';
import { listStocks } from '../dao/stocks.js';

const Base =
  typeof HTMLElement !== 'undefined'
    ? LitElement
    : (class {} as unknown as typeof LitElement);

export type TradesSection = 'summary' | 'investment' | 'trades' | 'parcels';

/**
 * The Trades page: four sections on one screen.
 *
 *   Trades Summary  the five headline numbers
 *   Investment      what you hold, what it is worth
 *   Trades          the buy/sell form above the trade log
 *   Parcels         the parcel ledger
 *
 * Trades and Parcels used to share a segment control, which meant the ledger
 * was invisible to anyone who did not know it was there, and the ledger of a
 * holding you were looking at sat two clicks from the log that produced it.
 * A log and the ledger of that log belong on the same page.
 *
 * The derived state is rebuilt by the holding service, which owns the whole
 * chain (trades -> parcels -> disposals -> shares). This element asks it to
 * catch up on load, so the four sections never read a stale ledger. The page
 * rebuilds ONCE per load and pushes the result to all four sections.
 */
export class TradesView extends Base {
  static override styles =
    typeof HTMLElement !== 'undefined'
      ? ([sharedStyles, wealthflowStyles, portfolioStyles] as any)
      : [];
  finance: any = null;
  error = '';
  showForm = false;
  /** Which sections are collapsed. Parcels is closed by default — 46 lots is
   *  several screens long and the deepest drill-down of the four. */
  collapsed: Record<TradesSection, boolean> = {
    summary: false,
    investment: false,
    trades: false,
    parcels: true,
  };
  parcelCount = 0;
  tradeCount = 0;
  holdingCount = 0;

  async setFinance(f: any): Promise<void> {
    this.finance = f;
    await this.reload();
  }

  async reload(): Promise<void> {
    if (!this.finance) return;
    try {
      // Every load rebuilds. The rebuild itself lives in the holding service,
      // which owns the whole chain; this is just a request to catch up.
      await rebuildAllStocks(this.finance);
      this.parcelCount = (await listParcels(this.finance)).length;
      this.tradeCount = (await listTrades(this.finance)).length;
      this.holdingCount = await this.countHoldings();
      await this.pushToChildren();
    } catch (e: any) {
      this.error = String(e?.message || e);
    }
    (this as any).requestUpdate?.();
  }

  /** Stocks with an OPEN position. A fully exited holding is not a holding,
   *  so the count is units still held, not stocks that ever had a parcel. */
  private async countHoldings(): Promise<number> {
    const [parcels, stocks, disposals] = await Promise.all([
      listParcels(this.finance),
      listStocks(this.finance, { status: 'all' }),
      listDisposals(this.finance),
    ]);
    const open = new Map<number, number>();
    for (const p of parcels)
      open.set(p.stock_id, (open.get(p.stock_id) ?? 0) + p.quantity);
    for (const d of disposals)
      open.set(d.stock_id, (open.get(d.stock_id) ?? 0) - d.quantity);
    return stocks.filter((s) => (open.get(s.id) ?? 0) > 0).length;
  }

  private async pushToChildren(): Promise<void> {
    try {
      await (this as any).updateComplete;
    } catch {
      /* non-Lit */
    }
    const root = (this as any).renderRoot as ShadowRoot | undefined;
    if (!root || !this.finance) return;
    for (const tag of [
      'trades-summary',
      'investment-table',
      'trade-form',
      'trade-log',
      'parcel-ledger',
    ]) {
      const el = root.querySelector(tag) as any;
      if (!el) continue;
      el.finance = this.finance;
      // The Investment table announces a price change through this, so the
      // SIBLING sections re-read. Two numbers for the same money is worse
      // than no number at all.
      if ('onPricesUpdated' in el)
        el.onPricesUpdated = () => {
          void this.refreshChildren();
        };
      if (typeof el.setFinance === 'function')
        await el.setFinance(this.finance);
      else if (typeof el.reload === 'function') await el.reload();
    }
  }

  private toggle(section: TradesSection): void {
    this.collapsed = { ...this.collapsed, [section]: !this.collapsed[section] };
    (this as any).requestUpdate?.();
  }

  override connectedCallback(): void {
    (super.connectedCallback as (() => void) | undefined)?.call(this);
    this.addEventListener(
      'trade-create',
      this._onTradeChanged as EventListener,
    );
    this.addEventListener('trade-edit', this._onTradeChanged as EventListener);
    this.addEventListener(
      'trade-delete',
      this._onTradeChanged as EventListener,
    );
    this.addEventListener(
      'trade-edit-request',
      this._onEditRequest as EventListener,
    );
    this.addEventListener(
      'prices-updated',
      this._onPricesUpdated as EventListener,
    );
  }

  /**
   * Re-read the children WITHOUT rebuilding the parcels. A price change does
   * not touch the parcel ledger, and rebuilding it would rewrite every row.
   */

  override disconnectedCallback(): void {
    this.removeEventListener(
      'trade-create',
      this._onTradeChanged as EventListener,
    );
    this.removeEventListener(
      'trade-edit',
      this._onTradeChanged as EventListener,
    );
    this.removeEventListener(
      'trade-delete',
      this._onTradeChanged as EventListener,
    );
    this.removeEventListener(
      'trade-edit-request',
      this._onEditRequest as EventListener,
    );
    this.removeEventListener(
      'prices-updated',
      this._onPricesUpdated as EventListener,
    );
    (super.disconnectedCallback as (() => void) | undefined)?.call(this);
  }

  /**
   * The prices changed, so every section that shows money must re-read.
   *
   * The Trades Summary is a SIBLING of the Investment table and holds its own
   * copy of the portfolio summary. Without this it would keep showing the old
   * Portfolio value while the table beside it showed the new one.
   */
  private _onPricesUpdated = (): void => {
    void this.refreshChildren();
  };

  /**
   * Re-read the children WITHOUT rebuilding the parcels. A price change does
   * not touch the parcel ledger, and rebuilding it would rewrite every row.
   */
  async refreshChildren(): Promise<void> {
    await this.pushToChildren();
  }

  private _onTradeChanged = async (): Promise<void> => {
    await this.reload();
  };

  private _onEditRequest = (e: Event): void => {
    const trade = (e as CustomEvent).detail?.trade;
    if (!trade) return;
    this.showForm = true;
    (this as any).requestUpdate?.();
    void (async () => {
      await this.pushToChildren();
      (this as any).renderRoot?.querySelector('trade-form')?.editTrade?.(trade);
    })();
  };

  /** One section block: a header with a collapse toggle and a count badge,
   *  and a body that can be hidden. */
  private section(
    key: TradesSection,
    title: string,
    badge: string,
    body: unknown,
    actions: unknown = '',
  ): unknown {
    const open = !this.collapsed[key];
    const bodyId = `wf-body-${key}`;
    return html`
      <div class="section flush">
        <div class="section-header is-toggle" @click=${() => this.toggle(key)}>
          <button
            type="button"
            class="section-toggle"
            aria-expanded=${open ? 'true' : 'false'}
            aria-controls=${bodyId}
          >
            <span class="chevron" aria-hidden="true"></span>
            <span class="section-title">${title}</span>
          </button>
          <div
            class="header-actions"
            @click=${(e: Event) => e.stopPropagation()}
          >
            <span class="section-badge rows-badge">${badge}</span>
            ${actions}
          </div>
        </div>
        <div class="section-body" id=${bodyId} ?hidden=${!open}>${body}</div>
      </div>
    `;
  }

  override render(): unknown {
    if (typeof HTMLElement === 'undefined') return html``;
    return html`
      <div class="order-stack">
        ${
          this.error
            ? html`<p class="field-error" role="alert">Error: ${this.error}</p>`
            : ''
        }
        ${this.section(
          'summary',
          'Trades Summary',
          `${this.holdingCount} holding${this.holdingCount === 1 ? '' : 's'}`,
          html`<trades-summary></trades-summary>`,
        )}
        ${this.section(
          'investment',
          'Investment',
          `${this.holdingCount} holding${this.holdingCount === 1 ? '' : 's'}`,
          html`<investment-table></investment-table>`,
        )}
        ${this.section(
          'trades',
          'Trades',
          `${this.tradeCount} trade${this.tradeCount === 1 ? '' : 's'}`,
            // A bare wrapper: the binding must sit inside an element, or
            // happy-dom's parser drops it and neither the form nor the log is
            // ever in the test DOM.
            html`<div>
              ${this.showForm ? html`<trade-form></trade-form>` : ''}
            </div>
            <trade-log></trade-log>`,
          html`<button
            class="btn btn-secondary btn-small"
            type="button"
            @click=${async () => {
              this.showForm = !this.showForm;
              (this as any).requestUpdate?.();
              if (this.showForm) {
                await this.pushToChildren();
                const form = (this as any).renderRoot?.querySelector('trade-form');
                if (form?.editTrade) form.editTrade(null);
              }
            }}
          >
            ${this.showForm ? 'Hide form' : 'Log trade'}
          </button>`,
        )}
        ${this.section(
          'parcels',
          'Parcels',
          `${this.parcelCount} parcel${this.parcelCount === 1 ? '' : 's'}`,
          html`<parcel-ledger></parcel-ledger>`,
        )}
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
