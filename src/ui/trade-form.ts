import { LitElement, html } from 'lit';
import { sharedStyles } from '../styles/shared-styles.js';
import { wealthflowStyles } from '../styles/wealthflow-styles.js';
import type { Trade } from '../dao/trades.js';
import { recordTrade, amendTrade } from '../services/holding-service.js';
import { previewSell, type Allocation } from '../services/trade-service.js';
import { formatAUD } from '../utils/format.js';
import { localTodayIso } from '../utils/dates.js';

const Base =
  typeof HTMLElement !== 'undefined'
    ? LitElement
    : (class {} as unknown as typeof LitElement);

function qty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(4);
}

/**
 * Buy/sell form with a live allocation preview.
 *
 * The preview is why the section exists: on the Sell state, FIFO and the tax
 * consequence appear BELOW the fields, before anything is saved. Selling costs
 * brokerage in the UI rather than accepting it and dropping it, because selling
 * costs are capital costs that reduce the gain separately from cost base.
 */
export class TradeForm extends Base {
  static override styles =
    typeof HTMLElement !== 'undefined'
      ? ([sharedStyles, wealthflowStyles] as any)
      : [];
  finance: any = null;
  error = '';
  stocks: { id: number; stock_code: string; stock_full_name: string }[] = [];
  editId: number | null = null;
  side: 'buy' | 'sell' = 'buy';
  stockId = 0;
  date = '';
  quantity = '';
  price = '';
  brokerage = '';
  /** Live FIFO preview, recomputed on every change while side === 'sell'. */
  allocation: Allocation[] = [];
  /** True while a save is in flight, so one click cannot write two rows. */
  saving = false;

  async setFinance(f: any): Promise<void> {
    this.finance = f;
    await this.loadStocks();
    if (!this.date) this.date = localTodayIso();
    (this as any).requestUpdate?.();
  }

  private async loadStocks(): Promise<void> {
    if (!this.finance) return;
    const { listStocks } = await import('../dao/stocks.js');
    this.stocks = await listStocks(this.finance, { status: 'all' });
    if (!this.stockId && this.stocks.length) this.stockId = this.stocks[0].id;
    await this.refreshPreview();
    (this as any).requestUpdate?.();
  }

  /**
   * Recompute the preview. Errors are shown, not thrown: a sell of more than
   * is held must explain itself in the form, not vanish into a rejected
   * promise the user cannot see.
   */
  async refreshPreview(): Promise<void> {
    this.allocation = [];
    if (this.side !== 'sell' || !this.finance) return;
    const qty = Number(this.quantity);
    if (!Number.isFinite(qty) || qty <= 0) return;
    try {
      const { listParcels } = await import('../dao/parcels.js');
      const parcels = await listParcels(this.finance, {
        stockId: this.stockId,
      });
      this.allocation = previewSell(parcels, qty, Number(this.price) || 0);
      this.previewError = '';
    } catch (err: any) {
      this.allocation = [];
      this.previewError = String(err?.message || err);
    }
    (this as any).requestUpdate?.();
  }

  previewError = '';

  private get previewNet(): number {
    return this.allocation.reduce((s, r) => s + r.netGain, 0);
  }

  editTrade(t: Trade | null): void {
    this.editId = t?.id ?? null;
    this.side = t?.side ?? 'buy';
    // Ensure stocks loaded
    if (!this.stocks.length && this.finance) {
      void this.loadStocks().then(() => {
        this.stockId =
          t?.stock_id ?? (this.stocks.length ? this.stocks[0].id : 0);
        this.date = t?.date ?? localTodayIso();
        this.quantity = t ? String(t.quantity) : '';
        this.price = t ? String(t.price) : '';
        this.brokerage = t ? String(t.brokerage) : '';
        this.error = '';
        this.previewError = '';
        this.allocation = [];
        this.saving = false;
        if (this.side === 'sell') this.brokerage = '';
        void this.refreshPreview();
        (this as any).requestUpdate?.();
      });
      return;
    }
    this.stockId =
      t?.stock_id ?? (this.stocks.length ? this.stocks[0].id : this.stockId);
    // A new trade is almost always today's, so the field starts filled.
    this.date = t?.date ?? localTodayIso();
    this.quantity = t ? String(t.quantity) : '';
    this.price = t ? String(t.price) : '';
    this.brokerage = t ? String(t.brokerage) : '';
    this.error = '';
    this.previewError = '';
    this.allocation = [];
    this.saving = false;
    if (this.side === 'sell') this.brokerage = '';
    void this.refreshPreview();
    (this as any).requestUpdate?.();
  }

