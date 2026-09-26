import { LitElement, html } from 'lit';
import { sharedStyles } from '../styles/shared-styles.js';
import { wealthflowStyles } from '../styles/wealthflow-styles.js';
import { ExtensionLogger } from 'finance-logger';
import { formatAUD } from '../utils/format.js';
import { DIVIDEND_TYPE_LABELS } from '../services/stock-service.js';
import type { OverviewSummary } from '../services/public-wealth-adapter.js';

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
        summary = (await this.finance.services?.invoke(
          'wealthflow',
          'getOverviewSummary',
          this.fy,
        )) as OverviewSummary | null;
      } catch {
        summary = null;
      }
      if (!summary) {
        const { listBanks } = await import('../dao/banks.js');
        const { getInterestTotals } =
          await import('../services/bank-service.js');
        const { listStocks } = await import('../dao/stocks.js');
        const { getDividendTotals } =
          await import('../services/stock-service.js');
        const banks = await listBanks(this.finance, { status: 'all' });
        const stocks = await listStocks(this.finance, { status: 'all' });
        const [interest, dividends] = await Promise.all([
          getInterestTotals(this.finance, banks, this.fy),
          getDividendTotals(this.finance, stocks, this.fy),
        ]);
        const round2 = (n: number) => Math.round(n * 100) / 100;
        summary = {
          financialYear: this.fy,
          dividends,
          interest,
          combined: {
            gross: round2(dividends.gross + interest.total),
            franking: round2(dividends.franking),
          },
        };
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

  private toggleForm(which: 'dividends' | 'interest'): void {
    if (which === 'dividends') this.showDividendForm = !this.showDividendForm;
    else this.showInterestForm = !this.showInterestForm;
    (this as any).requestUpdate?.();
    void this.pushToChildren();
  }

  override connectedCallback(): void {
    (super.connectedCallback as (() => void) | undefined)?.call(this);
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
  }

  override disconnectedCallback(): void {
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
    (super.disconnectedCallback as (() => void) | undefined)?.call(this);
  }

  private _onFormChanged = (): void => {
    // Embedded log forms bubble their writes; refresh cards (footer refreshes via orchestrator).
    void this.reload();
  };

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
                <!-- Dividends -->
                <div class="section flush">
                  <div class="section-header">
                    <h3 class="section-title">Dividends — FY ${this.fy}</h3>
                    <div class="header-actions">
                      <span class="rate-badge"
                        >Gross ${formatAUD(s.dividends.gross)}</span
                      >
                      <button
                        class="btn btn-secondary"
                        @click=${() => this.toggleForm('dividends')}
                      >
                        ${this.showDividendForm ? 'Hide form' : 'Log dividend'}
                      </button>
                    </div>
                  </div>
                  <div class="section-body">
                    ${
                      s.dividends.gross === 0 && s.dividends.franking === 0
                        ? html`<p class="muted">
                            No dividends logged this FY yet — add a holding and
                            log its receipts.
                          </p>`
                        : html`
                            <div class="stat-grid">
                              <div class="stat">
                                <div class="stat-label">Gross</div>
                                <div class="stat-value">
                                  ${formatAUD(s.dividends.gross)}
                                </div>
                              </div>
                              <div class="stat">
                                <div class="stat-label">Franking</div>
                                <div class="stat-value">
                                  ${formatAUD(s.dividends.franking)}
                                </div>
                              </div>
                              ${(
                                Object.keys(
                                  DIVIDEND_TYPE_LABELS,
                                ) as (keyof typeof DIVIDEND_TYPE_LABELS)[]
                              ).map(
                                (t) =>
                                  html`<div class="stat">
                                    <div class="stat-label">
                                      ${DIVIDEND_TYPE_LABELS[t]} · fr
                                      ${formatAUD(s.dividends.byType[t].franking)}
                                    </div>
                                    <div class="stat-value">
                                      ${formatAUD(s.dividends.byType[t].gross)}
                                    </div>
                                  </div>`,
                              )}
                            </div>
                            ${
                              s.dividends.byStock.length > 0
                                ? html`<div
                                    class="table-wrap"
                                    style="margin-top:12px"
                                  >
                                    <table class="hist-table">
                                      <thead>
                                        <tr>
                                          <th>Stock</th>
                                          <th class="num">Gross</th>
                                          <th class="num">Franking</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        ${s.dividends.byStock.map(
                                          (b) =>
                                            html`<tr>
                                              <td>
                                                <strong>${b.code}</strong>
                                                <span class="muted"
                                                  >${b.name}</span
                                                >
                                              </td>
                                              <td class="num money">
                                                ${formatAUD(b.gross)}
                                              </td>
                                              <td class="num">
                                                ${formatAUD(b.franking)}
                                              </td>
                                            </tr>`,
                                        )}
                                      </tbody>
                                    </table>
                                  </div>`
                                : ''
                            }
                          `
                    }
                    <dividend-log></dividend-log>
                    ${this.showDividendForm ? html`<dividend-form></dividend-form>` : ''}
                  </div>
                </div>

                <!-- Interest -->
                <div class="section flush">
                  <div class="section-header">
                    <h3 class="section-title">Interest — FY ${this.fy}</h3>
                    <div class="header-actions">
                      <span class="rate-badge"
                        >Total ${formatAUD(s.interest.total)}</span
                      >
                      <button
                        class="btn btn-secondary"
                        @click=${() => this.toggleForm('interest')}
                      >
                        ${this.showInterestForm ? 'Hide form' : 'Log interest'}
                      </button>
                      <button
                        class="btn btn-secondary"
                        @click=${() => this.go('banks')}
                      >
                        → Banks
                      </button>
                    </div>
                  </div>
                  <div class="section-body">
                    ${
                      s.interest.total === 0
                        ? html`<p class="muted">
                            No interest logged this FY yet — add a bank and fill
                            the monthly grid.
                          </p>`
                        : html`<div class="stat-grid">
                            <div class="stat">
                              <div class="stat-label">Total</div>
                              <div class="stat-value">
                                ${formatAUD(s.interest.total)}
                              </div>
                            </div>
                            ${s.interest.byBank.map(
                              (b) =>
                                html`<div class="stat">
                                  <div class="stat-label">${b.name}</div>
                                  <div class="stat-value">
                                    ${formatAUD(b.total)}
                                  </div>
                                </div>`,
                            )}
                          </div>`
                    }
                    <interest-grid></interest-grid>
                    ${this.showInterestForm ? html`<interest-form></interest-form>` : ''}
                  </div>
                </div>

                <!-- Combined -->
                <div class="section flush">
                  <div class="section-header">
                    <h3 class="section-title">
                      Combined taxable — FY ${this.fy}
                    </h3>
                    <div class="header-actions">
                      <span class="rate-badge"
                        >Gross ${formatAUD(s.combined.gross)}</span
                      >
                    </div>
                  </div>
                  <div class="section-body">
                    <div class="stat-grid">
                      <div class="stat">
                        <div class="stat-label">Taxable gross</div>
                        <div class="stat-value">
                          ${formatAUD(s.combined.gross)}
                        </div>
                      </div>
                      <div class="stat">
                        <div class="stat-label">Franking credits</div>
                        <div class="stat-value">
                          ${formatAUD(s.combined.franking)}
                        </div>
                      </div>
                    </div>
                    <p class="muted">
                      Interest carries no franking — credits come from dividends
                      only.
                    </p>
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
