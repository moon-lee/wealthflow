import { LitElement, html } from 'lit';
import { sharedStyles } from '../styles/shared-styles.js';
import { wealthflowStyles } from '../styles/wealthflow-styles.js';
import { ExtensionLogger } from 'finance-logger';
import { computeFinanceYear, isValidIsoDate } from '../utils/finance-year.js';
import { listStocks, type Stock } from '../dao/stocks.js';
import {
  DIVIDEND_TYPES,
  DIVIDEND_LABELS,
  createDividend,
  updateDividend,
  deleteDividend,
  type DividendEntry,
} from '../dao/dividends.js';

const Base =
  typeof HTMLElement !== 'undefined'
    ? LitElement
    : (class {} as unknown as typeof LitElement);
const logger = new ExtensionLogger('wealthflow');

export class DividendForm extends Base {
  static override styles =
    typeof HTMLElement !== 'undefined'
      ? ([sharedStyles, wealthflowStyles] as any)
      : [];
  finance: any = null;
  fy = '';
  stocks: Stock[] = [];
  stockId: number | null = null;
  date = '';
  type = 'non_trust';
  gross = '';
  franking = '';
  notes = '';
  editId: number | null = null;
  error = '';

  async setFinance(f: any): Promise<void> {
    this.finance = f;
    await this.reload();
  }

  async reload(): Promise<void> {
    if (!this.finance?.db) return;
    try {
      this.stocks = await listStocks(this.finance, { status: 'all' });
      try {
        const prefill = sessionStorage.getItem('wealthflow.prefillStock');
        if (prefill && this.stockId == null) this.stockId = Number(prefill);
      } catch {
        /* non-browser */
      }
      if (this.date === '') {
        const now = new Date();
        this.date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      }
    } catch (e: any) {
      this.error = String(e?.message || e);
    }
    (this as any).requestUpdate?.();
  }

  editEntry(entry: DividendEntry | null): void {
    if (!entry) {
      this.editId = null;
      this.gross = '';
      this.franking = '';
      this.notes = '';
    } else {
      this.editId = entry.id;
      this.stockId = entry.stock_id;
      this.date = entry.date;
      this.type = entry.type;
      this.gross = String(entry.gross);
      this.franking = String(entry.franking);
      this.notes = entry.notes ?? '';
    }
    (this as any).requestUpdate?.();
  }

  /** Financial year derived from the log date — stored as-is, never edited. */
  private get autoFy(): string {
    if (!isValidIsoDate(this.date)) return '';
    return computeFinanceYear(this.date, '07-01') ?? '';
  }

  private async onSubmit(e: Event): Promise<void> {
    e.preventDefault();
    this.error = '';
    const gross = Number(this.gross);
    const franking = this.franking.trim() === '' ? 0 : Number(this.franking);
    if (this.stockId == null) {
      this.error = 'Choose a stock.';
      (this as any).requestUpdate?.();
      return;
    }
    if (!isValidIsoDate(this.date)) {
      this.error = 'Date must be YYYY-MM-DD.';
      (this as any).requestUpdate?.();
      return;
    }
    if (!Number.isFinite(gross) || gross < 0) {
      this.error = 'Gross must be ≥ 0.';
      (this as any).requestUpdate?.();
      return;
    }
    if (!Number.isFinite(franking) || franking < 0) {
      this.error = 'Franking must be ≥ 0.';
      (this as any).requestUpdate?.();
      return;
    }
    const fyForSave = this.autoFy;
    try {
      if (this.editId == null) {
        const row = await createDividend(
          this.finance,
          {
            stock_id: this.stockId,
            date: this.date,
            type: this.type,
            gross,
            franking,
            finance_year: fyForSave,
            notes: this.notes.trim() === '' ? null : this.notes.trim(),
          },
          '07-01',
        );
        this.dispatchEvent(
          new CustomEvent('dividend-create', {
            detail: { entry: row },
            bubbles: true,
            composed: true,
          }),
        );
      } else {
        await updateDividend(this.finance, this.editId, {
          stock_id: this.stockId,
          date: this.date,
          type: this.type,
          gross,
          franking,
          finance_year: fyForSave,
          notes: this.notes.trim() === '' ? null : this.notes.trim(),
        });
        this.dispatchEvent(
          new CustomEvent('dividend-edit', {
            detail: { id: this.editId },
            bubbles: true,
            composed: true,
          }),
        );
      }
      this.editEntry(null);
    } catch (err: any) {
      logger.error('dividend save failed:', err);
      this.error = String(err?.message || err);
      (this as any).requestUpdate?.();
    }
  }

