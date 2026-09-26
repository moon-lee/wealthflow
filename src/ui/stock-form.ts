import { LitElement, html } from 'lit';
import { sharedStyles } from '../styles/shared-styles.js';
import { wealthflowStyles } from '../styles/wealthflow-styles.js';
import { ExtensionLogger } from 'finance-logger';
import { createStock } from '../dao/stocks.js';

const Base =
  typeof HTMLElement !== 'undefined'
    ? LitElement
    : (class {} as unknown as typeof LitElement);
const logger = new ExtensionLogger('wealthflow');

export class StockForm extends Base {
  static override styles =
    typeof HTMLElement !== 'undefined'
      ? ([sharedStyles, wealthflowStyles] as any)
      : [];
  finance: any = null;
  stockCode = '';
  stockName = '';
  shares = '';
  notes = '';
  error = '';
  saving = false;

  async setFinance(f: any): Promise<void> {
    this.finance = f;
  }

  private get codeError(): string | null {
    return this.stockCode.trim() === '' ? 'Code is required.' : null;
  }

  private get nameError(): string | null {
    return this.stockName.trim() === '' ? 'Name is required.' : null;
  }

  private get sharesError(): string | null {
    const text = this.shares.trim();
    if (text === '') return 'Shares are required.';
    const n = Number(text);
    return Number.isFinite(n) && n >= 0 ? null : 'Shares must be ≥ 0.';
  }

  private get canSave(): boolean {
    return (
      this.codeError === null &&
      this.nameError === null &&
      this.sharesError === null &&
      !this.saving
    );
  }

  private async onSubmit(e: Event): Promise<void> {
    e.preventDefault();
    this.error = '';
    if (!this.canSave) {
      this.error = this.codeError ?? this.nameError ?? this.sharesError ?? '';
      (this as any).requestUpdate?.();
      return;
    }
    this.saving = true;
    (this as any).requestUpdate?.();
    try {
      const row = await createStock(this.finance, {
        stock_code: this.stockCode.trim(),
        stock_full_name: this.stockName.trim(),
        shares: Number(this.shares.trim()),
        notes: this.notes.trim() === '' ? null : this.notes.trim(),
      });
      this.dispatchEvent(
        new CustomEvent('stock-create', {
          detail: { stock: row },
          bubbles: true,
          composed: true,
        }),
      );
      this.stockCode = '';
      this.stockName = '';
      this.shares = '';
      this.notes = '';
    } catch (err: any) {
      logger.error('stock create failed:', err);
      this.error = String(err?.message || err);
    } finally {
      this.saving = false;
      (this as any).requestUpdate?.();
    }
  }

  override render(): unknown {
    if (typeof HTMLElement === 'undefined') return html``;
    return html`
      <div class="section flush">
        <div class="section-header">
          <h3 class="section-title">Add Holding</h3>
          <div class="header-actions">
            <span class="muted"><em class="req">*</em> required</span>
            <button
              class="btn btn-primary btn-small"
              type="submit"
              form="stock-add-form"
              ?disabled=${!this.canSave}
            >
              ${this.saving ? 'Adding…' : 'Add Holding'}
            </button>
          </div>
        </div>
        <div class="section-body">
          ${
            this.error
              ? html`<p class="field-error" role="alert">
                  Error: ${this.error}
                </p>`
              : ''
          }
          <form id="stock-add-form" @submit=${this.onSubmit}>
            <div class="field-grid cols-3">
              <label class="field"
                ><span>Code<em class="req">*</em></span>
                <input
                  aria-label="Code"
                  .value=${this.stockCode}
                  @input=${(e: Event) => {
                    this.stockCode = (e.target as HTMLInputElement).value;
                    (this as any).requestUpdate?.();
                  }}
                  placeholder="VAS"
                />
                ${
                  this.codeError
                    ? html`<p class="field-error">${this.codeError}</p>`
                    : ''
                }
              </label>
              <label class="field"
                ><span>Name<em class="req">*</em></span>
                <input
                  aria-label="Name"
                  .value=${this.stockName}
                  @input=${(e: Event) => {
                    this.stockName = (e.target as HTMLInputElement).value;
                    (this as any).requestUpdate?.();
                  }}
                  placeholder="Vanguard Australian Shares"
                />
                ${
                  this.nameError
                    ? html`<p class="field-error">${this.nameError}</p>`
                    : ''
                }
              </label>
              <label class="field"
                ><span>Shares<em class="req">*</em></span>
                <input
                  aria-label="Shares"
                  inputmode="decimal"
                  .value=${this.shares}
                  @input=${(e: Event) => {
                    this.shares = (e.target as HTMLInputElement).value;
                    (this as any).requestUpdate?.();
                  }}
                  placeholder="120"
                />
                ${
                  this.sharesError
                    ? html`<p class="field-error">${this.sharesError}</p>`
                    : ''
                }
              </label>
              <label class="field field-wide"
                ><span>Notes</span>
                <input
                  aria-label="Notes"
                  .value=${this.notes}
                  @input=${(e: Event) => {
                    this.notes = (e.target as HTMLInputElement).value;
                    (this as any).requestUpdate?.();
                  }}
                  placeholder="Optional"
              /></label>
            </div>
          </form>
        </div>
      </div>
    `;
  }
}

if (
  typeof customElements !== 'undefined' &&
  !customElements.get('stock-form')
) {
  customElements.define(
    'stock-form',
    StockForm as unknown as CustomElementConstructor,
  );
}
