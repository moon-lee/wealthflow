import { LitElement, html } from 'lit';
import { sharedStyles } from '../styles/shared-styles.js';
import { wealthflowStyles } from '../styles/wealthflow-styles.js';
import type { Trade } from '../dao/trades.js';
import { createTrade, updateTrade } from '../dao/trades.js';

const Base =
  typeof HTMLElement !== 'undefined'
    ? LitElement
    : (class {} as unknown as typeof LitElement);

/**
 * Buy form. Phase 1 is deliberately buy-only: a sell recorded without the
 * allocation machinery would leave `shares` derived from an un-reduced parcel
 * total, which is wrong. The Sell side arrives in Phase 2.
 *
 * Field values live as public properties so the submit path is testable
 * without driving inputs — the same shape `dividend-form` uses.
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
  stockId = 0;
  date = '';
  quantity = '';
  price = '';
  brokerage = '';

  async setFinance(f: any): Promise<void> {
    this.finance = f;
    await this.loadStocks();
  }

  private async loadStocks(): Promise<void> {
    if (!this.finance) return;
    const { listStocks } = await import('../dao/stocks.js');
    this.stocks = await listStocks(this.finance, { status: 'all' });
    if (!this.stockId && this.stocks.length) this.stockId = this.stocks[0].id;
    (this as any).requestUpdate?.();
  }

  editTrade(t: Trade | null): void {
    this.editId = t?.id ?? null;
    this.stockId = t?.stock_id ?? this.stockId;
    this.date = t?.date ?? '';
    this.quantity = t ? String(t.quantity) : '';
    this.price = t ? String(t.price) : '';
    this.brokerage = t ? String(t.brokerage) : '';
    this.error = '';
    (this as any).requestUpdate?.();
  }

  private async onSubmit(e: Event): Promise<void> {
    e?.preventDefault?.();
    if (!this.finance) return;
    this.error = '';
    const input = {
      stock_id: this.stockId,
      date: this.date,
      side: 'buy' as const,
      quantity: Number(this.quantity),
      price: Number(this.price),
      brokerage: this.brokerage === '' ? 0 : Number(this.brokerage),
    };
    try {
      if (this.editId == null) {
        await createTrade(this.finance, input);
        this.dispatchEvent(
          new CustomEvent('trade-create', {
            detail: input,
            bubbles: true,
            composed: true,
          }),
        );
      } else {
        await updateTrade(this.finance, this.editId, input);
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
      (this as any).requestUpdate?.();
    }
  }

  private onInput(field: string, value: string | number): void {
    (this as any)[field] = value;
    (this as any).requestUpdate?.();
  }

  override render(): unknown {
    if (typeof HTMLElement === 'undefined') return html``;
    return html`
      <form class="section flush" @submit=${(e: Event) => this.onSubmit(e)}>
        <div class="section-header">
          <h3 class="section-title">
            ${this.editId == null ? 'Log buy' : `Edit buy #${this.editId}`}
          </h3>
          <div class="header-actions">
            <button class="btn btn-secondary btn-small" type="submit">
              Save
            </button>
            <button
              class="btn btn-secondary btn-small"
              type="button"
              @click=${() => this.editTrade(null)}
            >
              Hide form
            </button>
          </div>
        </div>
        <div class="section-body">
          ${
            this.error
              ? html`<p class="field-error">Error: ${this.error}</p>`
              : ''
          }
          <div class="stat-grid cols-4">
            <div>
              <div class="stat-label">Date</div>
              <input
                type="date"
                .value=${this.date}
                @input=${(e: Event) =>
                  this.onInput('date', (e.target as HTMLInputElement).value)}
              />
            </div>
            <div>
              <div class="stat-label">Stock</div>
              <select
                @change=${(e: Event) =>
                  this.onInput(
                    'stockId',
                    Number((e.target as HTMLSelectElement).value),
                  )}
              >
                ${this.stocks.map(
                  (s) =>
                    html`<option
                      value=${s.id}
                      ?selected=${s.id === this.stockId}
                    >
                      ${s.stock_code} — ${s.stock_full_name}
                    </option>`,
                )}
              </select>
            </div>
            <div>
              <div class="stat-label">Quantity</div>
              <input
                inputmode="decimal"
                .value=${this.quantity}
                @input=${(e: Event) =>
                  this.onInput(
                    'quantity',
                    (e.target as HTMLInputElement).value,
                  )}
              />
            </div>
            <div>
              <div class="stat-label">Price</div>
              <input
                inputmode="decimal"
                .value=${this.price}
                @input=${(e: Event) =>
                  this.onInput('price', (e.target as HTMLInputElement).value)}
              />
            </div>
            <div>
              <div class="stat-label">Brokerage</div>
              <input
                inputmode="decimal"
                .value=${this.brokerage}
                @input=${(e: Event) =>
                  this.onInput(
                    'brokerage',
                    (e.target as HTMLInputElement).value,
                  )}
              />
            </div>
          </div>
        </div>
      </form>
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