  private setSide(side: 'buy' | 'sell'): void {
    this.side = side;
    // A sell has no acquisition brokerage; carrying the buy's figure across
    // would suggest otherwise.
    if (side === 'sell') this.brokerage = '';
    void this.refreshPreview();
    (this as any).requestUpdate?.();
  }

  private async onSubmit(e: Event): Promise<void> {
    e?.preventDefault?.();
    if (!this.finance || this.saving) return;
    this.saving = true;
    this.error = '';
    (this as any).requestUpdate?.();
    const input = {
      stock_id: this.stockId,
      date: this.date,
      side: this.side,
      quantity: Number(this.quantity),
      price: Number(this.price),
      brokerage: this.brokerage === '' ? 0 : Number(this.brokerage),
    };
    try {
      // Refuse BEFORE writing, so a history that cannot balance never lands.
      await this.assertWouldBalance();
      if (this.editId == null) {
        await recordTrade(this.finance, input);
        this.dispatchEvent(
          new CustomEvent('trade-create', {
            detail: input,
            bubbles: true,
            composed: true,
          }),
        );
      } else {
        await amendTrade(this.finance, this.editId, input);
        this.dispatchEvent(
          new CustomEvent('trade-edit', {
            detail: input,
            bubbles: true,
            composed: true,
          }),
        );
      }
      this.editTrade(null);
    } catch (err: any) {
      // Never swallow it: the whole point of a ledger is that a figure you
      // typed is either stored or visibly refused.
      this.error = String(err?.message || err);
    } finally {
      // A second click while this one is in flight would write the row twice.
      this.saving = false;
      (this as any).requestUpdate?.();
    }
  }

  private async assertWouldBalance(): Promise<void> {
    if (this.side !== 'sell') return;
    const { listParcels } = await import('../dao/parcels.js');
    const parcels = await listParcels(this.finance, { stockId: this.stockId });
    previewSell(parcels, Number(this.quantity), Number(this.price) || 0);
  }

  /** What a buy will cost, before it is saved. Brokerage is part of the cost. */
  get buyTotal(): number {
    const q = Number(this.quantity) || 0;
    const p = Number(this.price) || 0;
    const b = Number(this.brokerage) || 0;
    return q * p + b;
  }

  private onInput(field: string, value: string | number): void {
    (this as any)[field] = value;
    // The message was about the value that has just been replaced.
    if (this.error) this.error = '';
    // A sell's tax preview is the reason to look at this form; a quantity that
    // never moves it makes it look broken.
    if (
      this.side === 'sell' &&
      (field === 'quantity' || field === 'price' || field === 'stockId')
    )
      void this.refreshPreview();
    (this as any).requestUpdate?.();
  }

  private onStockChange(e: Event): void {
    this.onInput('stockId', Number((e.target as HTMLSelectElement).value));
  }

  /**
   * The Save button says what it is doing. `saving` also disables it, so one
   * click cannot write two ledger rows.
   */
  private get saveLabel(): string {
    if (this.saving) return 'Saving…';
    return this.editId == null ? 'Save' : 'Save changes';
  }

  /** Clearing a blank form is "Clear"; abandoning an edit is not. */
  private get resetLabel(): string {
    return this.editId == null ? 'Clear' : 'Cancel edit';
  }

