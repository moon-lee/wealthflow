import { LitElement, html } from 'lit';
import { sharedStyles } from '../styles/shared-styles.js';
import { wealthflowStyles } from '../styles/wealthflow-styles.js';
import type { Trade } from '../dao/trades.js';
import { listTrades } from '../dao/trades.js';
import { dateSortHeader } from './sort-header.js';
import { formatAUD, formatPrice } from '../utils/format.js';

const Base =
  typeof HTMLElement !== 'undefined'
    ? LitElement
    : (class {} as unknown as typeof LitElement);

/** A price per unit, to three decimals — the same rule as the Investment table. */
function price4(n: number): string {
  return formatPrice(n);
}

function qty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(4);
}

/** Rows per page. Ten is a screenful of the densest log in the extension. */
const PAGE_SIZE = 10;

/**
 * The trade log: buys, newest first. It owns its ordering and exposes
 * `sortedTrades`, because the test DOM drops tbody rows and the order has to
 * be assertable where it is decided rather than where it is rendered.
 *
 * It also owns its pager and its stock filter, which sits in the Stock column
 * header: both are properties of this list, not of the page around it.
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
  /** Zero-based page of the log; clamped on every reload. */
  page = 0;
  /** `null` means every stock. Set from the Stock filter. */
  stockFilter: number | null = null;

  sortByDate(): void {
    this.sortDesc = !this.sortDesc;
    // Page 3 of the old order is an arbitrary window on the new one.
    this.page = 0;
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
      // A filter whose stock has left the log would hide every row with no
      // visible cause, so it goes when the stock does.
      if (
        this.stockFilter != null &&
        !this.trades.some((t) => t.stock_id === this.stockFilter)
      )
        this.stockFilter = null;
    } catch (e: any) {
      this.error = String(e?.message || e);
    }
    // The log can shrink under the page being read (a delete, a filter, a
    // reload); landing on a page that no longer exists shows an empty table.
    this.page = Math.max(0, Math.min(this.page, this.pages - 1));
    (this as any).requestUpdate?.();
  }

  /**
   * Every trade in date order, newest first by default. `id` breaks same-day
   * ties: a comparator that calls two rows equal lets the sort put them in a
   * different order between renders, and paging would then show one row twice
   * and lose another.
   */
  get sortedTrades(): Trade[] {
    const dir = this.sortDesc ? -1 : 1;
    return this.trades.slice().sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -dir : dir;
      return (a.id - b.id) * dir;
    });
  }

  /** The log after the Stock filter, in the order the Date header claims. */
  get filteredTrades(): Trade[] {
    if (this.stockFilter == null) return this.sortedTrades;
    return this.sortedTrades.filter((t) => t.stock_id === this.stockFilter);
  }

  get filteredCount(): number {
    return this.filteredTrades.length;
  }

  /** Rows in the log, filter or no filter. */
  get rowCount(): number {
    return this.trades.length;
  }

  /** Pages of the filtered log; always at least one. */
  get pages(): number {
    return Math.max(1, Math.ceil(this.filteredCount / PAGE_SIZE));
  }

  /** The rows on the current page. */
  get pageRows(): Trade[] {
    const start = this.page * PAGE_SIZE;
    return this.filteredTrades.slice(start, start + PAGE_SIZE);
  }

  /** Codes in this log, so the filter cannot offer a stock with no rows. */
  get filterStocks(): { id: number; code: string }[] {
    const seen = new Map<number, string>();
    for (const t of this.trades) {
      if (!seen.has(t.stock_id)) seen.set(t.stock_id, this.code(t.stock_id));
    }
    return [...seen.entries()]
      .map(([id, code]) => ({ id, code }))
      .sort((a, b) => a.code.localeCompare(b.code));
  }

  setStockFilter(id: number | null): void {
    this.stockFilter = id;
    // The old page number is a window on a list that no longer exists.
    this.page = 0;
    (this as any).requestUpdate?.();
  }

  gotoPage(page: number): void {
    const next = Math.min(Math.max(0, page), this.pages - 1);
    if (next === this.page) return;
    this.page = next;
    (this as any).requestUpdate?.();
  }

  private onFilterChange(e: Event): void {
    const value = (e.target as HTMLSelectElement).value;
    this.setStockFilter(value === 'all' ? null : Number(value));
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

  /**
   * The Stock filter, in the Stock column header. It lists only the codes this
   * log holds: an option that selects no rows is a control that can only lie.
   * With no trades there is nothing to narrow, so the header stays a label.
   *
   * The select carries no `.value` binding — lit commits that before the
   * `<option>` children exist — so each option declares its own `selected`.
   */
  private renderStockHeader(): unknown {
    if (this.trades.length === 0) return html`<th scope="col">Stock</th>`;
    const label =
      this.stockFilter == null ? 'All stocks' : this.code(this.stockFilter);
    const cls = this.stockFilter == null ? 'th-filter' : 'th-filter active';
    return html`<th scope="col" class="filter-th">
      <span class=${cls} aria-hidden="true">
        Stock
        <span class="current">${label}</span>
        <span class="caret">▾</span>
      </span>
      <select
        class="col-filter"
        aria-label="Filter trades by stock"
        @change=${(e: Event) => this.onFilterChange(e)}
      >
        <option value="all" ?selected=${this.stockFilter == null}>
          All stocks
        </option>
        ${this.filterStocks.map(
          (s) =>
            html`<option value=${s.id} ?selected=${this.stockFilter === s.id}>
              ${s.code}
            </option>`,
        )}
      </select>
    </th>`;
  }

  /**
   * The pager. Nothing at all when the log fits on one page — a disabled Next
   * on a ten-row log is a control that can only lie.
   */
  private renderPager(): unknown {
    if (this.pages <= 1) return '';
    const n = this.filteredCount;
    return html`
      <div class="table-pager">
        <span class="muted"
          >Page ${this.page + 1} of ${this.pages} · ${n}
          ${n === 1 ? 'trade' : 'trades'}</span
        >
        <div class="pager-actions">
          <button
            class="btn btn-secondary btn-small"
            type="button"
            ?disabled=${this.page === 0}
            @click=${() => this.gotoPage(this.page - 1)}
          >
            Previous
          </button>
          <button
            class="btn btn-secondary btn-small"
            type="button"
            ?disabled=${this.page >= this.pages - 1}
            @click=${() => this.gotoPage(this.page + 1)}
          >
            Next
          </button>
        </div>
      </div>
    `;
  }

  override render(): unknown {
    if (typeof HTMLElement === 'undefined') return html``;
    const rows = this.pageRows;
    return html`
      <div>
        ${
          this.error
            ? html`<p class="field-error">Error: ${this.error}</p>`
            : ''
        }
        <div class="table-wrap">
          <table class="hist-table">
            <!--
              table-layout: fixed splits an unmeasured table into equal
              columns, which gave "buy"/"sell" as much room as the Stock code
              and the header filter above it. These widths hand the narrow
              values what they need and the rest to Stock and the money
              columns. Percentages keep the table inside the panel at any
              width; they add up to 100.
            -->
            <colgroup>
              <col style="width: 12%" />
              <col style="width: 22%" />
              <col style="width: 7%" />
              <col style="width: 8%" />
              <col style="width: 13%" />
              <col style="width: 13%" />
              <col style="width: 13%" />
              <col style="width: 12%" />
            </colgroup>
            <thead>
              <tr>
                <th
                  scope="col"
                  aria-sort=${this.sortDesc ? 'descending' : 'ascending'}
                >
                  ${dateSortHeader('Date', this.sortDesc, () =>
                    this.sortByDate(),
                  )}
                </th>
                ${this.renderStockHeader()}
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
                          <td class="mono">${t.date}</td>
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
          ${this.renderPager()}
        </div>
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
