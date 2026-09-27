import { LitElement, html } from 'lit';
import { sharedStyles } from '../styles/shared-styles.js';
import { wealthflowStyles } from '../styles/wealthflow-styles.js';
import { ExtensionLogger } from 'finance-logger';
import { computeFinanceYear, isValidIsoDate } from '../utils/finance-year.js';
import { formatAUD } from '../utils/format.js';
import {
  SUPER_KINDS,
  SUPER_LABELS,
  createSuperEntry,
  updateSuperEntry,
  deleteSuperEntry,
  type SuperEntry,
} from '../dao/super-entries.js';

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
 * One form for both jobs: an empty one logs an entry, a pre-filled one edits an
 * existing one (balance snapshots and private contributions share one log,
 * told apart by kind). The host section owns the toggle, so this element
 * never renders its own show/hide chrome.
 */
export class SuperForm extends Base {
  static override styles =
    typeof HTMLElement !== 'undefined'
      ? ([sharedStyles, wealthflowStyles] as any)
      : [];
  finance: any = null;
  fy = '';
  kind = 'balance';
  date = '';
  amount = '';
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
      if (this.date === '') this.date = today();
    } catch (e: any) {
      this.error = String(e?.message || e);
    }
    (this as any).requestUpdate?.();
  }

  /* Per-field validation: the message renders under the offending control
     instead of one lumped error above the form. */
  private get dateError(): string | null {
    return isValidIsoDate(this.date) ? null : 'Date must be YYYY-MM-DD.';
  }

  private get amountError(): string | null {
    const text = this.amount.trim();
    if (text === '') return 'Amount is required.';
    const n = Number(text);
    return Number.isFinite(n) && n >= 0 ? null : 'Amount must be ≥ 0.';
  }

  private get canSave(): boolean {
    return this.dateError === null && this.amountError === null && !this.saving;
  }

  /** The host section owns the toggle, so closing is a request, not a state. */
  private closeForm(): void {
    this.dispatchEvent(
      new CustomEvent('super-form-close', { bubbles: true, composed: true }),
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

  /** Load an existing entry for correction; pass null for create mode. */
  editEntry(entry: SuperEntry | null): void {
    this.editId = entry?.id ?? null;
    this.kind = entry ? entry.kind : 'balance';
    this.date = entry ? entry.date : this.date || today();
    this.amount = entry ? String(entry.amount) : '';
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
      date: this.date,
      kind: this.kind,
      amount: Number(this.amount.trim()),
      finance_year: this.autoFy,
      notes: this.notes.trim() === '' ? null : this.notes.trim(),
    };
    this.saving = true;
    (this as any).requestUpdate?.();
    let saved = false;
    try {
      if (this.editId == null) {
        const row = await createSuperEntry(this.finance, payload, '07-01');
        this.dispatchEvent(
          new CustomEvent('super-create', {
            detail: { entry: row },
            bubbles: true,
            composed: true,
          }),
        );
      } else {
        await updateSuperEntry(this.finance, this.editId, payload);
        this.dispatchEvent(
          new CustomEvent('super-edit', {
            detail: { id: this.editId },
            bubbles: true,
            composed: true,
          }),
        );
      }
      saved = true;
      this.editEntry(null);
    } catch (err: any) {
      logger.error('super save failed:', err);
      this.error = String(err?.message || err);
      (this as any).requestUpdate?.();
    } finally {
      this.saving = false;
      (this as any).requestUpdate?.();
    }
    if (saved) {
      // Saved: fold the form away so the card is the thing you look at next.
      await this.reload();
      this.closeForm();
    }
  }

  private kindLabel(): string {
    return this.kind === 'contribution' ? 'Private contribution' : 'Balance';
  }

  private async onDelete(): Promise<void> {
    if (this.editId == null) return;
    const amount =
      this.amount.trim() === '' ? '' : formatAUD(Number(this.amount));
    if (
      typeof confirm !== 'undefined' &&
      !confirm(`Delete ${this.kindLabel()} ${amount} on ${this.date}?`)
    )
      return;
    const id = this.editId;
    try {
      await deleteSuperEntry(this.finance, id);
      this.dispatchEvent(
        new CustomEvent('super-delete', {
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
            ${editing ? 'Edit Super Entry' : 'Log Super'}
          </h3>
          <div class="header-actions">
            <span class="muted">FY ${this.autoFy || '—'} · auto</span>
            <span class="muted"><em class="req">*</em> required</span>
            <button
              class="btn btn-primary btn-small"
              type="submit"
              form="super-entry-form"
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
            id="super-entry-form"
            @submit=${this.onSubmit}
            @keydown=${this.onKeyDown}
          >
            <div class="field-grid cols-3">
              <label class="field"
                ><span>Entry<em class="req">*</em></span>
                <select
                  aria-label="Entry kind"
                  .value=${this.kind}
                  @change=${(e: Event) => {
                    this.kind = (e.target as HTMLSelectElement).value;
                    this.touched = true;
                    (this as any).requestUpdate?.();
                  }}
                  required
                >
                  ${(SUPER_KINDS as readonly string[]).map(
                    (k) =>
                      html`<option value=${k}>
                        ${SUPER_LABELS[k as keyof typeof SUPER_LABELS]}
                      </option>`,
                  )}
                </select>
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
                ><span>Amount<em class="req">*</em></span>
                <input
                  aria-label="Amount"
                  inputmode="decimal"
                  .value=${this.amount}
                  @input=${(e: Event) => {
                    this.amount = (e.target as HTMLInputElement).value;
                    this.touched = true;
                    (this as any).requestUpdate?.();
                  }}
                  placeholder="0.00"
                  required
                />
                ${
                  this.errorFor(this.amountError)
                    ? html`<p class="field-error">${this.amountError}</p>`
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
  !customElements.get('super-form')
) {
  customElements.define(
    'super-form',
    SuperForm as unknown as CustomElementConstructor,
  );
}
