import { LitElement, html } from 'lit';
import { sharedStyles } from '../styles/shared-styles.js';
import { wealthflowStyles } from '../styles/wealthflow-styles.js';
import { ExtensionLogger } from 'finance-logger';
import {
  listStocks,
  updateStock,
  setStockActive,
  type Stock,
} from '../dao/stocks.js';

const Base =
  typeof HTMLElement !== 'undefined'
    ? LitElement
    : (class {} as unknown as typeof LitElement);
const logger = new ExtensionLogger('wealthflow');

export class StockList extends Base {
  static override styles =
    typeof HTMLElement !== 'undefined'
      ? ([sharedStyles, wealthflowStyles] as any)
      : [];
  finance: any = null;
  /** Set by the orchestrator; this master-data list is FY-agnostic. */
  fy = '';
  stocks: Stock[] = [];
  showForm = false;
  editingId: number | null = null;
  editStockCode = '';
  editStockName = '';
  editShares = '';
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
      this.stocks = await listStocks(this.finance, { status: 'all' });
    } catch (e: any) {
      logger.error('stock list reload failed:', e);
      this.error = String(e?.message || e);
    }
    (this as any).requestUpdate?.();
    await this.pushToChildren();
  }

  /** Forward finance to the embedded holding form. */
  private async pushToChildren(): Promise<void> {
    try {
      await (this as any).updateComplete;
    } catch {
      /* non-Lit */
    }
    const root = (this as any).renderRoot as ShadowRoot | undefined;
    if (!root) return;
    const el = root.querySelector('stock-form') as any;
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
    this.addEventListener(
      'stock-create',
      this._onChildChanged as EventListener,
    );
    this.addEventListener(
      'dividend-create',
      this._onDividendChanged as EventListener,
    );
    this.addEventListener(
      'dividend-edit',
      this._onDividendChanged as EventListener,
    );
    this.addEventListener(
      'dividend-delete',
      this._onDividendChanged as EventListener,
    );
  }

  override disconnectedCallback(): void {
    this.removeEventListener(
      'stock-create',
      this._onChildChanged as EventListener,
    );
    this.removeEventListener(
      'dividend-create',
      this._onDividendChanged as EventListener,
    );
    this.removeEventListener(
      'dividend-edit',
      this._onDividendChanged as EventListener,
    );
    this.removeEventListener(
      'dividend-delete',
      this._onDividendChanged as EventListener,
    );
    (super.disconnectedCallback as (() => void) | undefined)?.call(this);
  }

  private _onChildChanged = (): void => {
    // stock-form creates bubble through here; refresh the rows.
    void this.reload();
  };

  private _onDividendChanged = (): void => {
    void this.reload();
  };

  /* Per-field validation: the message renders under the offending input. */
  private get codeError(): string | null {
    return this.editStockCode.trim() === '' ? 'Code is required.' : null;
  }

  private get nameError(): string | null {
    return this.editStockName.trim() === '' ? 'Name is required.' : null;
  }

  private get sharesError(): string | null {
    const text = this.editShares.trim();
    if (text === '') return 'Shares are required.';
    const n = Number(text);
    return Number.isFinite(n) && n >= 0 ? null : 'Shares must be ≥ 0.';
  }

  private get canSaveEdit(): boolean {
    return (
      this.codeError === null &&
      this.nameError === null &&
      this.sharesError === null &&
      !this.savingEdit
    );
  }

  /** Errors stay hidden until a field is touched, so an untouched row is calm. */
  private errorFor(e: string | null): string | null {
    return e !== null && this.editTouched ? e : null;
  }

  private async startEdit(s: Stock): Promise<void> {
    this.editingId = s.id;
    this.editStockCode = s.stock_code;
    this.editStockName = s.stock_full_name;
    this.editShares = String(s.shares);
    this.editNotes = s.notes ?? '';
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
  private onEditKey(s: Stock, e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      void this.saveEdit(s);
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

  private async saveEdit(s: Stock): Promise<void> {
    this.editTouched = true;
    const blocker = this.codeError ?? this.nameError ?? this.sharesError;
    if (blocker !== null) {
      this.error = blocker;
      (this as any).requestUpdate?.();
      return;
    }
    if (this.savingEdit) return;
    this.savingEdit = true;
    (this as any).requestUpdate?.();
    try {
      await updateStock(this.finance, s.id, {
        stock_code: this.editStockCode.trim(),
        stock_full_name: this.editStockName.trim(),
        shares: Number(this.editShares.trim()),
        notes: this.editNotes.trim() === '' ? null : this.editNotes.trim(),
      });
      this.editingId = null;
      this.dispatchEvent(
        new CustomEvent('stock-edit', {
          detail: { id: s.id, fromList: true },
          bubbles: true,
          composed: true,
        }),
      );
      await this.reload();
    } catch (e: any) {
      logger.error('stock edit failed:', e);
      this.error = String(e?.message || e);
      (this as any).requestUpdate?.();
    } finally {
      this.savingEdit = false;
      (this as any).requestUpdate?.();
    }
  }

  private async toggleActive(s: Stock): Promise<void> {
    const toActive = !s.is_active;
    if (
      !toActive &&
      typeof confirm !== 'undefined' &&
      !confirm(`Deactivate ${s.stock_code}? Its history stays in all totals.`)
    )
      return;
    try {
      await setStockActive(this.finance, s.id, toActive);
      this.dispatchEvent(
        new CustomEvent(toActive ? 'stock-activate' : 'stock-deactivate', {
          detail: { id: s.id },
          bubbles: true,
          composed: true,
        }),
      );
      await this.reload();
    } catch (e: any) {
      logger.error('stock activate/deactivate failed:', e);
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
            <h3 class="section-title">Stocks</h3>
            <div class="header-actions">
              <button
                class="btn btn-secondary btn-small"
                @click=${() => {
                  this.showForm = !this.showForm;
                  (this as any).requestUpdate?.();
                  if (this.showForm) void this.pushToChildren();
                }}
              >
                ${this.showForm ? 'Hide add form' : '+ Add holding'}
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
        ${this.showForm ? html`<stock-form></stock-form>` : ''}
      </div>
    `;
  }

  private renderTable(): unknown {
    if (this.stocks.length === 0)
      return html`<p class="empty-state">
        No holdings yet — use “+ Add holding” to add one.
      </p>`;
    return html`
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th scope="col">Code</th>
              <th scope="col" class="num">Shares</th>
              <th scope="col" class="num">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${this.stocks.map((s) =>
              this.editingId === s.id ? this.editRow(s) : this.viewRow(s),
            )}
          </tbody>
        </table>
      </div>
    `;
  }

  private viewRow(s: Stock): unknown {
    return html`
      <tr class=${s.is_active ? '' : 'inactive'}>
        <td>
          <span class="row-code">${s.stock_code}</span>
          <button
            class="status-toggle ${s.is_active ? 'on' : ''}"
            aria-pressed=${s.is_active}
            aria-label="${s.is_active ? 'Deactivate' : 'Activate'}
              ${s.stock_code}"
            title="${s.is_active ? 'Deactivate' : 'Activate'} — history stays
              in all totals"
            @click=${() => this.toggleActive(s)}
          >
            ${s.is_active ? 'Active' : 'Inactive'}
          </button>
          <span class="row-sub">${s.stock_full_name}</span>
        </td>
        <td class="num">${s.shares}</td>
        <td>
          <div class="row-actions">
            <button
              class="btn btn-secondary btn-small"
              aria-label="Edit ${s.stock_code}"
              @click=${() => this.startEdit(s)}
            >
              Edit
            </button>
          </div>
        </td>
      </tr>
    `;
  }

  private editRow(s: Stock): unknown {
    const blocker = this.codeError ?? this.nameError ?? this.sharesError;
    return html`
      <tr class="editing">
        <td colspan="3">
          <div class="edit-grid cols-3">
            <label class="field"
              ><span>Code<em class="req">*</em></span>
              <input
                aria-label="Code"
                .value=${this.editStockCode}
                @input=${(e: Event) =>
                  this.onEditInput((v) => (this.editStockCode = v), e)}
                @keydown=${(e: KeyboardEvent) => this.onEditKey(s, e)}
              />
              ${
                this.errorFor(this.codeError)
                  ? html`<p class="field-error">${this.codeError}</p>`
                  : ''
              }
            </label>
            <label class="field"
              ><span>Name<em class="req">*</em></span>
              <input
                aria-label="Name"
                .value=${this.editStockName}
                @input=${(e: Event) =>
                  this.onEditInput((v) => (this.editStockName = v), e)}
                @keydown=${(e: KeyboardEvent) => this.onEditKey(s, e)}
              />
              ${
                this.errorFor(this.nameError)
                  ? html`<p class="field-error">${this.nameError}</p>`
                  : ''
              }
            </label>
            <label class="field"
              ><span>Shares<em class="req">*</em></span>
              <input
                aria-label="Shares"
                inputmode="decimal"
                .value=${this.editShares}
                @input=${(e: Event) =>
                  this.onEditInput((v) => (this.editShares = v), e)}
                @keydown=${(e: KeyboardEvent) => this.onEditKey(s, e)}
              />
              ${
                this.errorFor(this.sharesError)
                  ? html`<p class="field-error">${this.sharesError}</p>`
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
                @keydown=${(e: KeyboardEvent) => this.onEditKey(s, e)}
                placeholder="Optional"
            /></label>
            <div class="edit-buttons">
              <button
                class="btn btn-primary btn-small"
                ?disabled=${!this.canSaveEdit}
                title=${blocker ?? 'Save changes'}
                @click=${() => this.saveEdit(s)}
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

if (
  typeof customElements !== 'undefined' &&
  !customElements.get('stock-list')
) {
  customElements.define(
    'stock-list',
    StockList as unknown as CustomElementConstructor,
  );
}
