import { LitElement, html } from 'lit';
import { sharedStyles } from '../styles/shared-styles.js';
import { wealthflowStyles } from '../styles/wealthflow-styles.js';
import { ExtensionLogger } from 'finance-logger';
import { formatAUD } from '../utils/format.js';
import {
  fyMonths,
  monthKey,
  monthEnd,
  monthLabel,
} from '../utils/finance-year.js';
import { interestGridModel } from '../services/bank-service.js';
import { listBanks, type Bank } from '../dao/banks.js';
import {
  listInterestEntries,
  createInterestEntry,
  updateInterestEntry,
  type InterestEntry,
} from '../dao/interest-entries.js';

const Base =
  typeof HTMLElement !== 'undefined'
    ? LitElement
    : (class {} as unknown as typeof LitElement);
const logger = new ExtensionLogger('wealthflow');

export class InterestGrid extends Base {
  static override styles =
    typeof HTMLElement !== 'undefined'
      ? ([sharedStyles, wealthflowStyles] as any)
      : [];
  finance: any = null;
  fy = '';
  banks: Bank[] = [];
  entries: InterestEntry[] = [];
  error = '';
  fieldError = '';

  async setFinance(f: any): Promise<void> {
    this.finance = f;
    await this.reload();
  }

  async reload(): Promise<void> {
    if (!this.finance?.db || !this.fy) return;
    this.error = '';
    this.fieldError = '';
    try {
      this.banks = await listBanks(this.finance, { status: 'active' });
      this.entries = await listInterestEntries(this.finance, {
        financeYear: this.fy,
      });
    } catch (e: any) {
      logger.error('interest grid reload failed:', e);
      this.error = String(e?.message || e);
    }
    (this as any).requestUpdate?.();
  }

  focusCurrentMonth(): void {
    const root = (this as any).renderRoot as ShadowRoot | undefined;
    const now = new Date();
    const mk = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const input = root?.querySelector(
      `input[data-month="${mk}"]`,
    ) as HTMLElement | null;
    input?.focus?.();
  }

  private entryFor(bankId: number, month: string): InterestEntry | undefined {
    return this.entries.find(
      (e) => e.bank_id === bankId && monthKey(e.date) === month,
    );
  }

  private async onCell(
    bankId: number,
    month: string,
    raw: string,
  ): Promise<void> {
    this.fieldError = '';
    const text = raw.trim();
    if (text === '') return; // empty edit = no-op (delete via the single-entry form)
    const amount = Number(text);
    if (!Number.isFinite(amount) || amount < 0) {
      this.fieldError = 'Enter an amount ≥ 0.';
      (this as any).requestUpdate?.();
      return;
    }
    try {
      const existing = this.entryFor(bankId, month);
      if (existing) {
        if (Number(existing.amount) === amount) return;
        await updateInterestEntry(this.finance, existing.id, { amount });
        this.dispatchEvent(
          new CustomEvent('interest-edit', {
            detail: { id: existing.id },
            bubbles: true,
            composed: true,
          }),
        );
      } else {
        const row = await createInterestEntry(
          this.finance,
          {
            bank_id: bankId,
            date: monthEnd(month),
            amount,
            finance_year: this.fy,
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
      }
      await this.reload();
    } catch (e: any) {
      logger.error('interest cell write failed:', e);
      this.fieldError = String(e?.message || e);
      (this as any).requestUpdate?.();
    }
  }

  override render(): unknown {
    if (typeof HTMLElement === 'undefined') return html``;
    if (!this.fy)
      return html`<div class="section"><p>Select a financial year.</p></div>`;
    const model = interestGridModel(this.fy, this.banks, this.entries);
    const months = fyMonths(this.fy);
    return html`
      <div class="section">
        <h3>Interest — FY ${this.fy}</h3>
        ${this.error ? html`<p class="field-error">Error: ${this.error}</p>` : ''}
        ${this.fieldError ? html`<p class="field-error">${this.fieldError}</p>` : ''}
        ${
          this.banks.length === 0
            ? html`<p>
                No active banks — add one above, then log monthly interest here.
              </p>`
            : html`<div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Month</th>
                      ${this.banks.map((b) => html`<th>${b.name}</th>`)}
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${months.map(
                      (m) =>
                        html`<tr>
                          <td>${monthLabel(m)}</td>
                          ${this.banks.map((b) => {
                            const hit = this.entryFor(b.id, m);
                            return html`<td>
                              <input
                                data-month=${m}
                                data-bank=${b.id}
                                inputmode="decimal"
                                .value=${hit ? String(hit.amount) : ''}
                                placeholder="0.00"
                                @change=${(e: Event) => this.onCell(b.id, m, (e.target as HTMLInputElement).value)}
                              />
                            </td>`;
                          })}
                          <td>${formatAUD(model.rowTotals[m] ?? 0)}</td>
                        </tr>`,
                    )}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>Total</td>
                      ${this.banks.map((b) => html`<td>${formatAUD(model.colTotals[b.id] ?? 0)}</td>`)}
                      <td><strong>${formatAUD(model.grandTotal)}</strong></td>
                    </tr>
                  </tfoot>
                </table>
              </div>`
        }
      </div>
    `;
  }
}

if (
  typeof customElements !== 'undefined' &&
  !customElements.get('interest-grid')
) {
  customElements.define(
    'interest-grid',
    InterestGrid as unknown as CustomElementConstructor,
  );
}
