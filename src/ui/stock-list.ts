import { LitElement, html } from 'lit';
import { sharedStyles } from '../styles/shared-styles.js';
import { ExtensionLogger } from 'finance-logger';
import { formatAUD } from '../utils/format.js';
import { getDividendTotals } from '../services/stock-service.js';
import {
  listStocks,
  createStock,
  updateStock,
  setStockActive,
  type Stock,
} from '../dao/stocks.js';

const Base =
  typeof HTMLElement !== 'undefined'
    ? LitElement
    : (class {} as unknown as typeof LitElement);
const logger = new ExtensionLogger('wealthflow');

type StatusFilter = 'active' | 'inactive' | 'all';

export class StockList extends Base {
  static override styles =
    typeof HTMLElement !== 'undefined' ? ([sharedStyles] as any) : [];
  finance: any = null;
  fy = '';
  stocks: Stock[] = [];
  gross: Record<number, number> = {};
  franking: Record<number, number> = {};
  statusFilter: StatusFilter = 'active';
  editingId: number | null = null;
  editName = '';
  editShares = '';
  newCode = '';
  newName = '';
  newShares = '';
  error = '';
  formError = '';

  async setFinance(f: any): Promise<void> {
    this.finance = f;
    await this.reload();
  }

  async reload(): Promise<void> {
    if (!this.finance?.db) return;
    this.error = '';
    try {
      this.stocks = await listStocks(this.finance, {
        status: this.statusFilter,
      });
      if (this.fy) {
        const totals = await getDividendTotals(
          this.finance,
          this.stocks,
          this.fy,
        );
        this.gross = Object.fromEntries(
          totals.byStock.map((b) => [b.stockId, b.gross]),
        );
        this.franking = Object.fromEntries(
          totals.byStock.map((b) => [b.stockId, b.franking]),
        );
      } else {
        this.gross = {};
        this.franking = {};
      }
    } catch (e: any) {
      logger.error('stock list reload failed:', e);
      this.error = String(e?.message || e);
    }
    (this as any).requestUpdate?.();
  }

  override connectedCallback(): void {
    (super.connectedCallback as (() => void) | undefined)?.call(this);
    this.addEventListener(
      'dividend-create',
      this._onDividendChanged as EventListener,
    );
    this.addEventListener(
      'dividend-edit',
      this._onDividendChanged as EventListener,
    );
    this.addEventListener(
      'dividend-delete',
      this._onDividendChanged as EventListener,
    );
  }

  override disconnectedCallback(): void {
    this.removeEventListener(
      'dividend-create',
      this._onDividendChanged as EventListener,
    );
    this.removeEventListener(
      'dividend-edit',
      this._onDividendChanged as EventListener,
    );
    this.removeEventListener(
      'dividend-delete',
      this._onDividendChanged as EventListener,
    );
    (super.disconnectedCallback as (() => void) | undefined)?.call(this);
  }

  private _onDividendChanged = (): void => {
    void this.reload();
  };

  private async onCreate(e: Event): Promise<void> {
    e.preventDefault();
    this.formError = '';
    const shares = Number(this.newShares);
    if (this.newCode.trim() === '' || this.newName.trim() === '') {
      this.formError = 'Code and name are required.';
      return;
    }
    if (!Number.isFinite(shares) || shares < 0) {
      this.formError = 'Shares must be ≥ 0.';
      return;
    }
    try {
      const row = await createStock(this.finance, {
        code: this.newCode,
        name: this.newName.trim(),
        shares,
      });
      this.dispatchEvent(
        new CustomEvent('stock-create', {
          detail: { stock: row },
          bubbles: true,
          composed: true,
        }),
      );
      this.newCode = '';
      this.newName = '';
      this.newShares = '';
      await this.reload();
    } catch (err: any) {
      logger.error('stock create failed:', err);
      this.formError = String(err?.message || err);
    }
  }

  private startEdit(s: Stock): void {
    this.editingId = s.id;
    this.editName = s.name;
    this.editShares = String(s.shares);
    this.error = '';
  }

  private async saveEdit(s: Stock): Promise<void> {
    const shares = Number(this.editShares);
    if (this.editName.trim() === '' || !Number.isFinite(shares) || shares < 0) {
      this.error = 'Name is required and shares must be ≥ 0.';
      return;
    }
    try {
      await updateStock(this.finance, s.id, {
        name: this.editName.trim(),
        shares,
      });
      this.editingId = null;
      this.dispatchEvent(
        new CustomEvent('stock-edit', {
          detail: { id: s.id },
          bubbles: true,
          composed: true,
        }),
      );
      await this.reload();
    } catch (e: any) {
      logger.error('stock edit failed:', e);
      this.error = String(e?.message || e);
    }
  }

