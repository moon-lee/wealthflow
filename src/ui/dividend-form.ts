import { LitElement, html } from 'lit';
import { sharedStyles } from '../styles/shared-styles.js';
import { wealthflowStyles } from '../styles/wealthflow-styles.js';
import { ExtensionLogger } from 'finance-logger';
import { computeFinanceYear, isValidIsoDate } from '../utils/finance-year.js';
import { listStocks, type Stock } from '../dao/stocks.js';
import {
  DIVIDEND_TYPES,
  DIVIDEND_LABELS,
  type DividendEntry,
} from '../dao/dividends.js';
import {
  createAdjustment,
  totalAdjustment,
} from '../dao/cost-base-adjustments.js';
import {
  logDividendWithDrp,
  deleteDividendWithDrp,
} from '../services/drp-service.js';

const Base =
  typeof HTMLElement !== 'undefined'
    ? LitElement
    : (class {} as unknown as typeof LitElement);
const logger = new ExtensionLogger('wealthflow');

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** 6dp: a DRP price per unit carries fractional-unit precision, and rounding
 *  it to cents would move the cost base of the resulting parcel. */
function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/** Adjustment amounts are shown at 4dp, not 2dp (spec 9.1). */
function formatAdjustment(n: number): string {
  return n.toFixed(4);
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

  /* --- DRP (spec 6.4 / 7.5) -----------------------------------------------
     Two fields and a checkbox, not a separate form. A DRP is a buy: the money
     and the units both come from the dividend line, so they belong where that
     line is already being entered. */
  drpEnabled = false;
  amountReinvested = '';
  unitsAcquired = '';

  /** AMIT cost base adjustment printed on the distribution line of the annual
   *  tax statement (spec 7.5). Blank is "not recorded"; 0 is a real answer. */
  amitAdjustment = '';
  /** The fund's signed running total, shown at 4dp — the headline figure, not
   *  a per-parcel share. See spec 9.1. */
  fundAdjustment = 0;

  /** Non-error feedback: a DRP that bought nothing, or a coupled write that
   *  succeeded. Distinct from `error`, which blocks the form. */
  notice = '';

  async setFinance(f: any): Promise<void> {
    this.finance = f;
    await this.reload();
  }

  async reload(): Promise<void> {
    if (!this.finance?.db) return;
    try {
      this.stocks = await listStocks(this.finance, { status: 'all' });
      if (this.date === '') this.date = today();
      // The running total belongs to the SELECTED fund, not to whichever
      // receipt is open for edit — otherwise the number moves when you switch
      // between receipts of different stocks.
      const stockId = this.stockId;
      this.fundAdjustment =
        stockId == null ? 0 : await totalAdjustment(this.finance, stockId);
    } catch (e: any) {
      this.error = String(e?.message || e);
    }
    (this as any).requestUpdate?.();
  }

  /** The DRP price per unit. Derived, never typed: it is a consequence of the
   *  money and the units, and a hand-typed copy would eventually disagree with
   *  them. Null when there is nothing to derive it from. */
  get drpPrice(): number | null {
    const money = Number(this.amountReinvested);
    const units = Number(this.unitsAcquired);
    if (!Number.isFinite(money) || !Number.isFinite(units)) return null;
    if (units <= 0) return null;
    if (!Number.isFinite(money) || money <= 0) return null;
    return round6(money / units);
  }

  /** The exact string rendered for the derived price. Exposed so the
   *  precision decision is assertable without scraping shadow DOM. */
  get drpPriceLabel(): string {
    return this.drpPrice === null ? '—' : this.drpPrice.toFixed(6);
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

  private get drpError(): string | null {
    if (!this.drpEnabled) return null;
    const money =
      this.amountReinvested.trim() === '' ? 0 : Number(this.amountReinvested);
    const units =
      this.unitsAcquired.trim() === '' ? 0 : Number(this.unitsAcquired);
    if (!Number.isFinite(money) || money < 0)
      return 'Amount reinvested must be ≥ 0.';
    if (!Number.isFinite(units) || units < 0)
      return 'Units acquired must be ≥ 0.';
    // Units without money has no price to record, so it cannot be stored. Money
    // without units is the opposite and is allowed — the reinvestment rounded
    // to nothing — and surfaces as a notice instead.
    if (units > 0 && money <= 0)
      return `${units} units for $0 — there is no DRP price to record.`;
    return null;
  }

  private get amitError(): string | null {
    if (this.amitAdjustment.trim() === '') return null;
    const n = Number(this.amitAdjustment);
    if (!Number.isFinite(n))
      return 'AMIT adjustment must be a number, or blank if not recorded.';
    return null;
  }

  private get canSave(): boolean {
    return (
      this.stockError === null &&
      this.dateError === null &&
      this.grossError === null &&
      this.frankingError === null &&
      this.drpError === null &&
      this.amitError === null &&
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
    const invested = entry ? Number(entry.amount_reinvested ?? 0) : 0;
    const units = entry ? Number(entry.units_acquired ?? 0) : 0;
    this.drpEnabled = invested > 0 || units > 0;
    this.amountReinvested = invested > 0 ? String(invested) : '';
    this.unitsAcquired = units > 0 ? String(units) : '';
    this.touched = false;
    this.error = '';
    this.notice = '';
    (this as any).requestUpdate?.();
    void this.focusFirst();
    void this.reload();
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
    const drp = this.drpEnabled
      ? {
          amountReinvested:
            this.amountReinvested.trim() === ''
              ? 0
              : Number(this.amountReinvested),
          unitsAcquired:
            this.unitsAcquired.trim() === '' ? 0 : Number(this.unitsAcquired),
        }
      : null;
    this.saving = true;
    this.notice = '';
    (this as any).requestUpdate?.();
    let saved = false;
    try {
      // One coupled write, not two calls. The dividend and any DRP parcel are
      // written together or not at all (spec 6.4).
      const wasEdit = this.editId != null;
      const out = await logDividendWithDrp(this.finance, payload as any, drp, {
        dividendId: this.editId ?? undefined,
      });
      // The AMIT figure rides along with the same submit: it is printed on the
      // same statement line, so it has no separate form and no separate event.
      if (this.amitAdjustment.trim() !== '') {
        await createAdjustment(this.finance, {
          stock_id: payload.stock_id,
          date: this.date,
          amount: Number(this.amitAdjustment),
          reason: 'AMIT cost base adjustment',
        });
      }
      this.notice = out.note ?? '';
      if (wasEdit) {
        this.dispatchEvent(
          new CustomEvent('dividend-edit', {
            detail: { id: out.dividend.id },
            bubbles: true,
            composed: true,
          }),
        );
      } else {
        this.dispatchEvent(
          new CustomEvent('dividend-create', {
            detail: { entry: out.dividend },
            bubbles: true,
            composed: true,
          }),
        );
      }
      saved = true;
      const keepNotice = this.notice;
      this.editEntry(null);
      this.notice = keepNotice;
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
      await deleteDividendWithDrp(this.finance, id);
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
          ${
            this.notice
              ? html`<p class="muted" role="status" aria-live="polite">
                  ${this.notice}
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

            <!-- AMIT cost base adjustment. Same distribution line as the rest
                 of this form, so it is captured here rather than on a view of
                 its own (spec 7.5). -->
            <div class="field-grid">
              <label class="field span-2"
                ><span>AMIT cost base adjustment</span>
                <input
                  aria-label="AMIT cost base adjustment"
                  inputmode="decimal"
                  .value=${this.amitAdjustment}
                  @input=${(e: Event) => {
                    this.amitAdjustment = (e.target as HTMLInputElement).value;
                    this.touched = true;
                    (this as any).requestUpdate?.();
                  }}
                  placeholder="blank if not printed"
                />
                ${
                  this.errorFor(this.amitError)
                    ? html`<p class="field-error">${this.amitError}</p>`
                    : html`<p class="muted">
                        From the distribution line of your annual tax statement.
                        A cost base <em>reduction</em> is negative. Leave blank
                        if it was not printed — 0 and blank mean different
                        things.
                      </p>`
                }
              </label>
              <div class="field">
                <span>Fund adjustment to date</span>
                <div class="stat-value">
                  ${formatAdjustment(this.fundAdjustment)}
                </div>
                <p class="muted">
                  Signed total for this fund, at 4dp so the per-parcel shares
                  add back to it exactly.
                </p>
              </div>
            </div>

            <!-- DRP: one payment, two consequences. -->
            <div class="field-grid">
              <label class="field span-3">
                <span>
                  <input
                    type="checkbox"
                    aria-label="This distribution was reinvested (DRP)"
                    .checked=${this.drpEnabled}
                    @change=${(e: Event) => {
                      this.drpEnabled = (e.target as HTMLInputElement).checked;
                      this.notice = '';
                      this.touched = true;
                      (this as any).requestUpdate?.();
                    }}
                  />
                  Reinvested (DRP) — records a dividend
                  <em class="req">and</em> a parcel
                </span>
              </label>
            </div>
            ${
              this.drpEnabled
                ? html`
                    <div class="field-grid">
                      <label class="field"
                        ><span>Amount reinvested</span>
                        <input
                          aria-label="Amount reinvested"
                          inputmode="decimal"
                          .value=${this.amountReinvested}
                          @input=${(e: Event) => {
                            this.amountReinvested = (
                              e.target as HTMLInputElement
                            ).value;
                            this.notice = '';
                            this.touched = true;
                            (this as any).requestUpdate?.();
                          }}
                          placeholder="0.00"
                        />
                      </label>
                      <label class="field"
                        ><span>Units acquired</span>
                        <input
                          aria-label="Units acquired"
                          inputmode="decimal"
                          .value=${this.unitsAcquired}
                          @input=${(e: Event) => {
                            this.unitsAcquired = (
                              e.target as HTMLInputElement
                            ).value;
                            this.notice = '';
                            this.touched = true;
                            (this as any).requestUpdate?.();
                          }}
                          placeholder="0.000000"
                        />
                      </label>
                      <div class="field">
                        <span>DRP price per unit</span>
                        <div class="stat-value">${this.drpPriceLabel}</div>
                        <p class="muted">
                          Derived, not a market quote. DRP units typically buy
                          in at a discount, and a parcel cannot be back-filled
                          from a later price.
                        </p>
                      </div>
                    </div>
                    ${
                      this.errorFor(this.drpError)
                        ? html`<p class="field-error">${this.drpError}</p>`
                        : ''
                    }
                  `
                : ''
            }
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
