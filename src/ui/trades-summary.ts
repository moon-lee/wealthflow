import { LitElement, html } from 'lit';
import { sharedStyles } from '../styles/shared-styles.js';
import { portfolioStyles } from '../styles/portfolio-styles.js';
import { formatAUD } from '../utils/format.js';
import {
  getPortfolioSummary,
  type PortfolioSummary,
} from '../services/portfolio-service.js';

const Base =
  typeof HTMLElement !== 'undefined'
    ? LitElement
    : (class {} as unknown as typeof LitElement);

/**
 * The five headline numbers for the portfolio, in the order the reference
 * presents them: value, capital gain, income, currency gain, total return.
 *
 * The capital gain here is UNREALISED (plus realised, measured before the 50%
 * discount). The CGT section owns the realised, post-discount figure for the
 * year. They are different numbers for different things, and the footnote
 * says so.
 */
export class TradesSummary extends Base {
  static override styles =
    typeof HTMLElement !== 'undefined'
      ? ([sharedStyles, portfolioStyles] as any)
      : [];
  finance: any = null;
  asOf = '';
  summary: PortfolioSummary | null = null;
  error = '';

  async setFinance(f: any): Promise<void> {
    this.finance = f;
    await this.reload();
  }

  async reload(): Promise<void> {
    if (!this.finance) return;
    this.error = '';
    try {
      this.summary = await getPortfolioSummary(
        this.finance,
        this.asOf || undefined,
      );
      // Remember what was asked for, so a later reload is the same snapshot.
      if (this.summary) this.asOf = this.summary.asOf;
    } catch (e: any) {
      this.error = String(e?.message || e);
    }
    (this as any).requestUpdate?.();
  }

  /** The card order, exposed so it is assertable without the shadow DOM. */
  get cardLabels(): string[] {
    return [
      'Portfolio value',
      'Capital gain',
      'Income',
      'Currency gain',
      'Total return',
    ];
  }

  /** The Portfolio value as it is rendered. A dash when it is unknown. */
  get valueLabel(): string {
    const v = this.summary?.totalValue;
    return v === null || v === undefined ? '—' : formatAUD(v);
  }

  /** A rate, formatted. A dash when there is no solution — never 0.00%. */
  private rateLabel(rate: number | null | undefined): string {
    if (rate === null || rate === undefined) return '—';
    return `${(rate * 100).toFixed(2)}% p.a.`;
  }

  private moneyLabel(n: number | null | undefined): string {
    if (n === null || n === undefined) return '—';
    return formatAUD(n);
  }

  override render(): unknown {
    if (typeof HTMLElement === 'undefined') return html``;
    const s = this.summary;
    if (this.error)
      return html`<p class="field-error" role="alert">Error: ${this.error}</p>`;
    if (!s) return html`<p class="muted">Loading…</p>`;

    return html`
      <div class="portfolio-cards">
        <div class="portfolio-card">
          <div class="portfolio-card-label">Portfolio value</div>
          <div class="portfolio-card-value">${this.valueLabel}</div>
          <div class="portfolio-card-note">
            ${
              s.priceAsAt
                ? `As of ${s.priceAsAt}${s.pricesLive ? ' · live' : ''}`
                : 'No prices entered'
            }
          </div>
        </div>
        <div class="portfolio-card">
          <div class="portfolio-card-label">Capital gain</div>
          <div class="portfolio-card-value">
            ${this.rateLabel(s.capitalGainRate)}
          </div>
          <div class="portfolio-card-note">
            ${this.moneyLabel(s.totalCapitalGain)}
          </div>
        </div>
        <div class="portfolio-card">
          <div class="portfolio-card-label">Income</div>
          <div class="portfolio-card-value">
            ${this.rateLabel(s.incomeRate)}
          </div>
          <div class="portfolio-card-note">
            ${this.moneyLabel(s.totalIncome)}
          </div>
        </div>
        <div class="portfolio-card">
          <div class="portfolio-card-label">Currency gain</div>
          <div class="portfolio-card-value">
            ${this.rateLabel(s.currencyGainRate)}
          </div>
          <div class="portfolio-card-note">
            ${this.moneyLabel(s.currencyGain)}
          </div>
        </div>
        <div class="portfolio-card">
          <div class="portfolio-card-label">Total return</div>
          <div class="portfolio-card-value">
            ${this.rateLabel(s.totalReturnRate)}
          </div>
          <div class="portfolio-card-note">
            ${this.moneyLabel(s.totalReturn)}
          </div>
        </div>
      </div>

      <!--
        The warning's binding is INSIDE the element, not a root-level
        conditional. A binding at the root level of a template makes lit lose
        every binding after it: the note below rendered EMPTY, silently. The
        hidden attribute keeps the same behaviour - the box appears only when
        there is something to warn about - with no root-level binding.
      -->
      <p class="portfolio-warning" ?hidden=${!s.stalePrices}>
        Prices are from ${s.priceAsAt ?? 'an unknown date'} — older than 7 days.
        Update them on the Investment section.
      </p>

      <p class="portfolio-note">${this.noteText()}</p>
    `;
  }

  /**
   * The note, built as a plain string.
   *
   * A nested template with a ternary inside the binding is what made this
   * note come out EMPTY once — lit left the binding unbound. A plain string
   * has no binding position to misalign.
   */
  private noteText(): string {
    const basis =
      this.summary?.amitBasis === 'post'
        ? 'after AMIT cost base adjustments'
        : 'before AMIT cost base adjustments';
    return (
      'The capital gain and income rates are allocations of the total return ' +
      'rate, not independent rates. Capital gain is unrealised plus realised, ' +
      `measured before the 50% discount and ${basis}; the Capital gains ` +
      'section on Overview owns the realised, post-discount, post-AMIT figure ' +
      'for the year.'
    );
  }
}

if (
  typeof customElements !== 'undefined' &&
  !customElements.get('trades-summary')
) {
  customElements.define(
    'trades-summary',
    TradesSummary as unknown as CustomElementConstructor,
  );
}
