import { LitElement, html } from 'lit';
import { sharedStyles } from '../styles/shared-styles.js';
import { wealthflowStyles } from '../styles/wealthflow-styles.js';
import type { Trade } from '../dao/trades.js';
import { listTrades } from '../dao/trades.js';
import { formatAUD } from '../utils/format.js';

const Base =
  typeof HTMLElement !== 'undefined'
    ? LitElement
    : (class {} as unknown as typeof LitElement);

/** A DRP price carries 4 decimals; 2dp would print $108.86 for $108.8611. */
function price4(n: number): string {
  return n.toFixed(4);
}

function qty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(4);
}

/**
 * The trade log: buys, newest first. It owns its ordering and exposes
 * `sortedTrades`, because the test DOM drops tbody rows and the order has to
 * be assertable where it is decided rather than where it is rendered.
 */
export class TradeLog extends Base {
  static override styles =
    typeof HTMLElement !== 'undefined'
      ? ([sharedStyles, wealthflowStyles] as any)
      : [];
  finance: any = null;
  error = '';
  trades: Trade[] = [];
  stocks: Map<number, string> = new Map();
  sortDesc = true;

  sortByDate(): void {
    this.sortDesc = !this.sortDesc;
    (this as any).requestUpdate?.();
  }

  async setFinance(f: any): Promise<void> {
    this.finance = f;
    await this.reload();
  }

  async reload(): Promise<void> {
    if (!this.finance) return;
    this.error = '';
    try {
      const { listStocks } = await import('../dao/stocks.js');
      const [trades, stocks] = await Promise.all([
        listTrades(this.finance),
        listStocks(this.finance, { status: 'all' }),
      ]);
      this.trades = trades;
      this.stocks = new Map(stocks.map((s) => [s.id, s.stock_code]));
    } catch (e: any) {
      this.error = String(e?.message || e);
    }
    (this as any).requestUpdate?.();
  }

  get sortedTrades(): Trade[] {
    return this.trades
      .slice()
      .sort((a, b) =>
        this.sortDesc ? (a.date < b.date ? 1 : -1) : a.date < b.date ? -1 : 1,
      );
  }

  get rowCount(): number {
    return this.trades.length;
  }

  private code(id: number): string {
    return this.stocks.get(id) ?? `#${id}`;
  }

  private editRequest(t: Trade): void {
    this.dispatchEvent(
      new CustomEvent('trade-edit-request', {
        detail: { trade: t },
        bubbles: true,
        composed: true,
      }),
    );
  }

  override render(): unknown {
    if (typeof HTMLElement === 'undefined') return html``;
    const rows = this.sortedTrades;
    return html`
      <div class="table-wrap">
        ${
          this.error
            ? html`<p class="field-error">Error: ${this.error}</p>`
            : ''
        }
        <table class="hist-table">
          <thead>
            <tr>
              <th scope="col">
                <button class="sort-btn" @click=${() => this.sortByDate()}>
                  Date ${this.sortDesc ? '▾' : '▴'}
                </button>
              </th>
              <th scope="col">Stock</th>
              <th scope="col">Side</th>
              <th scope="col" class="num">Qty</th>
              <th scope="col" class="num">Price</th>
              <th scope="col" class="num">Brokerage</th>
              <th scope="col" class="num">Cost</th>
              <th scope="col" class="num">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${
              rows.length === 0
                ? html`<tr>
                    <td colspan="8" class="muted">No trades yet.</td>
                  </tr>`
                : rows.map(
                    (t) =>
                      html`<tr>
                        <td>${t.date}</td>
                        <td>${this.code(t.stock_id)}</td>
                        <td>${t.side}</td>
                        <td class="num">${qty(t.quantity)}</td>
                        <td class="num">${price4(t.price)}</td>
                        <td class="num">${formatAUD(t.brokerage)}</td>
                        <td class="num">
                          ${formatAUD(t.quantity * t.price + t.brokerage)}
                        </td>
                        <td class="num actions">
                          <button
                            class="btn btn-secondary btn-small"
                            @click=${() => this.editRequest(t)}
                          >
                            Edit
                          </button>
                        </td>
                      </tr>`,
                  )
            }
          </tbody>
        </table>
      </div>
    `;
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('trade-log')) {
  customElements.define(
    'trade-log',
    TradeLog as unknown as CustomElementConstructor,
  );
}
