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
  name = '';
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
      this.name.trim() !== '' &&
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
        name: this.name.trim(),
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
      this.name = '';
      this.bsb = '';
      this.account = '';
      this.notes = '';
    } catch (err: any) {
      logger.error('bank create failed:', err);
      this.error = String(err?.message || err);
    } finally {
      this.saving = false;
    }
  }

  override render(): unknown {
    if (typeof HTMLElement === 'undefined') return html``;
    return html`
      <div class="section">
        <h3>Add Bank</h3>
        ${this.error ? html`<p class="field-error">Error: ${this.error}</p>` : ''}
        <form @submit=${this.onSubmit}>
          <label
            >Name
            <input
              .value=${this.name}
              @input=${(e: Event) => (this.name = (e.target as HTMLInputElement).value)}
              required
          /></label>
          <label
            >BSB
            <input
              .value=${this.bsb}
              @input=${(e: Event) => (this.bsb = (e.target as HTMLInputElement).value)}
              placeholder="012345"
          /></label>
          ${this.bsbError ? html`<p class="field-error">${this.bsbError}</p>` : ''}
          <label
            >Account
            <input
              .value=${this.account}
              @input=${(e: Event) => (this.account = (e.target as HTMLInputElement).value)}
              required
          /></label>
          <label
            >Notes
            <input
              .value=${this.notes}
              @input=${(e: Event) => (this.notes = (e.target as HTMLInputElement).value)}
          /></label>
          <button class="btn-primary" type="submit" ?disabled=${!this.canSave}>
            Add Bank
          </button>
        </form>
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