  override render(): unknown {
    if (typeof HTMLElement === 'undefined') return html``;
    return html`
      <form class="section flush" @submit=${(e: Event) => this.onSubmit(e)}>
        <div class="section-header">
          <div class="segment" role="tablist" aria-label="Trade side">
            <button
              type="button"
              role="tab"
              class="filter-btn ${this.side === 'buy' ? 'active' : ''}"
              aria-selected=${this.side === 'buy'}
              @click=${() => this.setSide('buy')}
            >
              Buy
            </button>
            <button
              type="button"
              role="tab"
              class="filter-btn ${this.side === 'sell' ? 'active' : ''}"
              aria-selected=${this.side === 'sell'}
              @click=${() => this.setSide('sell')}
            >
              Sell
            </button>
          </div>
          <h3 class="section-title">
            ${
              this.editId == null
                ? `Log ${this.side}`
                : `Edit ${this.side} #${this.editId}`
            }
          </h3>
          <div class="header-actions">
            <button
              class="btn btn-secondary btn-small"
              type="submit"
              ?disabled=${this.saving}
            >
              ${this.saveLabel}
            </button>
            <button
              class="btn btn-secondary btn-small"
              type="button"
              @click=${() => this.editTrade(null)}
            >
              ${this.resetLabel}
            </button>
          </div>
        </div>
        <div class="section-body">
          ${
            this.error
              ? html`<p class="field-error">Error: ${this.error}</p>`
              : ''
          }
          <div class="stat-grid trade-form-grid">
            <label>
              <span>Date</span>
              <input
                type="date"
                required
                .value=${this.date}
                @input=${(e: Event) => this.onInput('date', (e.target as HTMLInputElement).value)}
              />
            </label>
            <label>
              <span>Stock</span>
              <select @change=${(e: Event) => this.onStockChange(e)}>
                ${this.stocks.map(
                  (s) =>
                    html`<option
                      value=${s.id}
                      ?selected=${s.id === this.stockId}
                    >
                      ${s.stock_code}
                    </option>`,
                )}
              </select>
            </label>
            <label>
              <span>Quantity</span>
              <input
                type="number"
                inputmode="decimal"
                step="any"
                min="0"
                required
                placeholder="0"
                .value=${this.quantity}
                @input=${(e: Event) => this.onInput('quantity', (e.target as HTMLInputElement).value)}
              />
            </label>
            <label>
              <span>Price</span>
              <input
                type="number"
                inputmode="decimal"
                step="any"
                min="0"
                required
                placeholder="0.000"
                .value=${this.price}
                @input=${(e: Event) => this.onInput('price', (e.target as HTMLInputElement).value)}
              />
            </label>
            <div>
              <label>
                <span>Brokerage</span>
                <input
                  type="number"
                  inputmode="decimal"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  ?readonly=${this.side === 'sell'}
                  .value=${this.brokerage}
                  @input=${(e: Event) => this.onInput('brokerage', (e.target as HTMLInputElement).value)}
                />
              </label>
              ${
                this.side === 'sell'
                  ? html`<p class="muted trade-form-hint">
                      Selling costs aren't part of cost base, so this field is
                      closed.
                    </p>`
                  : ''
              }
            </div>
          </div>

          ${
            this.side === 'buy' && (this.quantity !== '' || this.price !== '')
              ? html`<div class="trade-form-total">
                  <span class="muted">Total cost</span>
                  <strong>${formatAUD(this.buyTotal)}</strong>
                </div>`
              : ''
          }
          ${this.side === 'sell' ? this.renderPreview() : ''}
        </div>
      </form>
    `;
  }

  private renderPreview(): unknown {
    return html`
      <div class="section-body portfolio-preview">
        <div class="section-title">FIFO allocation preview</div>
        ${
          this.previewError
            ? html`<p class="field-error">${this.previewError}</p>`
            : this.allocation.length === 0
              ? html`<p class="muted">
                  Enter a quantity to see which parcels a sale would take and
                  what it costs in tax — before you save it.
                </p>`
              : html`
                  <table class="hist-table">
                    <thead>
                      <tr>
                        <th scope="col">Parcel</th>
                        <th scope="col" class="num">Taken</th>
                        <th scope="col">Acquired</th>
                        <th scope="col" class="num">Held</th>
                        <th scope="col">Discount</th>
                        <th scope="col" class="num">Cost base</th>
                        <th scope="col" class="num">Proceeds</th>
                        <th scope="col" class="num">Nominal</th>
                        <th scope="col" class="num">After discount</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${this.allocation.map(
                        (r) =>
                          html`<tr>
                            <td>
                              ${r.parcel.acquired_date}
                              #${r.parcel.origin_trade_id}
                            </td>
                            <td class="num">${qty(r.quantity)}</td>
                            <td>${r.parcel.acquired_date}</td>
                            <td class="num">${r.heldMonths}</td>
                            <td class=${r.eligible ? 'ok' : 'pending'}>
                              ${r.eligible ? '50% applies' : 'No — under 12 months'}
                            </td>
                            <td class="num">${formatAUD(r.costBase)}</td>
                            <td class="num">${formatAUD(r.proceeds)}</td>
                            <td class="num ${r.nominalGain < 0 ? 'neg' : ''}">
                              ${formatAUD(r.nominalGain)}
                            </td>
                            <td class="num ${r.netGain < 0 ? 'neg' : 'ok'}">
                              ${formatAUD(r.netGain)}
                            </td>
                          </tr>`,
                      )}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colspan="6" class="num">Total</td>
                        <td class="num"></td>
                        <td class="num"></td>
                        <td class="num ok">${formatAUD(this.previewNet)}</td>
                      </tr>
                    </tfoot>
                  </table>
                  <p class="muted">
                    Only parcels held 12 months or more are discounted, and
                    losses are offset against gains before that. Oldest first —
                    the top row is what the sale takes first.
                  </p>
                `
        }
      </div>
    `;
  }
}

if (
  typeof customElements !== 'undefined' &&
  !customElements.get('trade-form')
) {
  customElements.define(
    'trade-form',
    TradeForm as unknown as CustomElementConstructor,
  );
}
