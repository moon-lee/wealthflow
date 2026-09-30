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
import { byDate, dateSortHeader } from './sort-header.js';
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

/** The three log sections that fold away. Combined taxable never does. */
type Collapsible = 'dividends' | 'interest' | 'super';

/** Superannuation pages at a fixed 12 rows so the log stays scannable. */
const SUPER_PAGE_SIZE = 12;

/**
 * What a folded section's header calls its records, as [one, many]. The badge
 * has to use the same noun the open section uses, or folding a section renames
 * its contents. Spelled out rather than derived: "entries" does not singularise
 * by dropping a character.
 */
const COUNT_NOUN: Record<Collapsible, [string, string]> = {
  dividends: ['receipt', 'receipts'],
  interest: ['entry', 'entries'],
  super: ['entry', 'entries'],
};

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
  /**
   * FY record count per section, for the folded-section badge. Captured after
   * the children have loaded rather than read during a render, because the
   * children only fill in during the same reload that triggers the render.
   */
  rowCounts: Record<Collapsible, number> = {
    dividends: 0,
    interest: 0,
    super: 0,
  };
  /** Zero-based page of the superannuation log; clamped on every reload. */
  superPage = 0;
  /** Date order for the super log. Newest first, the order a log is read in. */
  superSortDesc = true;
  /** Which log sections are folded away, per section so one stays open. */
  collapsed: Record<Collapsible, boolean> = {
    dividends: false,
    interest: false,
    super: false,
  };
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
        // A shorter FY, or a deleted row, can leave the cursor past the end.
        this.superPage = Math.min(this.superPage, this.superPages - 1);
      }
      this.summary = summary;
    } catch (e: any) {
      logger.error('overview reload failed:', e);
      this.error = String(e?.message || e);
    }
    (this as any).requestUpdate?.();
    await this.pushToChildren();
    this.captureRowCounts();
    (this as any).requestUpdate?.();
  }

  /**
   * Take each section's record count for the folded-section badge. Runs after
   * the children have settled, and re-renders, because the first pass has
   * already been committed by the time their data arrives.
   */
  private captureRowCounts(): void {
    const root = (this as any).renderRoot as ShadowRoot | undefined;
    const count = (sel: string): number => {
      const el = root?.querySelector(sel) as { rowCount?: number } | null;
      return typeof el?.rowCount === 'number' ? el.rowCount : 0;
    };
    this.rowCounts = {
      dividends: count('dividend-log'),
      interest: count('interest-grid'),
      super: this.superEntries.length,
    };
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

  /**
   * Show/hide one log section. The header bar is the click target and the title
   * inside it is a real button, so the control is reachable by keyboard and
   * carries its own expanded state — the same shape as expenseflow's section
   * headers, so the two overview screens read as one app.
   */
  private toggleSection(which: Collapsible): void {
    this.collapsed = { ...this.collapsed, [which]: !this.collapsed[which] };
    (this as any).requestUpdate?.();
  }

  /**
   * Pager for the superannuation log. Nothing at all when the FY fits on one
   * page — a disabled Next on a 12-row FY is a control that can only lie.
   */
  private renderSuperPager(): unknown {
    const pages = this.superPages;
    if (pages <= 1) return '';
    const n = this.superEntries.length;
    return html`
      <div class="table-pager">
        <span class="muted">
          Page ${this.superPage + 1} of ${pages} · ${n}
          ${n === 1 ? 'entry' : 'entries'}
        </span>
        <div class="pager-actions">
          <button
            class="btn btn-secondary btn-small"
            type="button"
            ?disabled=${this.superPage === 0}
            @click=${() => this.gotoSuperPage(this.superPage - 1)}
          >
            Previous
          </button>
          <button
            class="btn btn-secondary btn-small"
            type="button"
            ?disabled=${this.superPage >= pages - 1}
            @click=${() => this.gotoSuperPage(this.superPage + 1)}
          >
            Next
          </button>
        </div>
      </div>
    `;
  }

  /**
   * The record count a folded section keeps in its header. Only rendered while
   * folded: while the section is open its own body already states the count, and
   * saying it twice on one screen reads as a mistake.
   */
  private countBadge(which: Collapsible): unknown {
    if (this.collapsed[which] !== true) return '';
    const n = this.rowCounts[which] ?? 0;
    const [one, many] = COUNT_NOUN[which];
    return html`<span class="section-badge rows-badge"
      >${n} ${n === 1 ? one : many}</span
    >`;
  }

  /** Total pages of the superannuation log; always at least one. */
  private get superPages(): number {
    return Math.max(1, Math.ceil(this.superEntries.length / SUPER_PAGE_SIZE));
  }

  /**
   * The rows for the current page, in the order the Date header claims. Newest
   * first by default: this log is appended to, so page 1 has to be what you most
   * recently added — ascending order would bury a new entry on the last page.
   */
  private get superPageRows(): SuperEntry[] {
    const start = this.superPage * SUPER_PAGE_SIZE;
    return this.superEntries
      .slice()
      .sort(byDate(this.superSortDesc))
      .slice(start, start + SUPER_PAGE_SIZE);
  }

  /** Flip the date order and return to the first page: page 3 of the old order
   *  is an arbitrary window on the new one, and landing mid-list is disorienting. */
  private sortSuperByDate(): void {
    this.superSortDesc = !this.superSortDesc;
    this.superPage = 0;
    (this as any).requestUpdate?.();
  }

  private gotoSuperPage(page: number): void {
    const next = Math.min(Math.max(0, page), this.superPages - 1);
    if (next === this.superPage) return;
    this.superPage = next;
    (this as any).requestUpdate?.();
  }

  /** The chevron + title that opens and closes a section. */
  private sectionToggle(which: Collapsible, text: string): unknown {
    const open = this.collapsed[which] !== true;
    return html`
      <button
        type="button"
        class="section-toggle"
        aria-expanded=${open ? 'true' : 'false'}
        aria-controls=${`wf-body-${which}`}
        title=${open ? 'Hide' : 'Show'}
        @click=${(e: Event) => {
          // The header bar also toggles; do not fire it twice.
          e.stopPropagation();
          this.toggleSection(which);
        }}
      >
        <span class="chevron" aria-hidden="true"></span>
        <span class="section-title">${text}</span>
      </button>
    `;
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
                  <div
                    class="section-header is-toggle"
                    @click=${() => this.toggleSection('dividends')}
                  >
                    ${this.sectionToggle(
                      'dividends',
                      `Dividends — FY ${this.fy}`,
                    )}
                    <div
                      class="header-actions"
                      @click=${(e: Event) => e.stopPropagation()}
                    >
                      ${this.countBadge('dividends')}
                      <button
                        class="btn btn-secondary btn-small"
                        @click=${() => this.toggleForm('dividends')}
                      >
                        ${this.showDividendForm ? 'Hide form' : 'Log dividend'}
                      </button>
                    </div>
                  </div>
                  <div
                    class="section-body"
                    id="wf-body-dividends"
                    ?hidden=${this.collapsed.dividends === true}
                  >
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
                  <div
                    class="section-header is-toggle"
                    @click=${() => this.toggleSection('interest')}
                  >
                    ${this.sectionToggle(
                      'interest',
                      `Interest — FY ${this.fy}`,
                    )}
                    <div
                      class="header-actions"
                      @click=${(e: Event) => e.stopPropagation()}
                    >
                      ${this.countBadge('interest')}
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
                  <div
                    class="section-body"
                    id="wf-body-interest"
                    ?hidden=${this.collapsed.interest === true}
                  >
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
                  <div
                    class="section-header is-toggle"
                    @click=${() => this.toggleSection('super')}
                  >
                    ${this.sectionToggle(
                      'super',
                      `Superannuation — FY ${this.fy}`,
                    )}
                    <div
                      class="header-actions"
                      @click=${(e: Event) => e.stopPropagation()}
                    >
                      ${this.countBadge('super')}
                      <button
                        class="btn btn-secondary btn-small"
                        @click=${() => this.toggleForm('super')}
                      >
                        ${this.showSuperForm ? 'Hide form' : 'Log super'}
                      </button>
                    </div>
                  </div>
                  <div
                    class="section-body"
                    id="wf-body-super"
                    ?hidden=${this.collapsed.super === true}
                  >
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
                                  <th
                                    scope="col"
                                    aria-sort=${
                                      this.superSortDesc
                                        ? 'descending'
                                        : 'ascending'
                                    }
                                  >
                                    ${dateSortHeader(
                                      'Date',
                                      this.superSortDesc,
                                      () => this.sortSuperByDate(),
                                    )}
                                  </th>
                                  <th scope="col">Entry</th>
                                  <th scope="col" class="num">Amount</th>
                                  <th scope="col" class="num">Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                ${this.superPageRows.map(
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
                                  <td class="total-label" colspan="2">
                                    Balance as at
                                    ${s.super.balance?.date ?? '—'}
                                  </td>
                                  <td class="num money">
                                    ${formatAUD(s.super.balance?.amount ?? 0)}
                                  </td>
                                  <td></td>
                                </tr>
                                <tr>
                                  <td class="total-label" colspan="2">
                                    Private contributions (FY)
                                  </td>
                                  <td class="num money">
                                    ${formatAUD(s.super.contributions.total)}
                                  </td>
                                  <td></td>
                                </tr>
                                <tr>
                                  <td class="total-label" colspan="2">
                                    SG contributions (FY)
                                  </td>
                                  <td class="num money">
                                    ${formatAUD(sgTotal)}
                                  </td>
                                  <td></td>
                                </tr>
                              </tfoot>
                            </table>
                            ${this.renderSuperPager()}
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
