import { LitElement, html } from 'lit';
import { sharedStyles } from '../styles/shared-styles.js';
import { wealthflowStyles } from '../styles/wealthflow-styles.js';
import { ExtensionLogger } from 'finance-logger';
import { formatAUD } from '../utils/format.js';
import {
  DIVIDEND_LABELS,
  DIVIDEND_TYPES,
  listDividends,
  deleteDividend,
  type DividendEntry,
} from '../dao/dividends.js';
import { listStocks, type Stock } from '../dao/stocks.js';

const Base =
  typeof HTMLElement !== 'undefined'
    ? LitElement
    : (class {} as unknown as typeof LitElement);
const logger = new ExtensionLogger('wealthflow');

/**
 * Receipts table for one financial year. It renders no section chrome of its
 * own — the host Overview section owns the header — so the FY heading and the
 * gross total are stated exactly once per screen.
 */
export class DividendLog extends Base {
  static override styles =
    typeof HTMLElement !== 'undefined'
      ? ([sharedStyles, wealthflowStyles] as any)
      : [];
  finance: any = null;
  fy = '';
  stocks: Stock[] = [];
  entries: DividendEntry[] = [];
  stockFilter: number | 'all' = 'all';
  typeFilter: string | 'all' = 'all';
  error = '';

  async setFinance(f: any): Promise<void> {
    this.finance = f;
    await this.reload();
  }

  async reload(): Promise<void> {
    if (!this.finance?.db) return;
    this.error = '';
    try {
      this.stocks = await listStocks(this.finance, { status: 'all' });
      this.entries = await listDividends(this.finance, {
        financeYear: this.fy || undefined,
        ...(this.stockFilter === 'all' ? {} : { stockId: this.stockFilter }),
        ...(this.typeFilter === 'all' ? {} : { type: this.typeFilter }),
      });
    } catch (e: any) {
      logger.error('dividend log reload failed:', e);
      this.error = String(e?.message || e);
    }
    (this as any).requestUpdate?.();
  }

  private stockName(id: number): string {
    return this.stocks.find((s) => s.id === id)?.stock_code ?? `#${id}`;
  }

  private stockFullName(id: number): string {
    return this.stocks.find((s) => s.id === id)?.stock_full_name ?? '';
  }

  /** Editing happens in the host's collapsible form, which this asks to open. */
  private requestEdit(entry: DividendEntry): void {
    this.dispatchEvent(
      new CustomEvent('dividend-edit-request', {
        detail: { entry },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private async onDelete(entry: DividendEntry): Promise<void> {
    if (
      typeof confirm !== 'undefined' &&
      !confirm(
        `Delete ${this.stockName(entry.stock_id)} ${formatAUD(Number(entry.gross))} dividend on ${entry.date}?`,
      )
    )
      return;
    try {
      await deleteDividend(this.finance, entry.id);
      this.dispatchEvent(
        new CustomEvent('dividend-delete', {
          detail: { id: entry.id },
          bubbles: true,
          composed: true,
        }),
      );
      await this.reload();
    } catch (e: any) {
      this.error = String(e?.message || e);
      (this as any).requestUpdate?.();
    }
  }

  private onFilterChange(): void {
    (this as any).requestUpdate?.();
    void this.reload();
  }

  override render(): unknown {
    if (typeof HTMLElement === 'undefined') return html``;
    const gross = this.entries.reduce((s, e) => s + Number(e.gross ?? 0), 0);
    const franking = this.entries.reduce(
      (s, e) => s + Number(e.franking ?? 0),
      0,
    );
    const filtered = this.stockFilter !== 'all' || this.typeFilter !== 'all';
    return html`
      <div class="log-filters">
        <label
          ><span>Stock</span>
          <select
            aria-label="Filter by stock"
            @change=${(e: Event) => {
              const v = (e.target as HTMLSelectElement).value;
              this.stockFilter = v === 'all' ? 'all' : Number(v);
              this.onFilterChange();
            }}
          >
            <option value="all">All stocks</option>
            ${this.stocks.map(
              (s) =>
                html`<option
                  value=${s.id}
                  ?selected=${this.stockFilter === s.id}
                >
                  ${s.stock_code}${s.is_active ? '' : ' (inactive)'}
                </option>`,
            )}
          </select>
        </label>
        <label
          ><span>Type</span>
          <select
            aria-label="Filter by type"
            @change=${(e: Event) => {
              this.typeFilter = (e.target as HTMLSelectElement).value;
              this.onFilterChange();
            }}
          >
            <option value="all">All types</option>
            ${DIVIDEND_TYPES.map(
              (t) =>
                html`<option value=${t} ?selected=${this.typeFilter === t}>
                  ${DIVIDEND_LABELS[t]}
                </option>`,
            )}
          </select>
        </label>
        <span class="rate-badge"
          >${this.entries.length}
          ${this.entries.length === 1 ? 'receipt' : 'receipts'}</span
        >
      </div>
      ${
        this.error
          ? html`<p class="field-error" role="alert" aria-live="polite">
              Error: ${this.error}
            </p>`
          : ''
      }
      ${
        this.entries.length === 0
          ? html`<p class="empty-state">
              ${
                filtered
                  ? 'No receipts match this filter.'
                  : 'No dividends logged this FY yet — use “Log dividend” to add the first one.'
              }
            </p>`
          : this.renderTable(gross, franking, filtered)
      }
    `;
  }

  private renderTable(
    gross: number,
    franking: number,
    filtered: boolean,
  ): unknown {
    const round2 = (n: number) => Math.round(n * 100) / 100;
    return html`
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Holding</th>
              <th scope="col">Type</th>
              <th scope="col" class="num">Gross</th>
              <th scope="col" class="num">Franking</th>
              <th scope="col" class="num">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${this.entries.map(
              (e) => html`
                <tr>
                  <td class="mono">${e.date}</td>
                  <td>
                    <span class="row-code">${this.stockName(e.stock_id)}</span>
                    ${
                      this.stockFullName(e.stock_id)
                        ? html`<span class="row-sub"
                            >${this.stockFullName(e.stock_id)}</span
                          >`
                        : ''
                    }
                  </td>
                  <td>${DIVIDEND_LABELS[e.type]}</td>
                  <td class="num">${formatAUD(Number(e.gross))}</td>
                  <td class="num">${formatAUD(Number(e.franking))}</td>
                  <td>
                    <div class="row-actions">
                      <button
                        class="btn btn-secondary btn-small"
                        aria-label="Edit ${this.stockName(e.stock_id)} dividend on ${e.date}"
                        @click=${() => this.requestEdit(e)}
                      >
                        Edit
                      </button>
                      <button
                        class="btn btn-secondary btn-small"
                        aria-label="Delete ${this.stockName(e.stock_id)} dividend on ${e.date}"
                        @click=${() => this.onDelete(e)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              `,
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="3" class="total-label">
                Total${filtered ? ' (filtered)' : ''}
              </td>
              <td class="num">${formatAUD(round2(gross))}</td>
              <td class="num">${formatAUD(round2(franking))}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
  }
}

if (
  typeof customElements !== 'undefined' &&
  !customElements.get('dividend-log')
) {
  customElements.define(
    'dividend-log',
    DividendLog as unknown as CustomElementConstructor,
  );
}
