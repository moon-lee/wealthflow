import { LitElement, html } from 'lit';
import { sharedStyles } from '../styles/shared-styles.js';
import { wealthflowStyles } from '../styles/wealthflow-styles.js';
import { portfolioStyles } from '../styles/portfolio-styles.js';
import { formatAUD } from '../utils/format.js';
import type { CapitalGainsSummary } from '../services/capital-gains-service.js';
import { getCapitalGainsSummary } from '../services/capital-gains-service.js';
import { setOpeningBalance } from '../dao/capital-losses.js';

const Base =
  typeof HTMLElement !== 'undefined'
    ? LitElement
    : (class {} as unknown as typeof LitElement);

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/**
 * The fourth Overview section. Collapsed by default so it does not lengthen a
 * page that already carries three sections, and so an FY with no disposals
 * costs the reader nothing until they open it.
 */
export class CgtSection extends Base {
  static override styles =
    typeof HTMLElement !== 'undefined'
      ? ([sharedStyles, wealthflowStyles, portfolioStyles] as any)
      : [];
  finance: any = null;
  fy = '';
  error = '';
  summary: CapitalGainsSummary | null = null;
  collapsed = true;
  /**
   * Bound to the input rather than read back out of the DOM on submit, so the
   * save path is testable and so a re-render mid-edit cannot discard a typed
   * value. Every other form in this extension does the same.
   */
  openingBalanceInput = '';
  copyNotice = '';

  async setFinance(f: any): Promise<void> {
    this.finance = f;
    await this.reload();
  }

  async reload(): Promise<void> {
    if (!this.finance || !this.fy) return;
    this.error = '';
    try {
      this.summary = await getCapitalGainsSummary(this.finance, this.fy);
      // Seed the field from the stored balance, but never overwrite a value the
      // user is part-way through typing.
      if (this.openingBalanceInput === '') {
        this.openingBalanceInput = String(this.summary.carriedForwardLoss ?? 0);
      }
    } catch (e: any) {
      this.error = String(e?.message || e);
    }
    (this as any).requestUpdate?.();
  }

  /** Returns the reload so a caller can await the settled state rather than
   *  guessing at it — the click handler ignores the result. */
  toggle(): Promise<void> {
    this.collapsed = !this.collapsed;
    (this as any).requestUpdate?.();
    return this.reload();
  }

  private async saveOpeningBalance(e: Event): Promise<void> {
    e?.preventDefault?.();
    if (!this.finance) return;
    const amount = Number(this.openingBalanceInput);
    if (!Number.isFinite(amount) || amount < 0) {
      this.error =
        'A carried-forward loss is a positive amount, or 0 for none.';
      (this as any).requestUpdate?.();
      return;
    }
    await setOpeningBalance(this.finance, this.fy, amount);
    await this.reload();
  }

  override render(): unknown {
    if (typeof HTMLElement === 'undefined') return html``;
    const s = this.summary;
    return html`
      <div class="section flush">
        <div class="section-header is-toggle" @click=${() => this.toggle()}>
          <button
            type="button"
            class="section-toggle"
            aria-expanded=${this.collapsed ? 'false' : 'true'}
            aria-controls="wf-body-cgt"
          >
            <span class="chevron" aria-hidden="true"></span>
            <span class="section-title">Capital gains — FY ${this.fy}</span>
          </button>
          <div
            class="header-actions"
            @click=${(e: Event) => e.stopPropagation()}
          >
            <span class="section-badge rows-badge"
              >${s ? plural(s.sellCount ?? 0, 'sell') : 0}</span
            >
          </div>
        </div>
        <div class="section-body" id="wf-body-cgt" ?hidden=${this.collapsed}>
          <p class="field-error" ?hidden=${!this.error}>${this.error}</p>
          ${!s ? html`<p class="muted">Loading…</p>` : this.renderBody(s)}
        </div>
      </div>
    `;
  }

  /**
   * Says plainly that a blank is not a real zero. A taxpayer who lost money
   * before this app existed has an opening balance the app cannot know, and
   * showing "$0.00 carried in" would be a confident lie.
   */
  private balanceNotice(s: CapitalGainsSummary): string {
    return s.hasOpeningBalance
      ? `Carrying ${formatAUD(s.carriedForwardOut)} out of this year.`
      : 'No opening balance entered — losses from before tracking began are not visible to the app.';
  }