  private async onDelete(): Promise<void> {
    if (this.editId == null) return;
    if (
      typeof confirm !== 'undefined' &&
      !confirm('Delete this dividend receipt?')
    )
      return;
    try {
      await deleteDividend(this.finance, this.editId);
      this.dispatchEvent(
        new CustomEvent('dividend-delete', {
          detail: { id: this.editId },
          bubbles: true,
          composed: true,
        }),
      );
      this.editEntry(null);
    } catch (e: any) {
      this.error = String(e?.message || e);
      (this as any).requestUpdate?.();
    }
  }

  override render(): unknown {
    if (typeof HTMLElement === 'undefined') return html``;
    return html`
      <div class="section">
        <h3>${this.editId == null ? 'Log Dividend' : 'Edit Dividend'}</h3>
        ${this.error ? html`<p class="field-error">Error: ${this.error}</p>` : ''}
        <form @submit=${this.onSubmit}>
          <label
            >Stock
            <select
              @change=${(e: Event) => {
                this.stockId =
                  Number((e.target as HTMLSelectElement).value) || null;
                (this as any).requestUpdate?.();
              }}
            >
              <option value="">— choose —</option>
              ${this.stocks.map((s) => html`<option value=${s.id} ?selected=${this.stockId === s.id}>${s.stock_code}${s.is_active ? '' : ' (inactive)'}</option>`)}
            </select>
          </label>
          <label
            >Date
            <input
              type="date"
              .value=${this.date}
              @input=${(e: Event) => {
                this.date = (e.target as HTMLInputElement).value;
                (this as any).requestUpdate?.();
              }}
            />
          </label>
          <p class="muted">Financial year (auto): ${this.autoFy || '—'}</p>
          <label
            >Type
            <select
              @change=${(e: Event) => {
                this.type = (e.target as HTMLSelectElement).value;
                (this as any).requestUpdate?.();
              }}
            >
              ${(DIVIDEND_TYPES as readonly string[]).map((t) => html`<option value=${t} ?selected=${this.type === t}>${DIVIDEND_LABELS[t as keyof typeof DIVIDEND_LABELS]}</option>`)}
            </select>
          </label>
          <label
            >Gross (AUD)
            <input
              .value=${this.gross}
              @input=${(e: Event) => {
                this.gross = (e.target as HTMLInputElement).value;
                (this as any).requestUpdate?.();
              }}
              inputmode="decimal"
              placeholder="0.00"
            />
          </label>
          <label
            >Franking (AUD)
            <input
              .value=${this.franking}
              @input=${(e: Event) => {
                this.franking = (e.target as HTMLInputElement).value;
                (this as any).requestUpdate?.();
              }}
              inputmode="decimal"
              placeholder="0.00"
            />
          </label>
          <label
            >Notes
            <input
              .value=${this.notes}
              @input=${(e: Event) => {
                this.notes = (e.target as HTMLInputElement).value;
                (this as any).requestUpdate?.();
              }}
          /></label>
          <button class="btn-primary" type="submit">
            ${this.editId == null ? 'Log Dividend' : 'Save'}
          </button>
          ${
            this.editId != null
              ? html`<button
                    class="filter-btn"
                    type="button"
                    @click=${() => this.editEntry(null)}
                  >
                    Cancel
                  </button>
                  <button
                    class="filter-btn"
                    type="button"
                    @click=${() => this.onDelete()}
                  >
                    Delete
                  </button>`
              : ''
          }
        </form>
      </div>
    `;
  }
}

if (
  typeof customElements !== 'undefined' &&
  !customElements.get('dividend-form')
) {
  customElements.define(
    'dividend-form',
    DividendForm as unknown as CustomElementConstructor,
  );
}
