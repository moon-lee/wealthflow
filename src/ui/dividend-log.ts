import { LitElement, html } from 'lit';
import { sharedStyles } from '../styles/shared-styles.js';
import { wealthflowStyles } from '../styles/wealthflow-styles.js';
import { ExtensionLogger } from 'finance-logger';
import { formatAUD } from '../utils/format.js';
import {
  DIVIDEND_LABELS,
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
  error = '';

  async setFinance(f: any): Promise<void> {
    this.finance = f;
    await this.reload();
  }

  async reload(): Promise<void> {
    if (!this.finance?.db) return;
    this.error = '';
    try {
      try {
        const prefill = sessionStorage.getItem('wealthflow.prefillStock');
        if (prefill) {
          this.stockFilter = Number(prefill);
          sessionStorage.removeItem('wealthflow.prefillStock');
        }
      } catch {
        /* non-browser */
      }
      this.stocks = await listStocks(this.finance, { status: 'all' });
      this.entries = await listDividends(
        this.finance,
        this.stockFilter === 'all'
          ? { financeYear: this.fy || undefined }
          : { stockId: this.stockFilter, financeYear: this.fy || undefined },
      );
    } catch (e: any) {
      logger.error('dividend log reload failed:', e);
      this.error = String(e?.message || e);
    }
    (this as any).requestUpdate?.();
    await this.pushToForm();
  }

  private async pushToForm(): Promise<void> {
    try {
      await (this as any).updateComplete;
    } catch {
      /* non-Lit */
    }
    const root = (this as any).renderRoot as ShadowRoot | undefined;
    const form = root?.querySelector('dividend-form') as any;
    if (form && this.finance) {
      form.finance = this.finance;
      try {
        form.fy = this.fy;
      } catch {
        /* ignore */
      }
      if (typeof form.setFinance === 'function') {
        try {
          await form.setFinance(this.finance);
        } catch {
          /* form surfaces its own errors */
        }
      }
    }
  }

  private stockName(id: number): string {
    return this.stocks.find((s) => s.id === id)?.code ?? `#${id}`;
  }

  private async onDelete(entry: DividendEntry): Promise<void> {
    if (
      typeof confirm !== 'undefined' &&
      !confirm(`Delete this ${formatAUD(entry.gross)} dividend receipt?`)
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

  override connectedCallback(): void {
    (super.connectedCallback as (() => void) | undefined)?.call(this);
    this.addEventListener(
      'dividend-create',
      this._onFormChanged as EventListener,
    );
    this.addEventListener(
      'dividend-edit',
      this._onFormChanged as EventListener,
    );
  }

  override disconnectedCallback(): void {
    this.removeEventListener(
      'dividend-create',
      this._onFormChanged as EventListener,
    );
    this.removeEventListener(
      'dividend-edit',
      this._onFormChanged as EventListener,
    );
    (super.disconnectedCallback as (() => void) | undefined)?.call(this);
  }

  private _onFormChanged = (e: Event): void => {
    if ((e as CustomEvent).detail?.fromLog) return;
    void this.reload();
  };

  override render(): unknown {
    if (typeof HTMLElement === 'undefined') return html``;
    const gross = this.entries.reduce((s, e) => s + Number(e.gross ?? 0), 0);
    const franking = this.entries.reduce(
      (s, e) => s + Number(e.franking ?? 0),
      0,
    );
    return html`
      <div class="section">
        <h3>Dividends — FY ${this.fy}</h3>
        <label
          >Stock
          <select
            @change=${(e: Event) => {
              const v = (e.target as HTMLSelectElement).value;
              this.stockFilter = v === 'all' ? 'all' : Number(v);
              void this.reload();
            }}
          >
            <option value="all">All stocks</option>
            ${this.stocks.map((s) => html`<option value=${s.id} ?selected=${this.stockFilter === s.id}>${s.code}${s.is_active ? '' : ' (inactive)'}</option>`)}
          </select>
        </label>
        ${this.error ? html`<p class="field-error">Error: ${this.error}</p>` : ''}
        ${
          this.entries.length === 0
            ? html`<p>No receipts this FY — ${formatAUD(0)}. Log one below.</p>`
            : html`<div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Stock</th>
                      <th>Type</th>
                      <th>Gross</th>
                      <th>Franking</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${this.entries.map(
                      (e) =>
                        html`<tr>
                          <td>${e.date}</td>
                          <td>${this.stockName(e.stock_id)}</td>
                          <td>${DIVIDEND_LABELS[e.type]}</td>
                          <td>${formatAUD(Number(e.gross))}</td>
                          <td>${formatAUD(Number(e.franking))}</td>
                          <td>
                            <button
                              class="filter-btn"
                              @click=${() => this.onDelete(e)}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>`,
                    )}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colspan="3">Total</td>
                      <td>${formatAUD(Math.round(gross * 100) / 100)}</td>
                      <td>${formatAUD(Math.round(franking * 100) / 100)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>`
        }
      </div>
      <dividend-form></dividend-form>
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
