import { LitElement, html } from 'lit';
import { sharedStyles } from '../styles/shared-styles.js';
import { wealthflowStyles } from '../styles/wealthflow-styles.js';
import { ExtensionLogger } from 'finance-logger';
import { computeFinanceYear, isValidIsoDate } from '../utils/finance-year.js';
import { listBanks, type Bank } from '../dao/banks.js';
import {
  createInterestEntry,
  updateInterestEntry,
  deleteInterestEntry,
  type InterestEntry,
} from '../dao/interest-entries.js';

const Base =
  typeof HTMLElement !== 'undefined'
    ? LitElement
    : (class {} as unknown as typeof LitElement);
const logger = new ExtensionLogger('wealthflow');

export class InterestForm extends Base {
  static override styles =
    typeof HTMLElement !== 'undefined'
      ? ([sharedStyles, wealthflowStyles] as any)
      : [];
  finance: any = null;
  fy = '';
  banks: Bank[] = [];
  bankId: number | null = null;
  date = '';
  amount = '';
  financeYear = '';
  financeYearTouched = false;
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
      this.banks = await listBanks(this.finance, { status: 'active' });
      if (this.date === '') {
        const now = new Date();
        this.date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      }
      this.autofillFy();
    } catch (e: any) {
      this.error = String(e?.message || e);
    }
    (this as any).requestUpdate?.();
  }

  /** Load an existing entry for correction; pass null to reset to create mode. */
  editEntry(entry: InterestEntry | null): void {
    if (!entry) {
      this.editId = null;
      this.notes = '';
      this.amount = '';
      this.financeYearTouched = false;
    } else {
      this.editId = entry.id;
      this.bankId = entry.bank_id;
      this.date = entry.date;
      this.amount = String(entry.amount);
      this.financeYear = entry.finance_year;
      this.financeYearTouched = false;
      this.notes = entry.notes ?? '';
    }
    (this as any).requestUpdate?.();
  }

  private autofillFy(): void {
    if (this.financeYearTouched) return;
    const auto = isValidIsoDate(this.date)
      ? computeFinanceYear(this.date, '07-01')
      : null;
    this.financeYear = auto ?? this.fy ?? '';
  }

  private get fyMismatch(): boolean {
    if (!isValidIsoDate(this.date)) return false;
    const auto = computeFinanceYear(this.date, '07-01');
    return (
      auto !== null && this.financeYear !== '' && this.financeYear !== auto
    );
  }

  private async onSubmit(e: Event): Promise<void> {
    e.preventDefault();
    this.error = '';
    const amount = Number(this.amount);
    if (this.bankId == null) {
      this.error = 'Choose a bank.';
      (this as any).requestUpdate?.();
      return;
    }
    if (!isValidIsoDate(this.date)) {
      this.error = 'Date must be YYYY-MM-DD.';
      (this as any).requestUpdate?.();
      return;
    }
    if (!Number.isFinite(amount) || amount < 0) {
      this.error = 'Amount must be ≥ 0.';
      (this as any).requestUpdate?.();
      return;
    }
    try {
      if (this.editId == null) {
        const row = await createInterestEntry(
          this.finance,
          {
            bank_id: this.bankId,
            date: this.date,
            amount,
            finance_year: this.financeYear,
            notes: this.notes.trim() === '' ? null : this.notes.trim(),
          },
          '07-01',
        );
        this.dispatchEvent(
          new CustomEvent('interest-create', {
            detail: { entry: row },
            bubbles: true,
            composed: true,
          }),
        );
      } else {
        await updateInterestEntry(this.finance, this.editId, {
          bank_id: this.bankId,
          date: this.date,
          amount,
          finance_year: this.financeYear,
          notes: this.notes.trim() === '' ? null : this.notes.trim(),
        });
        this.dispatchEvent(
          new CustomEvent('interest-edit', {
            detail: { id: this.editId },
            bubbles: true,
            composed: true,
          }),
        );
      }
      this.editEntry(null);
    } catch (err: any) {
      logger.error('interest save failed:', err);
      this.error = String(err?.message || err);
      (this as any).requestUpdate?.();
    }
  }

  private async onDelete(): Promise<void> {
    if (this.editId == null) return;
    if (
      typeof confirm !== 'undefined' &&
      !confirm('Delete this interest entry?')
    )
      return;
    try {
      await deleteInterestEntry(this.finance, this.editId);
      this.dispatchEvent(
        new CustomEvent('interest-delete', {
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
        <h3>
          ${this.editId == null ? 'Log Interest (corrections)' : 'Edit Interest Entry'}
        </h3>
        ${this.error ? html`<p class="field-error">Error: ${this.error}</p>` : ''}
        <form @submit=${this.onSubmit}>
          <label
            >Bank
            <select
              @change=${(e: Event) => {
                this.bankId =
                  Number((e.target as HTMLSelectElement).value) || null;
                (this as any).requestUpdate?.();
              }}
            >
              <option value="">— choose —</option>
              ${this.banks.map((b) => html`<option value=${b.id} ?selected=${this.bankId === b.id}>${b.name}</option>`)}
            </select>
          </label>
          <label
            >Date
            <input
              .value=${this.date}
              @input=${(e: Event) => {
                this.date = (e.target as HTMLInputElement).value;
                this.autofillFy();
                (this as any).requestUpdate?.();
              }}
              placeholder="YYYY-MM-DD"
            />
          </label>
          <label
            >Amount (AUD)
            <input
              .value=${this.amount}
              @input=${(e: Event) => {
                this.amount = (e.target as HTMLInputElement).value;
                (this as any).requestUpdate?.();
              }}
              inputmode="decimal"
              placeholder="0.00"
            />
          </label>
          <label
            >Financial year
            <input
              .value=${this.financeYear}
              @input=${(e: Event) => {
                this.financeYear = (e.target as HTMLInputElement).value;
                this.financeYearTouched = true;
                (this as any).requestUpdate?.();
              }}
            />
          </label>
          ${this.fyMismatch ? html`<p class="callout-warn">FY differs from the date — kept as an override.</p>` : ''}
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
            ${this.editId == null ? 'Log Interest' : 'Save'}
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
  !customElements.get('interest-form')
) {
  customElements.define(
    'interest-form',
    InterestForm as unknown as CustomElementConstructor,
  );
}
