import { LitElement, html } from 'lit';
import { sharedStyles } from '../styles/shared-styles.js';
import { wealthflowStyles } from '../styles/wealthflow-styles.js';
import { ExtensionLogger } from 'finance-logger';
import { maskAccount, formatBSB } from '../utils/format.js';
import { validateBsb } from '../services/bank-service.js';
import {
  listBanks,
  updateBank,
  setBankActive,
  type Bank,
} from '../dao/banks.js';

const Base =
  typeof HTMLElement !== 'undefined'
    ? LitElement
    : (class {} as unknown as typeof LitElement);
const logger = new ExtensionLogger('wealthflow');

export class BankList extends Base {
  static override styles =
    typeof HTMLElement !== 'undefined'
      ? ([sharedStyles, wealthflowStyles] as any)
      : [];
  finance: any = null;
  /** Set by the orchestrator; this master-data list is FY-agnostic. */
  fy = '';
  banks: Bank[] = [];
  showForm = false;
  editingId: number | null = null;
  editBankCode = '';
  editBankFullName = '';
  editBsb = '';
  editAccount = '';
  editNotes = '';
  editTouched = false;
  savingEdit = false;
  error = '';

  async setFinance(f: any): Promise<void> {
    this.finance = f;
    await this.reload();
  }

  async reload(): Promise<void> {
    if (!this.finance?.db) return;
    this.error = '';
    try {
      this.banks = await listBanks(this.finance, { status: 'all' });
    } catch (e: any) {
      logger.error('bank list reload failed:', e);
      this.error = String(e?.message || e);
    }
    (this as any).requestUpdate?.();
    await this.pushToChildren();
  }

  /** Forward finance to the embedded bank form. */
  private async pushToChildren(): Promise<void> {
    try {
      await (this as any).updateComplete;
    } catch {
      /* non-Lit */
    }
    const root = (this as any).renderRoot as ShadowRoot | undefined;
    if (!root) return;
    const el = root.querySelector('bank-form') as any;
    if (!el) return;
    el.finance = this.finance;
    if (typeof el.setFinance === 'function') {
      try {
        await el.setFinance(this.finance);
      } catch (e: any) {
        this.error = String(e?.message || e);
      }
    } else if (typeof el.reload === 'function') {
      try {
        await el.reload();
      } catch (e: any) {
        this.error = String(e?.message || e);
      }
    }
  }

  override connectedCallback(): void {
    (super.connectedCallback as (() => void) | undefined)?.call(this);
    this.addEventListener('bank-create', this._onChildChanged as EventListener);
  }

  override disconnectedCallback(): void {
    this.removeEventListener(
      'bank-create',
      this._onChildChanged as EventListener,
    );
    (super.disconnectedCallback as (() => void) | undefined)?.call(this);
  }

  private _onChildChanged = (): void => {
    // Bank-form creates bubble through here; refresh the rows.
    void this.reload();
  };

  /* Per-field validation: the message renders under the offending input
     instead of one lumped error in the actions cell. */
  private get nameError(): string | null {
    return this.editBankCode.trim() === '' ? 'Name is required.' : null;
  }

  private get accountError(): string | null {
    return this.editAccount.trim() === '' ? 'Account is required.' : null;
  }

  private get bsbError(): string | null {
    return validateBsb(this.editBsb);
  }

  private get canSaveEdit(): boolean {
    return (
      this.nameError === null &&
      this.accountError === null &&
      this.bsbError === null &&
      !this.savingEdit
    );
  }

  /** Errors stay hidden until a field is touched, so an untouched row is calm. */
  private errorFor(e: string | null): string | null {
    return e !== null && this.editTouched ? e : null;
  }

  private async startEdit(b: Bank): Promise<void> {
    this.editingId = b.id;
    this.editBankCode = b.bank_code;
    this.editBankFullName = b.bank_full_name ?? '';
    this.editBsb = b.bsb ?? '';
    this.editAccount = b.account_number;
    this.editNotes = b.notes ?? '';
    this.editTouched = false;
    this.savingEdit = false;
    this.error = '';
    (this as any).requestUpdate?.();
    try {
      await (this as any).updateComplete;
    } catch {
      /* non-Lit */
    }
    const root = (this as any).renderRoot as ShadowRoot | undefined;
    root?.querySelector<HTMLInputElement>('tr.editing input')?.focus();
  }

