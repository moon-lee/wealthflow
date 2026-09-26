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

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * One form for both jobs: an empty one logs a receipt, a pre-filled one edits
 * an existing receipt. The host section owns the toggle, so this element never
 * renders its own show/hide chrome.
 */
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
  saving = false;
  touched = false;

  async setFinance(f: any): Promise<void> {
    this.finance = f;
    await this.reload();
  }

  async reload(): Promise<void> {
    if (!this.finance?.db) return;
    try {
      this.stocks = await listStocks(this.finance, { status: 'all' });
      if (this.date === '') this.date = today();
    } catch (e: any) {
      this.error = String(e?.message || e);
    }
    (this as any).requestUpdate?.();
  }

  /* Per-field validation: the message renders under the offending control
     instead of one lumped error above the form. */
  private get stockError(): string | null {
    return this.stockId == null ? 'Choose a stock.' : null;
  }

  private get dateError(): string | null {
    return isValidIsoDate(this.date) ? null : 'Date must be YYYY-MM-DD.';
  }

  private get grossError(): string | null {
    const text = this.gross.trim();
    if (text === '') return 'Gross is required.';
    const n = Number(text);
    return Number.isFinite(n) && n >= 0 ? null : 'Gross must be ≥ 0.';
  }

  private get frankingError(): string | null {
    const text = this.franking.trim();
    if (text === '') return null;
    const n = Number(text);
    return Number.isFinite(n) && n >= 0 ? null : 'Franking must be ≥ 0.';
  }

  private get canSave(): boolean {
    return (
      this.stockError === null &&
      this.dateError === null &&
      this.grossError === null &&
      this.frankingError === null &&
      !this.saving
    );
  }

  /** Financial year derived from the log date — stored as-is, never edited. */
  private get autoFy(): string {
    if (!isValidIsoDate(this.date)) return '';
    return computeFinanceYear(this.date, '07-01') ?? '';
  }

  /** Errors stay hidden until a field is touched, so a freshly opened form is calm. */
  private errorFor(e: string | null): string | null {
    return e !== null && this.touched ? e : null;
  }

  /** Load an existing receipt for correction; pass null for create mode. */
  editEntry(entry: DividendEntry | null): void {
    this.editId = entry?.id ?? null;
    this.stockId = entry ? entry.stock_id : null;
    this.date = entry ? entry.date : this.date || today();
    this.type = entry ? entry.type : this.type;
    this.gross = entry ? String(entry.gross) : '';
    this.franking = entry ? String(entry.franking ?? 0) : '';
    this.notes = entry ? (entry.notes ?? '') : '';
    this.touched = false;
    this.error = '';
    (this as any).requestUpdate?.();
    void this.focusFirst();
  }

  private async focusFirst(): Promise<void> {
    try {
      await (this as any).updateComplete;
    } catch {
      /* non-Lit */
    }
    const root = (this as any).renderRoot as ShadowRoot | undefined;
    root?.querySelector<HTMLSelectElement>('select')?.focus();
  }

  /** The host section owns the toggle, so closing is a request, not a state. */
  private closeForm(): void {
    this.dispatchEvent(
      new CustomEvent('dividend-form-close', { bubbles: true, composed: true }),
    );
  }

  /** Cancel is a close: drop the edit and fold the form away. */
  private cancel(): void {
    this.editEntry(null);
    this.closeForm();
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.cancel();
    }
  }

  private async onSubmit(e: Event): Promise<void> {
    e.preventDefault();
    this.error = '';
    this.touched = true;
    if (!this.canSave) {
      (this as any).requestUpdate?.();
      return;
    }
    const payload = {
      stock_id: this.stockId as number,
      date: this.date,
      type: this.type,
      gross: Number(this.gross.trim()),
      franking: this.franking.trim() === '' ? 0 : Number(this.franking.trim()),
      finance_year: this.autoFy,
      notes: this.notes.trim() === '' ? null : this.notes.trim(),
    };
    this.saving = true;
    (this as any).requestUpdate?.();
    let saved = false;
    try {
      if (this.editId == null) {
        const row = await createDividend(this.finance, payload, '07-01');
        this.dispatchEvent(
          new CustomEvent('dividend-create', {
            detail: { entry: row },
            bubbles: true,
            composed: true,
          }),
        );
      } else {
        await updateDividend(this.finance, this.editId, payload);
        this.dispatchEvent(
          new CustomEvent('dividend-edit', {
            detail: { id: this.editId },
            bubbles: true,
            composed: true,
          }),
        );
      }
      saved = true;
      this.editEntry(null);
    } catch (err: any) {
      logger.error('dividend save failed:', err);
      this.error = String(err?.message || err);
      (this as any).requestUpdate?.();
    } finally {
      this.saving = false;
      (this as any).requestUpdate?.();
    }
    if (saved) {
      // Saved: fold the form away so the log is the thing you look at next.
      await this.reload();
      this.closeForm();
    }
  }

  private async onDelete(): Promise<void> {
    if (this.editId == null) return;
    if (
      typeof confirm !== 'undefined' &&
      !confirm('Delete this dividend receipt?')
    )
      return;
    const id = this.editId;
    try {
      await deleteDividend(this.finance, id);
      this.dispatchEvent(
        new CustomEvent('dividend-delete', {
          detail: { id },
          bubbles: true,
          composed: true,
        }),
      );
      this.editEntry(null);
      this.closeForm();
    } catch (e: any) {
      this.error = String(e?.message || e);
      (this as any).requestUpdate?.();
    }
  }

  override render(): unknown {
    if (typeof HTMLElement === 'undefined') return html``;
    const editing = this.editId != null;
    return html`
      <div class="section flush">
        <div class="section-header">
          <h3 class="section-title">
            ${editing ? 'Edit Dividend' : 'Log Dividend'}
          </h3>
          <div class="header-actions">
            <span class="muted">FY ${this.autoFy || '—'} · auto</span>
            <span class="muted"><em class="req">*</em> required</span>
            <button
              class="btn btn-primary btn-small"
              type="submit"
              form="dividend-entry-form"
              ?disabled=${!this.canSave}
            >
              ${this.saving ? 'Saving…' : editing ? 'Save' : 'Add'}
            </button>
            ${
              editing
                ? html`<button
                      class="btn btn-secondary btn-small"
                      type="button"
                      @click=${() => this.cancel()}
                    >
                      Cancel
                    </button>
                    <button
                      class="btn btn-secondary btn-small"
                      type="button"
                      @click=${() => this.onDelete()}
                    >
                      Delete
                    </button>`
                : ''
            }
          </div>
        </div>
        <div class="section-body">
          ${
            this.error
              ? html`<p class="field-error" role="alert" aria-live="polite">
                  Error: ${this.error}
                </p>`
              : ''
          }
          <form
            id="dividend-entry-form"
            @submit=${this.onSubmit}
            @keydown=${this.onKeyDown}
          >
            <div class="field-grid">
              <label class="field"
                ><span>Stock<em class="req">*</em></span>
                <select
                  aria-label="Stock"
                  .value=${this.stockId == null ? '' : String(this.stockId)}
                  @change=${(e: Event) => {
                    const v = (e.target as HTMLSelectElement).value;
                    this.stockId = v === '' ? null : Number(v);
                    this.touched = true;
                    (this as any).requestUpdate?.();
                  }}
                  required
                >
                  <option value="">— choose —</option>
                  ${this.stocks.map(
                    (s) =>
                      html`<option value=${s.id}>
                        ${s.stock_code}${s.is_active ? '' : ' (inactive)'}
                      </option>`,
                  )}
                </select>
                ${
                  this.errorFor(this.stockError)
                    ? html`<p class="field-error">${this.stockError}</p>`
                    : ''
                }
              </label>
              <label class="field"
                ><span>Date<em class="req">*</em></span>
                <input
                  type="date"
                  aria-label="Date"
                  .value=${this.date}
                  @input=${(e: Event) => {
                    this.date = (e.target as HTMLInputElement).value;
                    this.touched = true;
                    (this as any).requestUpdate?.();
                  }}
                  required
                />
                ${
                  this.errorFor(this.dateError)
                    ? html`<p class="field-error">${this.dateError}</p>`
                    : ''
                }
              </label>
              <label class="field"
                ><span>Type<em class="req">*</em></span>
                <select
                  aria-label="Type"
                  .value=${this.type}
                  @change=${(e: Event) => {
                    this.type = (e.target as HTMLSelectElement).value;
                    this.touched = true;
                    (this as any).requestUpdate?.();
                  }}
                  required
                >
                  ${DIVIDEND_TYPES.map(
                    (t) =>
                      html`<option value=${t}>${DIVIDEND_LABELS[t]}</option>`,
                  )}
                </select>
              </label>
              <label class="field"
                ><span>Gross<em class="req">*</em></span>
                <input
                  aria-label="Gross"
                  inputmode="decimal"
                  .value=${this.gross}
                  @input=${(e: Event) => {
                    this.gross = (e.target as HTMLInputElement).value;
                    this.touched = true;
                    (this as any).requestUpdate?.();
                  }}
                  placeholder="0.00"
                  required
                />
                ${
                  this.errorFor(this.grossError)
                    ? html`<p class="field-error">${this.grossError}</p>`
                    : ''
                }
              </label>
              <label class="field"
                ><span>Franking</span>
                <input
                  aria-label="Franking"
                  inputmode="decimal"
                  .value=${this.franking}
                  @input=${(e: Event) => {
                    this.franking = (e.target as HTMLInputElement).value;
                    this.touched = true;
                    (this as any).requestUpdate?.();
                  }}
                  placeholder="0.00"
                />
                ${
                  this.errorFor(this.frankingError)
                    ? html`<p class="field-error">${this.frankingError}</p>`
                    : ''
                }
              </label>
              <label class="field span-3"
                ><span>Notes</span>
                <input
                  aria-label="Notes"
                  .value=${this.notes}
                  @input=${(e: Event) => {
                    this.notes = (e.target as HTMLInputElement).value;
                    this.touched = true;
                    (this as any).requestUpdate?.();
                  }}
                  placeholder="Optional"
                />
              </label>
            </div>
          </form>
        </div>
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
