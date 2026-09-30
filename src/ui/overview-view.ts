import { LitElement, html } from 'lit';
import { sharedStyles } from '../styles/shared-styles.js';
import { wealthflowStyles } from '../styles/wealthflow-styles.js';
import { ExtensionLogger } from 'finance-logger';
import { formatAUD } from '../utils/format.js';
import { monthLabel } from '../utils/finance-year.js';
import type { DividendEntry } from '../dao/dividends.js';
import type { InterestEntry } from '../dao/interest-entries.js';
import type { SuperEntry } from '../dao/super-entries.js';
import { superKindLabel } from '../dao/super-entries.js';
import type { DividendForm } from './dividend-form.js';
import type { InterestForm } from './interest-form.js';
import type { InterestGrid } from './interest-grid.js';
import type { SuperForm } from './super-form.js';
import type { OverviewSummary } from '../services/public-wealth-adapter.js';
import type {
  InterestRepeatOutcome,
  InterestRepeatPlan,
} from '../services/bank-service.js';
const Base =
  typeof HTMLElement !== 'undefined'
    ? LitElement
    : (class {} as unknown as typeof LitElement);
const logger = new ExtensionLogger('wealthflow');

export class OverviewView extends Base {
  static override styles =
    typeof HTMLElement !== 'undefined'
      ? ([sharedStyles, wealthflowStyles] as any)
      : [];
  finance: any = null;
  fy = '';
  summary: OverviewSummary | null = null;
  error = '';
  showDividendForm = false;
  showInterestForm = false;
  showSuperForm = false;
  superEntries: SuperEntry[] = [];
  /** Outcome of the last "copy from last month" run, stated in the section. */
  copyNotice = '';
  copying = false;

  async setFinance(f: any): Promise<void> {
    this.finance = f;
    await this.reload();
  }

  async reload(): Promise<void> {
    if (!this.finance || !this.fy) return;
    this.error = '';
    try {
      // Prefer the public service surface (what Tax/dashboard consume); fall back to direct DAO aggregation.
      let summary: OverviewSummary | null = null;
      try {
        // Params go as an array: the host spreads them into positional args, so
        // a bare string would arrive as one character per argument.
        summary = (await this.finance.services?.invoke(
          'wealthflow',
          'getOverviewSummary',
          [this.fy],
        )) as OverviewSummary | null;
      } catch {
        summary = null;
      }
      // A summary for a different year means the call was mis-shaped, and its
      // zeros would look like an empty year. Fall through and aggregate direct.
      if (summary && summary.financialYear !== this.fy) summary = null;
      if (!summary) {
        const { listBanks } = await import('../dao/banks.js');
        const { getInterestTotals } =
          await import('../services/bank-service.js');
        const { listStocks } = await import('../dao/stocks.js');
        const { getDividendTotals } =
          await import('../services/stock-service.js');
        const { listSuperEntries } = await import('../dao/super-entries.js');
        const { getSuperTotals } = await import('../services/super-service.js');
        const banks = await listBanks(this.finance, { status: 'all' });
        const stocks = await listStocks(this.finance, { status: 'all' });
        const [interest, dividends, super_] = await Promise.all([
          getInterestTotals(this.finance, banks, this.fy),
          getDividendTotals(this.finance, stocks, this.fy),
          getSuperTotals(this.finance, this.fy),
        ]);
        const round2 = (n: number) => Math.round(n * 100) / 100;
        summary = {
          financialYear: this.fy,
          dividends,
          interest,
          super: super_,
          combined: {
            gross: round2(dividends.gross + interest.total),
            franking: round2(dividends.franking),
          },
        };
        this.superEntries = await listSuperEntries(this.finance, {
          financeYear: this.fy,
        });
      } else {
        const { listSuperEntries } = await import('../dao/super-entries.js');
        this.superEntries = await listSuperEntries(this.finance, {
          financeYear: this.fy,
        });
      }
      this.summary = summary;
    } catch (e: any) {
      logger.error('overview reload failed:', e);
      this.error = String(e?.message || e);
    }
    (this as any).requestUpdate?.();
    await this.pushToChildren();
  }

