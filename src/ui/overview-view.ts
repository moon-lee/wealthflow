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
  }

  private goBanks(): void {
    this.dispatchEvent(
      new CustomEvent('wealthflow-navigate', {
        detail: { view: 'banks' },
        bubbles: true,
        composed: true,
      }),
    );
  }

  override render(): unknown {
    if (typeof HTMLElement === 'undefined') return html``;
    const s = this.summary;
    return html`
      <div class="section">
        <h3>Overview — FY ${this.fy}</h3>
        ${this.error ? html`<p class="field-error">Error: ${this.error}</p>` : ''}
        ${
          !s
            ? html`<p>Loading…</p>`
            : html`
                <div class="section">
                  <h4>Dividends</h4>
                  ${
                    s.dividends.gross === 0 && s.dividends.franking === 0
                      ? html`<p>
                          No dividends logged this FY yet — add a holding and
                          log its receipts.
                        </p>`
                      : html`
                          <p>
                            Gross ${formatAUD(s.dividends.gross)} · Franking
                            ${formatAUD(s.dividends.franking)}
                          </p>
                          <ul>
                            ${(
                              Object.keys(
                                DIVIDEND_TYPE_LABELS,
                              ) as (keyof typeof DIVIDEND_TYPE_LABELS)[]
                            ).map(
                              (t) =>
                                html`<li>
                                  ${DIVIDEND_TYPE_LABELS[t]}:
                                  ${formatAUD(s.dividends.byType[t].gross)} + fr
                                  ${formatAUD(s.dividends.byType[t].franking)}
                                </li>`,
                            )}
                          </ul>
                        `
                  }
                </div>
                <div class="section">
                  <h4>Interest</h4>
                  ${
                    s.interest.total === 0
                      ? html`<p>
                          No interest logged this FY yet — add a bank and fill
                          the monthly grid.
                        </p>`
                      : html`<p>
                          ${formatAUD(s.interest.total)}
                          <button
                            class="filter-btn"
                            @click=${() => this.goBanks()}
                          >
                            → Banks
                          </button>
                        </p>`
                  }
                </div>
                <div class="section">
                  <h4>Combined</h4>
                  <p>
                    Gross ${formatAUD(s.combined.gross)} · Franking
                    ${formatAUD(s.combined.franking)}
                  </p>
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