  private async toggleActive(s: Stock): Promise<void> {
    const toActive = !s.is_active;
    if (
      !toActive &&
      typeof confirm !== 'undefined' &&
      !confirm(`Deactivate ${s.code}? Its history stays in all totals.`)
    )
      return;
    try {
      await setStockActive(this.finance, s.id, toActive);
      this.dispatchEvent(
        new CustomEvent(toActive ? 'stock-activate' : 'stock-deactivate', {
          detail: { id: s.id },
          bubbles: true,
          composed: true,
        }),
      );
      await this.reload();
    } catch (e: any) {
      logger.error('stock activate/deactivate failed:', e);
      this.error = String(e?.message || e);
    }
  }

  private addDividend(s: Stock): void {
    this.dispatchEvent(
      new CustomEvent('wealthflow-navigate', {
        detail: { view: 'dividends' },
        bubbles: true,
        composed: true,
      }),
    );
    // The dividend form picks up the stock via its dropdown; stash a hint.
    try {
      sessionStorage.setItem('wealthflow.prefillStock', String(s.id));
    } catch {
      /* non-browser */
    }
  }

  override render(): unknown {
    if (typeof HTMLElement === 'undefined') return html``;
    const filters: StatusFilter[] = ['active', 'inactive', 'all'];
    return html`
      <div class="section">
        <h3>Stocks</h3>
        <div>
          ${filters.map(
            (f) =>
              html`<label
                ><input
                  type="radio"
                  name="stock-status"
                  .checked=${this.statusFilter === f}
                  @change=${() => {
                    this.statusFilter = f;
                    void this.reload();
                  }}
                />${f[0].toUpperCase() + f.slice(1)}</label
              >`,
          )}
        </div>
        ${this.error ? html`<p class="field-error">Error: ${this.error}</p>` : ''}
        ${
          this.stocks.length === 0
            ? html`<p>No holdings yet — add your first holding below.</p>`
            : html`<div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Name</th>
                      <th>Shares</th>
                      <th>FY ${this.fy}</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${this.stocks.map((s) => (this.editingId === s.id ? this.editRow(s) : this.viewRow(s)))}
                  </tbody>
                </table>
              </div>`
        }
      </div>
      <div class="section">
        <h3>Add Holding</h3>
        ${this.formError ? html`<p class="field-error">Error: ${this.formError}</p>` : ''}
        <form @submit=${this.onCreate}>
          <label
            >Code
            <input
              .value=${this.newCode}
              @input=${(e: Event) => (this.newCode = (e.target as HTMLInputElement).value.toUpperCase())}
              placeholder="VAS"
          /></label>
          <label
            >Name
            <input
              .value=${this.newName}
              @input=${(e: Event) => (this.newName = (e.target as HTMLInputElement).value)}
              placeholder="Vanguard Australian Shares"
          /></label>
          <label
            >Shares
            <input
              .value=${this.newShares}
              @input=${(e: Event) => (this.newShares = (e.target as HTMLInputElement).value)}
              inputmode="decimal"
              placeholder="120"
          /></label>
          <button class="btn-primary" type="submit">Add Holding</button>
        </form>
      </div>
    `;
  }

  private viewRow(s: Stock): unknown {
    return html`
      <tr class=${s.is_active ? '' : 'muted'}>
        <td>
          <strong>${s.code}</strong>
          ${s.is_active ? '' : html`<span class="badge">inactive</span>`}
        </td>
        <td>${s.name}</td>
        <td>${s.shares} sh</td>
        <td>
          ${formatAUD(this.gross[s.id] ?? 0)} + fr
          ${formatAUD(this.franking[s.id] ?? 0)}
        </td>
        <td>
          <button class="filter-btn" @click=${() => this.addDividend(s)}>
            Add dividend
          </button>
          <button class="filter-btn" @click=${() => this.startEdit(s)}>
            Edit
          </button>
          <button class="filter-btn" @click=${() => this.toggleActive(s)}>
            ${s.is_active ? 'Deactivate' : 'Activate'}
          </button>
        </td>
      </tr>
    `;
  }

  private editRow(s: Stock): unknown {
    return html`
      <tr>
        <td><strong>${s.code}</strong></td>
        <td>
          <input
            .value=${this.editName}
            @input=${(e: Event) => (this.editName = (e.target as HTMLInputElement).value)}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === 'Enter') void this.saveEdit(s);
              if (e.key === 'Escape') this.editingId = null;
            }}
          />
        </td>
        <td>
          <input
            .value=${this.editShares}
            @input=${(e: Event) => (this.editShares = (e.target as HTMLInputElement).value)}
            inputmode="decimal"
          />
        </td>
        <td>
          ${formatAUD(this.gross[s.id] ?? 0)} + fr
          ${formatAUD(this.franking[s.id] ?? 0)}
        </td>
        <td>
          <button class="btn-primary" @click=${() => this.saveEdit(s)}>
            Save
          </button>
          <button class="filter-btn" @click=${() => (this.editingId = null)}>
            Cancel
          </button>
        </td>
      </tr>
    `;
  }
}

if (
  typeof customElements !== 'undefined' &&
  !customElements.get('stock-list')
) {
  customElements.define(
    'stock-list',
    StockList as unknown as CustomElementConstructor,
  );
}