  /** Forward finance + fy to embedded grids, logs, and toggleable forms. */
  private async pushToChildren(): Promise<void> {
    try {
      await (this as any).updateComplete;
    } catch {
      /* non-Lit */
    }
    const root = (this as any).renderRoot as ShadowRoot | undefined;
    if (!root || !this.finance) return;
    for (const sel of [
      'dividend-form',
      'interest-form',
      'super-form',
      'interest-grid',
      'dividend-log',
    ]) {
      const el = root.querySelector(sel) as any;
      if (!el || typeof el.setFinance !== 'function') continue;
      el.finance = this.finance;
      try {
        el.fy = this.fy;
      } catch {
        /* ignore */
      }
      try {
        await el.setFinance(this.finance);
      } catch {
        /* child surfaces its own errors */
      }
    }
  }

  private toggleForm(which: 'dividends' | 'interest' | 'super'): void {
    if (which === 'dividends') {
      this.showDividendForm = !this.showDividendForm;
      (this as any).requestUpdate?.();
      if (this.showDividendForm) void this.openForm('dividend-form');
      return;
    }
    if (which === 'super') {
      this.showSuperForm = !this.showSuperForm;
      (this as any).requestUpdate?.();
      if (this.showSuperForm) void this.openForm('super-form');
      return;
    }
    this.showInterestForm = !this.showInterestForm;
    this.copyNotice = '';
    (this as any).requestUpdate?.();
    if (this.showInterestForm) void this.openForm('interest-form');
  }

  /** One line saying what the repeat did, in the section's own terms. */
  private describeCopy(
    plan: InterestRepeatPlan,
    res: InterestRepeatOutcome,
  ): string {
    const from = monthLabel(plan.sourceMonth as string);
    const to = monthLabel(plan.targetMonth as string);
    if (res.copied.length === 0)
      return `Nothing repeated from ${from} — no bank could take a ${to} entry.`;
    const n = res.copied.length;
    let out = `Repeated ${n} ${n === 1 ? 'entry' : 'entries'} from ${from} to ${to}.`;
    if (res.skipped.length > 0) {
      out += ` Skipped ${res.skipped.map((s) => s.bank_code).join(', ')}.`;
    }
    return out;
  }

  /** Confirmation wording, matching the delete prompt's level of detail. */
  private confirmCopy(plan: InterestRepeatPlan): boolean {
    if (typeof confirm === 'undefined') return true;
    const from = monthLabel(plan.sourceMonth as string);
    const to = monthLabel(plan.targetMonth as string);
    const one = plan.rows[0]!;
    const question =
      plan.rows.length === 1
        ? `Repeat ${one.bank_code} ${formatAUD(one.amount)} from ${from} to ${to}?`
        : `Repeat ${plan.rows.length} entries from ${from} to ${to}?`;
    return confirm(question);
  }

  /**
   * Repeat the newest month of interest across every bank that paid in it. The
   * form is not involved: this is a section-level action, so it works without
   * opening anything. Nothing is written until the user confirms, and the
   * result is stated under the header.
   */
  private async copyLastMonth(): Promise<void> {
    if (this.copying || !this.finance) return;
    this.copying = true;
    this.copyNotice = '';
    (this as any).requestUpdate?.();
    try {
      const { listBanks } = await import('../dao/banks.js');
      const { planInterestMonthRepeat, applyInterestMonthRepeat } =
        await import('../services/bank-service.js');
      const banks = await listBanks(this.finance, { status: 'all' });
      const plan = await planInterestMonthRepeat(this.finance, banks);
      if (plan.sourceMonth == null || plan.targetMonth == null) {
        this.copyNotice = 'Nothing to repeat — no interest logged yet.';
        return;
      }
      if (plan.rows.length === 0) {
        this.copyNotice = `Nothing to repeat from ${monthLabel(plan.sourceMonth)}.`;
        return;
      }
      if (!this.confirmCopy(plan)) return;
      const res = await applyInterestMonthRepeat(this.finance, plan);
      this.copyNotice = this.describeCopy(plan, res);
    } catch (e: any) {
      logger.error('interest copy failed:', e);
      this.copyNotice = `Could not repeat last month: ${String(e?.message || e)}`;
    } finally {
      this.copying = false;
      (this as any).requestUpdate?.();
    }
    await this.reload();
  }

  /**
   * Give a freshly rendered form its finance + reference data, then hand it the
   * row to edit (null for a blank create form). Awaits the render first so the
   * element exists, otherwise a just-toggled form has no banks/stocks to offer.
   */
  private async openForm(
    tag: 'dividend-form' | 'interest-form' | 'super-form',
    entry: DividendEntry | InterestEntry | SuperEntry | null = null,
  ): Promise<void> {
    try {
      await (this as any).updateComplete;
    } catch {
      /* non-Lit */
    }
    await this.pushToChildren();
    const form = (this as any).renderRoot?.querySelector(tag) as
      DividendForm | InterestForm | SuperForm | null;
    form?.editEntry(entry as never);
  }

