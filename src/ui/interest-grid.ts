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

import { byDate, dateSortHeader } from './sort-header.js';

const Base =
  typeof HTMLElement !== 'undefined'
    ? LitElement
    : (class {} as unknown as typeof LitElement);
const logger = new ExtensionLogger('wealthflow');

/**
 * The months of an FY that actually hold an entry, in calendar order. Blank
 * months are not rendered: a 12-row matrix of mostly-empty inputs is noise, and
 * the Log interest form is how a month gets added. Kept pure so the rule is
 * testable without a DOM.
 */
export function monthsWithEntries(
  fy: string,
  banks: Pick<Bank, 'id'>[],
  entries: Pick<InterestEntry, 'bank_id' | 'date'>[],
): string[] {
  return fyMonths(fy).filter((m) =>
    entries.some((e) => {
      if (!banks.some((b) => b.id === e.bank_id)) return false;
      return monthKey(e.date) === m;
    }),
  );
}

/**
 * The months in the order the screen reads them: newest first by default, so
 * the year reads backwards from the months you are living in. Pure, because
 * `monthsWithEntries` above answers which months exist and this answers which
 * way they run — two different questions, kept apart so the first stays
 * testable without a DOM.
 */
export function orderMonths(months: string[], descending: boolean): string[] {
  return months
    .slice()
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 1) * (descending ? 1 : -1));
}

export class InterestGrid extends Base {
  static override styles =
    typeof HTMLElement !== 'undefined'
      ? ([sharedStyles, wealthflowStyles] as any)
      : [];
  finance: any = null;
  fy = '';
  banks: Bank[] = [];
  entries: InterestEntry[] = [];
  /**
   * Order of the month axis. Newest first by default, so the FY reads backwards
   * from the months you are living in. The rows are months, not entries, so this
   * is the grid's date order.
   */
  sortDesc = true;
  error = '';
  fieldError = '';

  /**
   * FY entries on screen, for the host's collapsed-section badge. Read after
   * the child has loaded, never during a render: the entries start empty.
   */
  get rowCount(): number {
    return this.entries.length;
  }

  private sortByDate(): void {
    this.sortDesc = !this.sortDesc;
    (this as any).requestUpdate?.();
  }

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

  /**
   * Land the cursor ready to type. The current month's cell when the FY has one
   * — otherwise the latest month that does, since blank months are not rendered.
   */
  focusCurrentMonth(): void {
    const root = (this as any).renderRoot as ShadowRoot | undefined;
    if (!root) return;
    const now = new Date();
    const mk = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const current = root.querySelector(
      `input[data-month="${mk}"]`,
    ) as HTMLElement | null;
    if (current) {
      current.focus?.();
      return;
    }
    const months = Array.from(
      root.querySelectorAll<HTMLElement>('input[data-month]'),
    )
      .map((el) => el.dataset.month ?? '')
      .filter((m) => m !== '');
    const fallback = months.sort().pop();
    if (fallback)
      (
        root.querySelector(
          `input[data-month="${fallback}"]`,
        ) as HTMLElement | null
      )?.focus?.();
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

  /** Cell amounts are edited in place; notes/date/bank go through the form. */
  private requestEdit(bankId: number, month: string): void {
    const entry = this.entryFor(bankId, month);
    if (!entry) return;
    this.dispatchEvent(
      new CustomEvent('interest-edit-request', {
        detail: { entry },
        bubbles: true,
        composed: true,
      }),
    );
  }

  override render(): unknown {
    if (typeof HTMLElement === 'undefined') return html``;
    if (!this.fy)
      return html`<p class="empty-state">Select a financial year.</p>`;
    const model = interestGridModel(this.fy, this.banks, this.entries);
    const months = orderMonths(
      monthsWithEntries(this.fy, this.banks, this.entries),
      this.sortDesc,
    );
    return html`
      <div class="log-filters">
        <span class="rate-badge">
          ${this.banks.length} ${this.banks.length === 1 ? 'bank' : 'banks'} ·
          ${this.entries.length}
          ${this.entries.length === 1 ? 'entry' : 'entries'} this FY
        </span>
      </div>
      ${
        this.error
          ? html`<p class="field-error" role="alert" aria-live="polite">
              Error: ${this.error}
            </p>`
          : ''
      }
      ${
        this.fieldError
          ? html`<p class="field-error" role="alert" aria-live="polite">
              ${this.fieldError}
            </p>`
          : ''
      }
      ${
        this.banks.length === 0
          ? html`<p class="empty-state">
              No active banks — add one in Banks, then fill the monthly grid
              here.
            </p>`
          : months.length === 0
            ? html`<p class="empty-state">
                No interest logged this FY yet — use “Log interest” to add the
                first entry.
              </p>`
            : html`<div class="table-wrap">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th
                        scope="col"
                        aria-sort=${this.sortDesc ? 'descending' : 'ascending'}
                      >
                        ${dateSortHeader('Month', this.sortDesc, () =>
                          this.sortByDate(),
                        )}
                      </th>
                      ${this.banks.map(
                        (b) =>
                          html`<th scope="col" class="num">${b.bank_code}</th>`,
                      )}
                      <th scope="col" class="num">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${months.map(
                      (m) => html`
                        <tr>
                          <td>${monthLabel(m)}</td>
                          ${this.banks.map((b) => {
                            const hit = this.entryFor(b.id, m);
                            return html`<td>
                              <div class="cell-edit">
                                <input
                                  data-month=${m}
                                  data-bank=${b.id}
                                  inputmode="decimal"
                                  aria-label="${b.bank_code} ${monthLabel(m)}"
                                  .value=${hit ? String(hit.amount) : ''}
                                  placeholder="0.00"
                                  @change=${(e: Event) =>
                                    this.onCell(
                                      b.id,
                                      m,
                                      (e.target as HTMLInputElement).value,
                                    )}
                                />
                                ${
                                  hit
                                    ? html`<button
                                        class="btn btn-secondary btn-small"
                                        aria-label="Edit ${b.bank_code} entry for ${monthLabel(m)}"
                                        title="Edit date, bank or notes for this entry"
                                        @click=${() => this.requestEdit(b.id, m)}
                                      >
                                        Edit
                                      </button>`
                                    : ''
                                }
                              </div>
                            </td>`;
                          })}
                          <td class="num">
                            ${formatAUD(model.rowTotals[m] ?? 0)}
                          </td>
                        </tr>
                      `,
                    )}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td class="total-label">Total</td>
                      ${this.banks.map(
                        (b) =>
                          html`<td class="num">
                            ${formatAUD(model.colTotals[b.id] ?? 0)}
                          </td>`,
                      )}
                      <td class="num">${formatAUD(model.grandTotal)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>`
      }
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
