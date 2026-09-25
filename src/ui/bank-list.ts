import { LitElement, html } from 'lit';
import { sharedStyles } from '../styles/shared-styles.js';
import { wealthflowStyles } from '../styles/wealthflow-styles.js';
import { ExtensionLogger } from 'finance-logger';
import { formatAUD, maskAccount, formatBSB } from '../utils/format.js';
import { validateBsb, getInterestTotals } from '../services/bank-service.js';
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

type StatusFilter = 'active' | 'inactive' | 'all';

export class BankList extends Base {
  static override styles =
    typeof HTMLElement !== 'undefined'
      ? ([sharedStyles, wealthflowStyles] as any)
      : [];
  finance: any = null;
  fy = '';
  banks: Bank[] = [];
  totals: Record<number, number> = {};
  statusFilter: StatusFilter = 'active';
  editingId: number | null = null;
  editName = '';
  editBsb = '';
  editAccount = '';
  error = '';

  async setFinance(f: any): Promise<void> {
    this.finance = f;
    await this.reload();
  }

  async reload(): Promise<void> {
    if (!this.finance?.db) return;
    this.error = '';
    try {
      this.banks = await listBanks(this.finance, { status: this.statusFilter });
      if (this.fy) {
        const { byBank } = await getInterestTotals(
          this.finance,
          this.banks,
          this.fy,
        );
        this.totals = Object.fromEntries(
          byBank.map((b) => [b.bankId, b.total]),
        );
      } else {
        this.totals = {};
      }
    } catch (e: any) {
      logger.error('bank list reload failed:', e);
      this.error = String(e?.message || e);
    }
    (this as any).requestUpdate?.();
    await this.pushToChildren();
  }