  private cancelEdit(): void {
    this.editingId = null;
    this.editTouched = false;
    (this as any).requestUpdate?.();
  }

  /** Enter saves, Escape cancels — shared by every field in the edit row. */
  private onEditKey(b: Bank, e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      void this.saveEdit(b);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.cancelEdit();
    }
  }

  private onEditInput(setter: (v: string) => void, e: Event): void {
    setter((e.target as HTMLInputElement).value);
    this.editTouched = true;
    (this as any).requestUpdate?.();
  }

  private async saveEdit(b: Bank): Promise<void> {
    this.editTouched = true;
    const blocker = this.nameError ?? this.accountError ?? this.bsbError;
    if (blocker !== null) {
      this.error = blocker;
      (this as any).requestUpdate?.();
      return;
    }
    if (this.savingEdit) return;
    this.savingEdit = true;
    (this as any).requestUpdate?.();
    try {
      await updateBank(this.finance, b.id, {
        bank_code: this.editBankCode.trim(),
        bank_full_name:
          this.editBankFullName.trim() === ''
            ? null
            : this.editBankFullName.trim(),
        bsb:
          this.editBsb.trim() === '' ? null : this.editBsb.replace(/\D/g, ''),
        account_number: this.editAccount.trim(),
        notes: this.editNotes.trim() === '' ? null : this.editNotes.trim(),
      });
      this.editingId = null;
      this.dispatchEvent(
        new CustomEvent('bank-edit', {
          detail: { id: b.id, fromList: true },
          bubbles: true,
          composed: true,
        }),
      );
      await this.reload();
    } catch (e: any) {
      logger.error('bank edit failed:', e);
      this.error = String(e?.message || e);
      (this as any).requestUpdate?.();
    } finally {
      this.savingEdit = false;
      (this as any).requestUpdate?.();
    }
  }

  private async toggleActive(b: Bank): Promise<void> {
    const toActive = !b.is_active;
    if (
      !toActive &&
      typeof confirm !== 'undefined' &&
      !confirm(`Deactivate ${b.bank_code}? Its history stays in all totals.`)
    )
      return;
    try {
      await setBankActive(this.finance, b.id, toActive);
      this.dispatchEvent(
        new CustomEvent(toActive ? 'bank-activate' : 'bank-deactivate', {
          detail: { id: b.id },
          bubbles: true,
          composed: true,
        }),
      );
      await this.reload();
    } catch (e: any) {
      logger.error('bank activate/deactivate failed:', e);
      this.error = String(e?.message || e);
      (this as any).requestUpdate?.();
    }
  }

  override render(): unknown {
    if (typeof HTMLElement === 'undefined') return html``;
    return html`
      <div class="order-stack">
        <div class="section flush">
          <div class="section-header">
            <h3 class="section-title">Banks</h3>
            <div class="header-actions">
              <button
                class="btn btn-secondary btn-small"
                @click=${() => {
                  this.showForm = !this.showForm;
                  (this as any).requestUpdate?.();
                  if (this.showForm) void this.pushToChildren();
                }}
              >
                ${this.showForm ? 'Hide add form' : '+ Add bank'}
              </button>
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
            ${this.renderTable()}
          </div>
        </div>
        ${this.showForm ? html`<bank-form></bank-form>` : ''}
      </div>
    `;
  }

  private renderTable(): unknown {
    if (this.banks.length === 0)
      return html`<p class="empty-state">
        No banks yet — use “+ Add bank” to add one.
      </p>`;
    return html`
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th scope="col">Bank</th>
              <th scope="col" class="num">BSB / Account</th>
              <th scope="col" class="num">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${this.banks.map((b) =>
              this.editingId === b.id ? this.editRow(b) : this.viewRow(b),
            )}
          </tbody>
        </table>
      </div>
    `;
  }

  private viewRow(b: Bank): unknown {
    return html`
      <tr class=${b.is_active ? '' : 'inactive'}>
        <td>
          <span class="row-code">${b.bank_code}</span>
          <button
            class="status-toggle ${b.is_active ? 'on' : ''}"
            aria-pressed=${b.is_active}
            aria-label="${b.is_active ? 'Deactivate' : 'Activate'}
              ${b.bank_code}"
            title="${b.is_active ? 'Deactivate' : 'Activate'} — history stays
              in all totals"
            @click=${() => this.toggleActive(b)}
          >
            ${b.is_active ? 'Active' : 'Inactive'}
          </button>
          ${
            b.bank_full_name
              ? html`<span class="row-sub">${b.bank_full_name}</span>`
              : ''
          }
        </td>
        <td class="mono num">
          ${
            b.bsb
              ? html`${formatBSB(b.bsb)}
                  <span class="muted">${maskAccount(b.account_number)}</span>`
              : html`<span class="muted"
                  >no BSB · ${maskAccount(b.account_number)}</span
                >`
          }
        </td>
        <td>
          <div class="row-actions">
            <button
              class="btn btn-secondary btn-small"
              aria-label="Edit ${b.bank_code}"
              @click=${() => this.startEdit(b)}
            >
              Edit
            </button>
          </div>
        </td>
      </tr>
    `;
  }

  private editRow(b: Bank): unknown {
    const blocker = this.nameError ?? this.accountError ?? this.bsbError;
    return html`
      <tr class="editing">
        <td colspan="3">
          <div class="edit-grid">
            <label class="field"
              ><span>Name<em class="req">*</em></span>
              <input
                aria-label="Bank name"
                .value=${this.editBankCode}
                @input=${(e: Event) =>
                  this.onEditInput((v) => (this.editBankCode = v), e)}
                @keydown=${(e: KeyboardEvent) => this.onEditKey(b, e)}
              />
              ${
                this.errorFor(this.nameError)
                  ? html`<p class="field-error">${this.nameError}</p>`
                  : ''
              }
            </label>
            <label class="field"
              ><span>Full name</span>
              <input
                aria-label="Full bank name"
                .value=${this.editBankFullName}
                @input=${(e: Event) =>
                  this.onEditInput((v) => (this.editBankFullName = v), e)}
                @keydown=${(e: KeyboardEvent) => this.onEditKey(b, e)}
                placeholder="Macquarie Bank Limited"
            /></label>
            <label class="field"
              ><span>BSB</span>
              <input
                aria-label="BSB"
                inputmode="numeric"
                maxlength="6"
                .value=${this.editBsb}
                @input=${(e: Event) =>
                  this.onEditInput((v) => (this.editBsb = v), e)}
                @keydown=${(e: KeyboardEvent) => this.onEditKey(b, e)}
                placeholder="012345"
              />
              ${
                this.errorFor(this.bsbError)
                  ? html`<p class="field-error">${this.bsbError}</p>`
                  : ''
              }
            </label>
            <label class="field"
              ><span>Account<em class="req">*</em></span>
              <input
                aria-label="Account number"
                .value=${this.editAccount}
                @input=${(e: Event) =>
                  this.onEditInput((v) => (this.editAccount = v), e)}
                @keydown=${(e: KeyboardEvent) => this.onEditKey(b, e)}
                placeholder="Account"
              />
              ${
                this.errorFor(this.accountError)
                  ? html`<p class="field-error">${this.accountError}</p>`
                  : ''
              }
            </label>
            <label class="field edit-notes"
              ><span>Notes</span>
              <input
                aria-label="Notes"
                .value=${this.editNotes}
                @input=${(e: Event) =>
                  this.onEditInput((v) => (this.editNotes = v), e)}
                @keydown=${(e: KeyboardEvent) => this.onEditKey(b, e)}
                placeholder="Optional"
            /></label>
            <div class="edit-buttons">
              <button
                class="btn btn-primary btn-small"
                ?disabled=${!this.canSaveEdit}
                title=${blocker ?? 'Save changes'}
                @click=${() => this.saveEdit(b)}
              >
                ${this.savingEdit ? 'Saving…' : 'Save'}
              </button>
              <button
                class="btn btn-secondary btn-small"
                @click=${() => this.cancelEdit()}
              >
                Cancel
              </button>
            </div>
          </div>
        </td>
      </tr>
    `;
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('bank-list')) {
  customElements.define(
    'bank-list',
    BankList as unknown as CustomElementConstructor,
  );
}