  /** A row asked to be edited: open that section's form on that record. */
  private editRequestHandler(
    tag: 'dividend-form' | 'interest-form' | 'super-form',
    flag: 'showDividendForm' | 'showInterestForm' | 'showSuperForm',
  ): (e: Event) => Promise<void> {
    return async (e: Event): Promise<void> => {
      const entry = (e as CustomEvent).detail?.entry as
        DividendEntry | InterestEntry | SuperEntry | undefined;
      if (!entry) return;
      this[flag] = true;
      (this as any).requestUpdate?.();
      await this.openForm(tag, entry);
    };
  }

  private readonly _onDividendEditRequest = this.editRequestHandler(
    'dividend-form',
    'showDividendForm',
  );
  private readonly _onInterestEditRequest = this.editRequestHandler(
    'interest-form',
    'showInterestForm',
  );
  private readonly _onSuperEditRequest = this.editRequestHandler(
    'super-form',
    'showSuperForm',
  );

  /** `wealthflow.add-interest` lands the cursor on this month's cell. */
  async focusInterest(): Promise<void> {
    try {
      await (this as any).updateComplete;
    } catch {
      /* non-Lit */
    }
    const grid = (this as any).renderRoot?.querySelector(
      'interest-grid',
    ) as InterestGrid | null;
    grid?.focusCurrentMonth();
  }

  /** `wealthflow.add-dividend` opens the log form ready to type. */
  async openDividendForm(): Promise<void> {
    this.showDividendForm = true;
    (this as any).requestUpdate?.();
    await this.openForm('dividend-form');
  }

  override connectedCallback(): void {
    (super.connectedCallback as (() => void) | undefined)?.call(this);
    this.addEventListener(
      'dividend-edit-request',
      this._onDividendEditRequest as EventListener,
    );
    this.addEventListener(
      'interest-edit-request',
      this._onInterestEditRequest as EventListener,
    );
    this.addEventListener(
      'super-edit-request',
      this._onSuperEditRequest as EventListener,
    );
    this.addEventListener(
      'dividend-create',
      this._onFormChanged as EventListener,
    );
    this.addEventListener(
      'dividend-edit',
      this._onFormChanged as EventListener,
    );
    this.addEventListener(
      'dividend-delete',
      this._onFormChanged as EventListener,
    );
    this.addEventListener(
      'interest-create',
      this._onFormChanged as EventListener,
    );
    this.addEventListener(
      'interest-edit',
      this._onFormChanged as EventListener,
    );
    this.addEventListener(
      'interest-delete',
      this._onFormChanged as EventListener,
    );
    this.addEventListener('super-create', this._onFormChanged as EventListener);
    this.addEventListener('super-edit', this._onFormChanged as EventListener);
    this.addEventListener('super-delete', this._onFormChanged as EventListener);
    this.addEventListener(
      'interest-form-close',
      this._onInterestFormClose as EventListener,
    );
    this.addEventListener(
      'dividend-form-close',
      this._onDividendFormClose as EventListener,
    );
    this.addEventListener(
      'super-form-close',
      this._onSuperFormClose as EventListener,
    );
  }

  override disconnectedCallback(): void {
    this.removeEventListener(
      'dividend-edit-request',
      this._onDividendEditRequest as EventListener,
    );
    this.removeEventListener(
      'interest-edit-request',
      this._onInterestEditRequest as EventListener,
    );
    this.removeEventListener(
      'super-edit-request',
      this._onSuperEditRequest as EventListener,
    );
    this.removeEventListener(
      'dividend-create',
      this._onFormChanged as EventListener,
    );
    this.removeEventListener(
      'dividend-edit',
      this._onFormChanged as EventListener,
    );
    this.removeEventListener(
      'dividend-delete',
      this._onFormChanged as EventListener,
    );
    this.removeEventListener(
      'interest-create',
      this._onFormChanged as EventListener,
    );
    this.removeEventListener(
      'interest-edit',
      this._onFormChanged as EventListener,
    );
    this.removeEventListener(
      'interest-delete',
      this._onFormChanged as EventListener,
    );
    this.removeEventListener(
      'super-create',
      this._onFormChanged as EventListener,
    );
    this.removeEventListener(
      'super-edit',
      this._onFormChanged as EventListener,
    );
    this.removeEventListener(
      'super-delete',
      this._onFormChanged as EventListener,
    );
    this.removeEventListener(
      'interest-form-close',
      this._onInterestFormClose as EventListener,
    );
    this.removeEventListener(
      'dividend-form-close',
      this._onDividendFormClose as EventListener,
    );
    this.removeEventListener(
      'super-form-close',
      this._onSuperFormClose as EventListener,
    );
    (super.disconnectedCallback as (() => void) | undefined)?.call(this);
  }