  /** Forward finance + fy to embedded grid/form children. */
  private async pushToChildren(): Promise<void> {
    try {
      await (this as any).updateComplete;
    } catch {
      /* non-Lit */
    }
    const root = (this as any).renderRoot as ShadowRoot | undefined;
    if (!root) return;
    for (const sel of ['interest-grid', 'interest-form', 'bank-form']) {
      const el = root.querySelector(sel) as any;
      if (!el) continue;
      el.finance = this.finance;
      if ('fy' in el || sel !== 'bank-form') {
        try {
          el.fy = this.fy;
        } catch {
          /* ignore */
        }
      }
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
  }

  override connectedCallback(): void {
    (super.connectedCallback as (() => void) | undefined)?.call(this);
    this.addEventListener('bank-create', this._onChildChanged as EventListener);
    this.addEventListener(
      'interest-create',
      this._onChildChanged as EventListener,
    );
    this.addEventListener(
      'interest-edit',
      this._onChildChanged as EventListener,
    );
    this.addEventListener(
      'interest-delete',
      this._onChildChanged as EventListener,
    );
  }

  override disconnectedCallback(): void {
    this.removeEventListener(
      'bank-create',
      this._onChildChanged as EventListener,
    );
    this.removeEventListener(
      'interest-create',
      this._onChildChanged as EventListener,
    );
    this.removeEventListener(
      'interest-edit',
      this._onChildChanged as EventListener,
    );
    this.removeEventListener(
      'interest-delete',
      this._onChildChanged as EventListener,
    );
    (super.disconnectedCallback as (() => void) | undefined)?.call(this);
  }

  private _onChildChanged = (e: Event): void => {
    // Grid/form writes bubble through here; refresh per-row FY figures.
    // Stop double-handling of our own row edits (handled inline).
    if ((e as CustomEvent).detail?.fromList) return;
    void this.reload();
  };

  private startEdit(b: Bank): void {
    this.editingId = b.id;
    this.editName = b.name;
    this.editBsb = b.bsb ?? '';
    this.editAccount = b.account_number;
    this.error = '';
    (this as any).requestUpdate?.();
  }

  private cancelEdit(): void {
    this.editingId = null;
    (this as any).requestUpdate?.();
  }

  private async saveEdit(b: Bank): Promise<void> {
    const bsbErr = validateBsb(this.editBsb);
    if (
      this.editName.trim() === '' ||
      this.editAccount.trim() === '' ||
      bsbErr
    ) {
      this.error = bsbErr ?? 'Name and account are required.';
      (this as any).requestUpdate?.();
      return;
    }
    try {
      await updateBank(this.finance, b.id, {
        name: this.editName.trim(),
        bsb:
          this.editBsb.trim() === '' ? null : this.editBsb.replace(/\D/g, ''),
        account_number: this.editAccount.trim(),
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
    }
  }

  private async toggleActive(b: Bank): Promise<void> {
    const toActive = !b.is_active;
    if (
      !toActive &&
      typeof confirm !== 'undefined' &&
      !confirm(`Deactivate ${b.name}? Its history stays in all totals.`)
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
    const filters: StatusFilter[] = ['active', 'inactive', 'all'];
    return html`
      <div class="section">
        <h3>Banks</h3>
        <div>
          ${filters.map(
            (f) =>
              html`<label
                ><input
                  type="radio"
                  name="bank-status"
                  .checked=${this.statusFilter === f}
                  @change=${() => {
                    this.statusFilter = f;
                    void this.reload();
                  }}
                />${f[0].toUpperCase() + f.slice(1)}</label
              >`,
          )}
        </div>
        ${this.error ? html`<p class="field-error">Error: ${this.error}</p>` : ''}
        ${
          this.banks.length === 0
            ? html`<p>Add your first bank below to start tracking interest.</p>`
            : html`<div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Bank</th>
                      <th>BSB / Account</th>
                      <th>FY ${this.fy}</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${this.banks.map((b) => (this.editingId === b.id ? this.editRow(b) : this.viewRow(b)))}
                  </tbody>
                </table>
              </div>`
        }
      </div>
      <bank-form></bank-form>
      <interest-grid></interest-grid>
      <interest-form></interest-form>
    `;
  }

  private viewRow(b: Bank): unknown {
    return html`
      <tr class=${b.is_active ? '' : 'muted'}>
        <td>
          ${b.name}
          ${b.is_active ? '' : html`<span class="badge">inactive</span>`}
        </td>
        <td>${formatBSB(b.bsb)} ${maskAccount(b.account_number)}</td>
        <td>${formatAUD(this.totals[b.id] ?? 0)}</td>
        <td>
          <button class="filter-btn" @click=${() => this.startEdit(b)}>
            Edit
          </button>
          <button class="filter-btn" @click=${() => this.toggleActive(b)}>
            ${b.is_active ? 'Deactivate' : 'Activate'}
          </button>
        </td>
      </tr>
    `;
  }

  private editRow(b: Bank): unknown {
    const bsbErr = validateBsb(this.editBsb);
    return html`
      <tr>
        <td>
          <input
            .value=${this.editName}
            @input=${(e: Event) => {
              this.editName = (e.target as HTMLInputElement).value;
              (this as any).requestUpdate?.();
            }}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === 'Enter') void this.saveEdit(b);
              if (e.key === 'Escape') this.cancelEdit();
            }}
          />
        </td>
        <td>
          <input
            .value=${this.editBsb}
            @input=${(e: Event) => {
              this.editBsb = (e.target as HTMLInputElement).value;
              (this as any).requestUpdate?.();
            }}
            placeholder="BSB"
          />
          <input
            .value=${this.editAccount}
            @input=${(e: Event) => {
              this.editAccount = (e.target as HTMLInputElement).value;
              (this as any).requestUpdate?.();
            }}
            placeholder="Account"
          />
          ${bsbErr ? html`<p class="field-error">${bsbErr}</p>` : ''}
        </td>
        <td>${formatAUD(this.totals[b.id] ?? 0)}</td>
        <td>
          <button class="btn-primary" @click=${() => this.saveEdit(b)}>
            Save
          </button>
          <button class="filter-btn" @click=${() => this.cancelEdit()}>
            Cancel
          </button>
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