  private renderBody(s: CapitalGainsSummary): unknown {
    const none =
      s.sellCount === 0 && s.grossGain === 0 && s.lossesApplied === 0;
    return html`
      <div class="section-summary">
        <div class="portfolio-cards cols-4">
          <div class="portfolio-card">
            <div class="portfolio-card-label">Gross capital gain</div>
            <div class="portfolio-card-value">${formatAUD(s.grossGain)}</div>
            <div class="portfolio-card-note">before losses and discount</div>
          </div>
          <div class="portfolio-card">
            <div class="portfolio-card-label">Losses applied</div>
            <div class="portfolio-card-value">
              ${formatAUD(s.lossesApplied)}
            </div>
            <div class="portfolio-card-note">offset against gains first</div>
          </div>
          <div class="portfolio-card">
            <div class="portfolio-card-label">50% discount</div>
            <div class="portfolio-card-value">${formatAUD(s.adjustment)}</div>
            <div class="portfolio-card-note">parcels held 12+ months</div>
          </div>
          <div class="portfolio-card">
            <div class="portfolio-card-label">Net capital gain</div>
            <div class="portfolio-card-value is-ok">
              ${formatAUD(s.netGain)}
            </div>
            <div class="portfolio-card-note">
              reportable — FY ${s.financialYear}
            </div>
          </div>
        </div>
      </div>

      <!--
        The table sits inside this element. A binding at the ROOT level of a
        template is dropped by happy-dom's parser, so the disposals table was
        in no test's DOM to assert against.
      -->
      <div>
        ${
          none
            ? html`<p class="muted">
                No disposals recorded this financial year.
              </p>`
            : html`
                <div class="table-wrap">
                  <table class="hist-table">
                    <thead>
                      <tr>
                        <th scope="col">Stock</th>
                        <th scope="col" class="num">Disposals</th>
                        <th scope="col" class="num">Proceeds</th>
                        <th scope="col" class="num">Cost base</th>
                        <th scope="col" class="num">Nominal</th>
                        <th scope="col" class="num">Discount</th>
                        <th scope="col" class="num">Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${s.byStock.map(
                        (r) =>
                          html`<tr>
                            <td>${r.stockCode}</td>
                            <td class="num">${r.disposals}</td>
                            <td class="num">${formatAUD(r.proceeds)}</td>
                            <td class="num">${formatAUD(r.costBase)}</td>
                            <td class="num">${formatAUD(r.nominalGain)}</td>
                            <td class="num">${formatAUD(r.adjustment)}</td>
                            <td class="num">${formatAUD(r.netGain)}</td>
                          </tr>`,
                      )}
                    </tbody>
                  </table>
                </div>
              `
        }
      </div>

      <p class="muted">
        Losses are offset against gains <em>before</em> the 50% discount, and
        only parcels held 12 months or more are discounted.
      </p>

      <form
        class="inline-form"
        @submit=${(e: Event) => this.saveOpeningBalance(e)}
      >
        <label class="field">
          <span>Carried-forward loss brought into FY ${s.financialYear}</span>
          <input
            id="opening-balance"
            inputmode="decimal"
            .value=${this.openingBalanceInput}
            @input=${(e: Event) => {
              this.openingBalanceInput = (e.target as HTMLInputElement).value;
              (this as any).requestUpdate?.();
            }}
          />
        </label>
        <button class="btn btn-secondary btn-small" type="submit">Save</button>
        <span class="muted">${this.balanceNotice(s)}</span>
      </form>

      <div class="header-actions">
        <button
          class="btn btn-secondary btn-small"
          @click=${() => this.copyForTax()}
        >
          Copy for Tax
        </button>
      </div>
    `;
  }

  private copyForTax(): void {
    const s = this.summary;
    if (!s) return;
    const lines = [
      `Wealth Flow — capital gains, FY ${s.financialYear}`,
      `Gross capital gain    ${formatAUD(s.grossGain)}`,
      `Losses applied        ${formatAUD(s.lossesApplied)}`,
      `50% discount          ${formatAUD(s.adjustment)}`,
      `Net capital gain      ${formatAUD(s.netGain)}`,
      `Carried-forward loss  ${formatAUD(s.carriedForwardLoss)}`,
      '',
      ...s.byStock.map(
        (r) =>
          `${r.stockCode}  ${r.disposals} disposal(s)  proceeds ${formatAUD(r.proceeds)}  cost base ${formatAUD(r.costBase)}  net ${formatAUD(r.netGain)}`,
      ),
    ];
    const text = lines.join('\n');
    (globalThis as any).navigator?.clipboard?.writeText?.(text);
    this.copyNotice = 'Copied to the clipboard.';
    (this as any).requestUpdate?.();
  }
}

if (
  typeof HTMLElement !== 'undefined' &&
  typeof customElements !== 'undefined' &&
  !customElements.get('cgt-section')
) {
  customElements.define(
    'cgt-section',
    CgtSection as unknown as CustomElementConstructor,
  );
}