  private _onFormChanged = (): void => {
    // Embedded log forms bubble their writes; refresh cards (footer refreshes via orchestrator).
    void this.reload();
  };

  /** The dividend form is done with itself — save or delete — so fold it away. */
  private _onDividendFormClose = (): void => {
    if (!this.showDividendForm) return;
    this.showDividendForm = false;
    (this as any).requestUpdate?.();
  };

  /** The interest form is done with itself — save or copy — so fold it away. */
  private _onInterestFormClose = (): void => {
    if (!this.showInterestForm) return;
    this.showInterestForm = false;
    (this as any).requestUpdate?.();
  };

  /** The super form is done with itself — save or delete — so fold it away. */
  private _onSuperFormClose = (): void => {
    if (!this.showSuperForm) return;
    this.showSuperForm = false;
    (this as any).requestUpdate?.();
  };

  /** Editing happens in the collapsible super form, which this asks to open. */
  private requestSuperEdit(entry: SuperEntry): void {
    this.dispatchEvent(
      new CustomEvent('super-edit-request', {
        detail: { entry },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private async deleteSuperEntry(entry: SuperEntry): Promise<void> {
    if (
      typeof confirm !== 'undefined' &&
      !confirm(
        `Delete ${superKindLabel(entry.kind)} ${formatAUD(Number(entry.amount))} on ${entry.date}?`,
      )
    )
      return;
    try {
      const { deleteSuperEntry } = await import('../dao/super-entries.js');
      await deleteSuperEntry(this.finance, entry.id);
      this.dispatchEvent(
        new CustomEvent('super-delete', {
          detail: { id: entry.id },
          bubbles: true,
          composed: true,
        }),
      );
      await this.reload();
    } catch (e: any) {
      logger.error('super delete failed:', e);
      this.error = String(e?.message || e);
      (this as any).requestUpdate?.();
    }
  }

  private go(view: string): void {
    this.dispatchEvent(
      new CustomEvent('wealthflow-navigate', {
        detail: { view },
        bubbles: true,
        composed: true,
      }),
    );
  }

  override render(): unknown {
    if (typeof HTMLElement === 'undefined') return html``;
    const s = this.summary;
    // `sg` is optional on the wire so a summary served by an older build (or a
    // hand-rolled one) still renders instead of throwing mid-template.
    const sgTotal = s?.super?.sg?.total ?? 0;
    return html`
      <div class="order-stack">
        ${
          this.error
            ? html`<div class="section flush">
                <div class="section-body">
                  <p class="field-error">Error: ${this.error}</p>
                </div>
              </div>`
            : ''
        }
        ${
          !s
            ? html`<div class="section flush">
                <div class="section-body"><p class="muted">Loading…</p></div>
              </div>`
            : html`
                <!-- Combined: the FY answer, so it leads; the two sections
                     below are where its parts come from. -->
                <div class="section flush">
                  <div class="section-header">
                    <h3 class="section-title">
                      Combined taxable — FY ${this.fy}
                    </h3>
                  </div>
                  <div class="section-body">
                    <div class="stat-grid cols-2">
                      <div class="stat">
                        <div class="stat-label">Taxable gross</div>
                        <div class="stat-value">
                          ${formatAUD(s.combined.gross)}
                        </div>
                        <div class="stat-note">
                          Dividends ${formatAUD(s.dividends.gross)} + interest
                          ${formatAUD(s.interest.total)}
                        </div>
                      </div>
                      <div class="stat">
                        <div class="stat-label">Franking credits</div>
                        <div class="stat-value">
                          ${formatAUD(s.combined.franking)}
                        </div>
                        <div class="stat-note">
                          Dividends only — interest carries no franking
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Dividends -->
                <div class="section flush">
                  <div class="section-header">
                    <h3 class="section-title">Dividends — FY ${this.fy}</h3>
                    <div class="header-actions">
                      <button
                        class="btn btn-secondary btn-small"
                        @click=${() => this.toggleForm('dividends')}
                      >
                        ${this.showDividendForm ? 'Hide form' : 'Log dividend'}
                      </button>
                    </div>
                  </div>
                  <div class="section-body">
                    ${
                      this.showDividendForm
                        ? html`<dividend-form></dividend-form>`
                        : ''
                    }
                    <dividend-log></dividend-log>
                  </div>
                </div>

                <!-- Interest -->
                <div class="section flush">
                  <div class="section-header">
                    <h3 class="section-title">Interest — FY ${this.fy}</h3>
                    <div class="header-actions">
                      <button
                        class="btn btn-secondary btn-small"
                        @click=${() => this.copyLastMonth()}
                        ?disabled=${this.copying}
                      >
                        ${this.copying ? 'Repeating…' : 'Copy from last month'}
                      </button>
                      <button
                        class="btn btn-secondary btn-small"
                        @click=${() => this.toggleForm('interest')}
                      >
                        ${this.showInterestForm ? 'Hide form' : 'Log interest'}
                      </button>
                    </div>
                  </div>
                  <div class="section-body">
                    ${
                      this.copyNotice
                        ? html`<p class="notice" role="status">
                            ${this.copyNotice}
                          </p>`
                        : ''
                    }
                    ${
                      this.showInterestForm
                        ? html`<interest-form></interest-form>`
                        : ''
                    }
                    <interest-grid></interest-grid>
                  </div>
                </div>

                <!-- Superannuation -->
                <div class="section flush">
                  <div class="section-header">
                    <h3 class="section-title">
                      Superannuation — FY ${this.fy}
                    </h3>
                    <div class="header-actions">
                      <button
                        class="btn btn-secondary btn-small"
                        @click=${() => this.toggleForm('super')}
                      >
                        ${this.showSuperForm ? 'Hide form' : 'Log super'}
                      </button>
                    </div>
                  </div>
                  <div class="section-body">
                    ${
                      s.super.balance
                        ? html`<p class="muted">
                            Latest balance ${formatAUD(s.super.balance.amount)}
                            as at ${s.super.balance.date}
                          </p>`
                        : ''
                    }
                    ${
                      this.superEntries.length === 0
                        ? html`<p class="muted">
                            No super entries this FY yet — log a balance, a
                            private contribution, or an SG contribution.
                          </p>`
                        : html`<div class="table-wrap" style="margin-top:12px">
                            <table class="hist-table">
                              <thead>
                                <tr>
                                  <th scope="col">Date</th>
                                  <th scope="col">Entry</th>
                                  <th scope="col" class="num">Amount</th>
                                  <th scope="col" class="num">Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                ${this.superEntries.map(
                                  (e) =>
                                    html`<tr>
                                      <td>${e.date}</td>
                                      <td>${superKindLabel(e.kind)}</td>
                                      <td class="num money">
                                        ${formatAUD(Number(e.amount))}
                                      </td>
                                      <td class="actions">
                                        <button
                                          class="btn btn-secondary btn-small"
                                          type="button"
                                          @click=${() => this.requestSuperEdit(e)}
                                        >
                                          Edit
                                        </button>
                                        <button
                                          class="btn btn-secondary btn-small"
                                          type="button"
                                          @click=${() => this.deleteSuperEntry(e)}
                                        >
                                          Delete
                                        </button>
                                      </td>
                                    </tr>`,
                                )}
                              </tbody>
                              <tfoot>
                                <tr>
                                  <td colspan="2">
                                    Private contributions (FY)
                                  </td>
                                  <td class="num money">
                                    ${formatAUD(s.super.contributions.total)}
                                  </td>
                                  <td></td>
                                </tr>
                                <tr>
                                  <td colspan="2">SG contributions (FY)</td>
                                  <td class="num money">
                                    ${formatAUD(sgTotal)}
                                  </td>
                                  <td></td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>`
                    }
                    ${this.showSuperForm ? html`<super-form></super-form>` : ''}
                  </div>
                </div>
              `
        }
      </div>
    `;
  }
}

if (
  typeof customElements !== 'undefined' &&
  !customElements.get('overview-view')
) {
  customElements.define(
    'overview-view',
    OverviewView as unknown as CustomElementConstructor,
  );
}
