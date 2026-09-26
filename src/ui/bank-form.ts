import { LitElement, html } from 'lit';
import { sharedStyles } from '../styles/shared-styles.js';
import { wealthflowStyles } from '../styles/wealthflow-styles.js';
import { ExtensionLogger } from 'finance-logger';
import { validateBsb } from '../services/bank-service.js';
import { createBank } from '../dao/banks.js';

const Base =
  typeof HTMLElement !== 'undefined'
    ? LitElement
    : (class {} as unknown as typeof LitElement);
const logger = new ExtensionLogger('wealthflow');

export class BankForm extends Base {
  static override styles =
    typeof HTMLElement !== 'undefined'
      ? ([sharedStyles, wealthflowStyles] as any)
      : [];
  finance: any = null;
  bankCode = '';
  bankFullName = '';
  bsb = '';
  account = '';
  notes = '';
  error = '';
  saving = false;

  async setFinance(f: any): Promise<void> {
    this.finance = f;
  }

  private get bsbError(): string | null {
    return validateBsb(this.bsb);
  }

  private get canSave(): boolean {
    return (
      this.bankCode.trim() !== '' &&
      this.account.trim() !== '' &&
      this.bsbError === null &&
      !this.saving
    );
  }

  private async onSubmit(e: Event): Promise<void> {
    e.preventDefault();
    if (!this.canSave) return;
    this.saving = true;
    this.error = '';
    try {
      const row = await createBank(this.finance, {
        bank_code: this.bankCode.trim(),
        bank_full_name:
          this.bankFullName.trim() === '' ? null : this.bankFullName.trim(),
        bsb: this.bsb.trim() === '' ? null : this.bsb.replace(/\D/g, ''),
        account_number: this.account.trim(),
        notes: this.notes.trim() === '' ? null : this.notes.trim(),
      });
      this.dispatchEvent(
        new CustomEvent('bank-create', {
          detail: { bank: row },
          bubbles: true,
          composed: true,
        }),
      );
      this.bankCode = '';
      this.bankFullName = '';
      this.bsb = '';
      this.account = '';
      this.notes = '';
    } catch (err: any) {
      logger.error('bank create failed:', err);
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
          <h3 class="section-title">Add Bank</h3>
          <div class="header-actions">
            <span class="muted"><em class="req">*</em> required</span>
            <button
              class="btn btn-primary btn-small"
              type="submit"
              form="bank-add-form"
              ?disabled=${!this.canSave}
            >
              ${this.saving ? 'Adding…' : 'Add Bank'}
            </button>
          </div>
        </div>
        <div class="section-body">
          ${this.error ? html`<p class="field-error">Error: ${this.error}</p>` : ''}
          <form id="bank-add-form" @submit=${this.onSubmit}>
            <div class="field-grid">
              <label class="field"
                ><span>Name<em class="req">*</em></span>
                <input
                  aria-label="Name"
                  .value=${this.bankCode}
                  @input=${(e: Event) => {
                    this.bankCode = (e.target as HTMLInputElement).value;
                    (this as any).requestUpdate?.();
                  }}
                  required
              /></label>
              <label class="field"
                ><span>Full name</span>
                <input
                  aria-label="Full name"
                  .value=${this.bankFullName}
                  @input=${(e: Event) => {
                    this.bankFullName = (e.target as HTMLInputElement).value;
                    (this as any).requestUpdate?.();
                  }}
                  placeholder="Macquarie Bank Limited"
              /></label>
              <label class="field"
                ><span>BSB</span>
                <input
                  aria-label="BSB"
                  inputmode="numeric"
                  maxlength="6"
                  .value=${this.bsb}
                  @input=${(e: Event) => {
                    this.bsb = (e.target as HTMLInputElement).value;
                    (this as any).requestUpdate?.();
                  }}
                  placeholder="012345"
                />
                ${this.bsbError ? html`<p class="field-error">${this.bsbError}</p>` : ''}
              </label>
              <label class="field"
                ><span>Account<em class="req">*</em></span>
                <input
                  aria-label="Account"
                  .value=${this.account}
                  @input=${(e: Event) => {
                    this.account = (e.target as HTMLInputElement).value;
                    (this as any).requestUpdate?.();
                  }}
                  required
              /></label>
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

if (typeof customElements !== 'undefined' && !customElements.get('bank-form')) {
  customElements.define(
    'bank-form',
    BankForm as unknown as CustomElementConstructor,
  );
}
