import { LitElement, html } from 'lit';
import { sharedStyles } from '../styles/shared-styles.js';
import { portfolioStyles } from '../styles/portfolio-styles.js';
import { formatAUD, formatPrice } from '../utils/format.js';
import {
  getPortfolioSummary,
  writeAmitBasis,
  type AmitBasis,
  type PortfolioSummary,
} from '../services/portfolio-service.js';
import { insertPrice, listPrices } from '../dao/prices.js';

const Base =
  typeof HTMLElement !== 'undefined'
    ? LitElement
    : (class {} as unknown as typeof LitElement);

/** At most one automatic price refresh in this window. A price that is still
 *  fresh is not refetched, and an unreachable exchange is not hammered. */
const AUTO_UPDATE_COOLDOWN_MS = 60_000;

export interface InvestmentRow {
  stockId: number;
  code: string;
  name: string;
  market: string;
  units: number;
  price: number | null;
  priceLabel: string;
  /** What the edit input shows: the same three decimals as the column, so
   *  what you type matches what you saw. */
  priceInputValue: string;
  /** The accessible name for that input — three bare number boxes in a table
   *  are not distinguishable by ear. */
  priceInputLabel: string;
  /** 'api' when the price was fetched from the market, 'manual' when it was
   *  typed in. Null when the holding has never been priced. */
  priceSource: string | null;
  /** The class the price cell carries. Always "num": a CONDITIONAL class
   *  binding on it misaligns lit's bindings for the whole template, which
   *  silently breaks the event handlers further down. The live signal rides
   *  on the marker instead, which is also better UI — a coloured number
   *  competes with the green and red gain columns. */
  priceClass: string;
  value: number | null;
  valueLabel: string;
  valuePercent: number | null;
  capitalGain: number | null;
  capitalGainLabel: string;
  /** The holding's own annualised rate, as a decimal. Null when it has no
   *  rate (never priced, or no cash flows to weigh). */
  capitalGainRate: number | null;
  realisedGain: number;
  unrealisedGain: number | null;
  income: number;
  incomeLabel: string;
  incomeRate: number | null;
  currency: number;
  currencyLabel: string;
  totalReturn: number | null;
  totalReturnLabel: string;
  returnRate: number | null;
}

/**
 * What you hold, what it is worth, and what it has returned.
 *
 * Three controls, as the reference has them: split the capital gain into
 * realised and unrealised, switch the money columns to percentages, and edit
 * the prices by hand.
 *
 * Editing a price writes a NEW row to the price history. The current price is
 * derived from the latest row, so a correction never destroys what was
 * recorded before it.
 */
export class InvestmentTable extends Base {
  static override styles =
    typeof HTMLElement !== 'undefined'
      ? ([sharedStyles, portfolioStyles] as any)
      : [];
  finance: any = null;
  asOf = '';
  summary: PortfolioSummary | null = null;
  mode: 'aud' | 'percent' = 'aud';
  split = false;
  editing = false;
  /** True once a price has actually been typed, so cancelling can ask. */
  priceEditsDirty = false;
  /** When the last automatic price refresh was attempted. */
  private lastAutoUpdate = 0;
  /**
   * Set by the parent so a price change can be announced to the SIBLING
   * sections.
   *
   * A DOM event would be the natural way to say it, but the other sections
   * live in the same shadow root and an event does not reliably reach a
   * listener on the shadow host. The parent already configures its children
   * (it sets their finance and FY), so this is the same arrangement.
   */
  onPricesUpdated: (() => void) | null = null;

  /**
   * The percentage in % mode is the ANNUALISED rate, the same measure the
   * Trades Summary shows, so the two agree. The note says so, because a bare
   * "12.34%" next to the summary's "12.34% p.a." should read as the same
   * number.
   */
  /**
   * The subtitle line, built as a plain string.
   *
   * It used to be a nested `html` template with a ternary inside the
   * binding. Lit rendered that position as an unbound marker — the text came
   * out EMPTY, and the price date vanished from the note altogether. A plain
   * string has no binding position to misalign.
   */
  private noteText(priceDate: string): string {
    if (this.editing)
      return 'Editing the Price column — enter a number per holding, then save. Saving twice on one day does not record it twice.';
    // The gain's cost base basis belongs here. The screen shows the gain on
    // what was actually PAID, before any AMIT cost base adjustment; the
    // Capital gains section owns the post-AMIT taxable figure. A reader who
    // compares the two needs to know they are on different bases.
    const basis =
      this.basis === 'post'
        ? 'Gains after AMIT adjustments (your tax cost base)'
        : 'Gains before AMIT adjustments';
    const base = `${priceDate} | Since first purchase | Grouped by Market | Open positions only | ${basis}`;
    return this.percentMode ? `${base} | Percentages are per annum` : base;
  }
  updating = false;
  error = '';
  /**
   * Which cost base the gains are measured against. It is a stored
   * preference, so it survives a restart, and the summary is the authority on
   * it - the table never decides the basis on its own.
   */
  basis: AmitBasis = 'pre';

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
      if (this.summary) {
        this.asOf = this.summary.asOf;
        this.basis = this.summary.amitBasis;
      }
    } catch (e: any) {
      this.error = String(e?.message || e);
    }
    (this as any).requestUpdate?.();
    // The price is fetched in the BACKGROUND, after the table has rendered, so
    // a slow network never holds up the holdings you came to see.
    void this.maybeUpdatePrices();
  }

  /**
   * Change the cost base the gains are measured against.
   *
   * The choice is stored, so it survives a restart and applies everywhere the
   * portfolio view appears. The Trades Summary is a SIBLING holding its own
   * copy of the summary, so it is told to re-read - two sections showing two
   * bases for the same money is exactly what this change must not produce.
   */
  async setBasis(basis: AmitBasis): Promise<void> {
    if (!this.finance || basis === this.basis) return;
    const previous = this.basis;
    // Optimistic: the segment shows the choice immediately, because the write
    // and the re-read take a round trip each.
    this.basis = basis;
    (this as any).requestUpdate?.();
    try {
      await writeAmitBasis(this.finance, basis);
    } catch (e: any) {
      // The preference did not stick, so the screen must not pretend it did.
      this.basis = previous;
      this.error = String(e?.message || e);
      (this as any).requestUpdate?.();
      return;
    }
    await this.reload();
    this.onPricesUpdated?.();
  }

  /**
   * Fetch the current price when the view opens, if what we hold is stale.
   *
   * Two guards keep it from becoming a hammer:
   *  - only when the price is missing or older than the stale threshold, so
   *    switching tabs does not refetch a price that is still good;
   *  - at most once a minute, so an unreachable exchange does not turn into
   *    a loop of failing requests.
   */
  private async maybeUpdatePrices(): Promise<void> {
    const s = this.summary;
    if (!s || this.updating) return;
    if (s.priceAsAt !== null && !s.stalePrices) return;
    const now = Date.now();
    if (now - this.lastAutoUpdate < AUTO_UPDATE_COOLDOWN_MS) return;
    this.lastAutoUpdate = now;
    await this.updatePricesFromApi();
  }

  private get percentMode(): boolean {
    return this.mode === 'percent';
  }

  /**
   * A dollar column that stays a dollar in both modes.
   *
   * The unrealised/realised split has no annualised rate behind it — there is
   * no rate for the realised half alone — so it stays an amount even when the
   * rest of the table is showing rates.
   */
  private dollars(n: number | null | undefined): string {
    if (n === null || n === undefined) return '—';
    return formatAUD(n);
  }

  /** A column that is a rate in % mode and an amount otherwise. */
  private rate(
    rateValue: number | null | undefined,
    amount: number | null | undefined,
  ): string {
    if (this.percentMode) {
      if (rateValue === null || rateValue === undefined) return '—';
      return `${(rateValue * 100).toFixed(2)}%`;
    }
    if (amount === null || amount === undefined) return '—';
    return formatAUD(amount);
  }

  get rows(): InvestmentRow[] {
    const s = this.summary;
    if (!s) return [];
    const total = s.totalValue;
    return s.holdings.map((h) => ({
      stockId: h.stockId,
      code: h.code,
      name: h.name,
      market: h.market,
      units: h.units,
      price: h.price,
      priceLabel: h.price === null ? '—' : formatPrice(h.price),
      priceInputValue: h.price === null ? '' : h.price.toFixed(3),
      priceInputLabel: `Price for ${h.code}`,
      priceSource: h.priceSource,
      priceClass: 'num',
      value: h.value,
      // The Value column NEVER converts. The portfolio does not become a
      // percentage of itself, and a value is a value.
      valueLabel: h.value === null ? '—' : formatAUD(h.value),
      valuePercent: h.value === null || !total ? null : (h.value / total) * 100,
      capitalGain: h.capitalGain,
      // In % mode the gain columns show the holding's own ANNUALISED rate,
      // the same measure the Trades Summary shows. The total row shows the
      // portfolio's rate, so the two agree.
      capitalGainLabel: this.rate(h.capitalGainRate, h.capitalGain),
      capitalGainRate: h.capitalGainRate,
      realisedGain: h.realisedGain,
      unrealisedGain: h.unrealisedGain,
      income: h.income,
      incomeLabel: this.rate(h.incomeRate, h.income),
      incomeRate: h.incomeRate,
      currency: 0,
      currencyLabel: this.rate(0, 0),
      totalReturn: h.totalReturn,
      totalReturnLabel: this.rate(h.returnRate, h.totalReturn),
      returnRate: h.returnRate,
    }));
  }

  get totals(): InvestmentRow {
    const s = this.summary;
    const rows = this.rows;
    const total = s?.totalValue ?? null;
    const sum = (pick: (r: InvestmentRow) => number | null) => {
      const vals = rows.map(pick);
      if (vals.some((v) => v === null)) return null;
      return vals.reduce<number>((a, v) => a + (v ?? 0), 0);
    };
    return {
      stockId: 0,
      code: 'Total',
      name: 'Total',
      market: '',
      units: rows.reduce((a, r) => a + r.units, 0),
      price: null,
      priceLabel: '',
      priceInputValue: '',
      priceInputLabel: 'Price',
      priceSource: null,
      priceClass: 'num',
      value: s?.totalValue ?? null,
      valueLabel:
        s?.totalValue === null || s?.totalValue === undefined
          ? '—'
          : formatAUD(s.totalValue),
      valuePercent: total === null ? null : 100,
      capitalGain: s?.totalCapitalGain ?? null,
      // The PORTFOLIO's rate, which is the same figure the Trades Summary
      // shows. The table's total row and the summary must agree.
      capitalGainLabel: this.rate(s?.capitalGainRate, s?.totalCapitalGain),
      capitalGainRate: s?.capitalGainRate ?? null,
      realisedGain: rows.reduce((a, r) => a + r.realisedGain, 0),
      unrealisedGain: sum((r) => r.unrealisedGain),
      income: s?.totalIncome ?? 0,
      incomeLabel: this.rate(s?.incomeRate, s?.totalIncome),
      incomeRate: s?.incomeRate ?? null,
      currency: 0,
      currencyLabel: this.rate(0, 0),
      totalReturn: s?.totalReturn ?? null,
      totalReturnLabel: this.rate(s?.totalReturnRate, s?.totalReturn),
      returnRate: s?.totalReturnRate ?? null,
    };
  }

  /**
   * The only place a price is written from the UI. A new history row, dated
   * today, sourced 'manual'.
   */
  /**
   * Ask the host to fetch the current price for every holding.
   *
   * The panel cannot fetch: it is a browser context and the price endpoints
   * are cross-origin. The host is plain Node and can. So the panel calls the
   * host's command through the shell bridge, and then re-reads the price
   * table, which the host has just written.
   *
   * Nothing is pushed back to the panel, deliberately: a push would retarget
   * the open panel, and updating a price should not move the user.
   */
  async updatePricesFromApi(): Promise<void> {
    this.updating = true;
    this.error = '';
    (this as any).requestUpdate?.();
    try {
      const shell = (globalThis as any)?.financeShell;
      await shell?.extensions?.executeCommand?.('wealthflow.update-prices', {});
      await this.reload();
    } catch (err: any) {
      this.error = String(err?.message ?? err);
    } finally {
      this.updating = false;
      (this as any).requestUpdate?.();
    }
    // The Trades Summary is a SIBLING and holds its own copy of the summary.
    // Without this it would keep showing the old Portfolio value while the
    // table beside it showed the new one - two numbers for the same money.
    this.onPricesUpdated?.();
  }

  async savePrices(
    entries: { stockId: number; price: number }[],
  ): Promise<void> {
    if (!this.finance) return;
    const today = new Date();
    const asAt = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    // Validate everything BEFORE writing any of it, so a bad price in the last
    // row does not leave the first rows half-saved.
    for (const e of entries) {
      if (!Number.isFinite(e.price) || e.price <= 0) {
        this.error = 'A price must be greater than 0.';
        (this as any).requestUpdate?.();
        return;
      }
    }
    for (const e of entries) {
      // The price table is a HISTORY. Saving the same price on the same day
      // must not stack a duplicate row, or the history fills with copies of
      // itself every time the editor is opened and closed.
      const existing = await listPrices(this.finance, e.stockId);
      const latest = existing[existing.length - 1];
      if (
        latest &&
        latest.as_at === asAt &&
        Math.abs(Number(latest.price) - e.price) < 1e-9
      )
        continue;
      await insertPrice(this.finance, {
        stock_id: e.stockId,
        price: e.price,
        as_at: asAt,
        source: 'manual',
      });
    }
    this.editing = false;
    await this.reload();
    // The Trades Summary is a SIBLING, and it holds its own copy of the
    // summary. Without this it would keep showing the old Portfolio value
    // while the table beside it showed the new one — two numbers for the same
    // money.
    this.onPricesUpdated?.();
  }

  /** Enter the price editor. */
  beginEdit(): void {
    this.editing = true;
    this.priceEditsDirty = false;
    this.error = '';
    (this as any).requestUpdate?.();
  }

  /**
   * Leave the price editor WITHOUT saving.
   *
   * This used to be called "Done", which reads like "finish and save" — and it
   * silently threw away whatever had been typed. It is now "Cancel", and it
   * asks before discarding an edit that has actually been made.
   */
  cancelEdits(): void {
    if (this.priceEditsDirty) {
      const confirmed =
        typeof confirm === 'undefined'
          ? true
          : confirm('Discard your price edits?');
      if (!confirmed) return;
    }
    this.editing = false;
    this.priceEditsDirty = false;
    this.error = '';
    (this as any).requestUpdate?.();
  }

  private async commitEdits(): Promise<void> {
    const root = (this as any).renderRoot as ShadowRoot | undefined;
    if (!root) return;
    const inputs = Array.from(
      root.querySelectorAll<HTMLInputElement>('input[data-stock-id]'),
    );
    const entries: { stockId: number; price: number }[] = [];
    for (const input of inputs) {
      const stockId = Number(input.dataset.stockId);
      const value = Number(input.value);
      if (!Number.isFinite(value) || value <= 0) {
        this.error = 'A price must be greater than 0.';
        (this as any).requestUpdate?.();
        return;
      }
      entries.push({ stockId, price: value });
    }
    await this.savePrices(entries);
  }

  override render(): unknown {
    if (typeof HTMLElement === 'undefined') return html``;
    const s = this.summary;
    if (!s) return html`<p class="muted">Loading…</p>`;
    const rows = this.rows;
    const t = this.totals;
    const priceDate = s.priceAsAt
      ? `Prices as of ${s.priceAsAt}${s.pricesLive ? ' · live' : ''}`
      : 'No prices entered';

    return html`
      <div class="order-stack">
        <div class="portfolio-toolbar">
          <div class="portfolio-toolbar-left">
            <label class="portfolio-toggle">
              <input
                type="checkbox"
                .checked=${this.split}
                @change=${(e: Event) => {
                  this.split = (e.target as HTMLInputElement).checked;
                  (this as any).requestUpdate?.();
                }}
              />
              Split gains &amp; losses
            </label>
            <div
              class="segment"
              role="tablist"
              aria-label="Cost base the gains are measured against"
            >
              <button
                type="button"
                role="tab"
                class="filter-btn ${this.basis === 'pre' ? 'active' : ''}"
                aria-selected=${this.basis === 'pre'}
                @click=${() => {
                  void this.setBasis('pre');
                }}
              >
                Pre-AMIT
              </button>
              <button
                type="button"
                role="tab"
                class="filter-btn ${this.basis === 'post' ? 'active' : ''}"
                aria-selected=${this.basis === 'post'}
                @click=${() => {
                  void this.setBasis('post');
                }}
              >
                Post-AMIT
              </button>
            </div>
          </div>
          <div class="portfolio-toolbar-right">
            <div class="segment" role="tablist" aria-label="Value format">
              <button
                type="button"
                role="tab"
                class="filter-btn ${this.percentMode ? '' : 'active'}"
                aria-selected=${!this.percentMode}
                @click=${() => {
                  this.mode = 'aud';
                  (this as any).requestUpdate?.();
                }}
              >
                AUS
              </button>
              <button
                type="button"
                role="tab"
                class="filter-btn ${this.percentMode ? 'active' : ''}"
                aria-selected=${this.percentMode}
                @click=${() => {
                  this.mode = 'percent';
                  (this as any).requestUpdate?.();
                }}
              >
                %
              </button>
            </div>
            <button
              class="btn btn-secondary btn-small"
              type="button"
              @click=${() => {
                if (this.editing) this.cancelEdits();
                else this.beginEdit();
              }}
            >
              ${this.editing ? 'Cancel' : 'Edit Price'}
            </button>
            ${
              this.editing
                ? html`<button
                    class="btn btn-primary btn-small"
                    type="button"
                    @click=${() => this.commitEdits()}
                  >
                    Save prices
                  </button>`
                : ''
            }
          </div>
        </div>
        ${
          this.error
            ? html`<p class="field-error" role="alert">${this.error}</p>`
            : ''
        }
        <p class="portfolio-note">${this.noteText(priceDate)}</p>
        <div class="table-wrap">
          <table class="portfolio-table">
            <thead>
              <tr>
                <th scope="col">Holding</th>
                <th scope="col" class="num ${this.editing ? 'is-editing' : ''}">
                  <button
                    type="button"
                    class="price-update"
                    aria-label="Update prices from the market"
                    ?disabled=${this.updating}
                    @click=${() => this.updatePricesFromApi()}
                  >
                    Price
                    <span class="price-update-icon" aria-hidden="true"
                      >${this.updating ? '…' : '⟳'}</span
                    >
                  </button>
                </th>
                <th scope="col" class="num">Quantity</th>
                <th scope="col" class="num">Value</th>
                ${
                  this.split
                    ? html`<th scope="col" class="num">Unrealised</th>
                        <th scope="col" class="num">Realised</th>`
                    : html`<th scope="col" class="num">Capital gain</th>`
                }
                <th scope="col" class="num">Income</th>
                <th scope="col" class="num">Currency</th>
                <th scope="col" class="num">Return</th>
              </tr>
            </thead>
            ${this.groupRows(rows).map(
              (group) => html`
                <tbody>
                  <tr class="portfolio-group-row">
                    <td colspan="9">${group.market}</td>
                  </tr>
                  ${group.rows.map(
                    (r) => html`
                      <tr>
                        <td>
                          <strong>${r.code}</strong> | ${r.market}
                          <div class="portfolio-note">${r.name}</div>
                        </td>
                        <td class="num">
                          ${
                            this.editing
                              ? html`<input
                                  type="number"
                                  inputmode="decimal"
                                  step="0.001"
                                  min="0"
                                  class="portfolio-price-input"
                                  data-stock-id=${r.stockId}
                                  aria-label=${r.priceInputLabel}
                                  .value=${r.priceInputValue}
                                  @input=${() => {
                                    this.priceEditsDirty = true;
                                  }}
                                  @keydown=${(e: KeyboardEvent) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      void this.commitEdits();
                                    } else if (e.key === 'Escape') {
                                      e.preventDefault();
                                      this.cancelEdits();
                                    }
                                  }}
                                />`
                              : html`<span
                                  >${r.priceLabel}${
                                    r.priceSource === 'api'
                                      ? html`<span
                                          class="price-live-mark"
                                          aria-hidden="true"
                                          >●</span
                                        >`
                                      : ''
                                  }</span
                                >`
                          }
                        </td>
                        <td class="num">${r.units}</td>
                        <td class="num">${r.valueLabel}</td>
                        ${
                          this.split
                            ? html`<td class="num">
                                  ${this.dollars(r.unrealisedGain)}
                                </td>
                                <td class="num">
                                  ${this.dollars(r.realisedGain)}
                                </td>`
                            : html`<td class="num">${r.capitalGainLabel}</td>`
                        }
                        <td class="num">${r.incomeLabel}</td>
                        <td class="num">${r.currencyLabel}</td>
                        <td class="num">${r.totalReturnLabel}</td>
                      </tr>
                    `,
                  )}
                </tbody>
              `,
            )}
            <tfoot>
              <tr class="portfolio-totals">
                <td>Total</td>
                <td class="num"></td>
                <!-- No total Quantity. Adding the units of three holdings
                     produces a number that means nothing: 1,297 units of
                     three different stocks is not a quantity of anything.
                     The cell stays so the columns still line up. -->
                <td class="num"></td>
                <td class="num">${t.valueLabel}</td>
                ${
                  this.split
                    ? html`<td class="num">
                          ${this.dollars(t.unrealisedGain)}
                        </td>
                        <td class="num">${this.dollars(t.realisedGain)}</td>`
                    : html`<td class="num">${t.capitalGainLabel}</td>`
                }
                <td class="num">${t.incomeLabel}</td>
                <td class="num">${t.currencyLabel}</td>
                <td class="num">${t.totalReturnLabel}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p class="portfolio-note">
          <span class="price-live-mark" aria-hidden="true">●</span>
          fetched from the market · unmarked prices were entered by hand.
        </p>
      </div>
    `;
  }

  /** Rows grouped under their market, in market order. */
  private groupRows(rows: InvestmentRow[]): {
    market: string;
    rows: InvestmentRow[];
  }[] {
    const groups = new Map<string, InvestmentRow[]>();
    for (const r of rows) {
      const list = groups.get(r.market) ?? [];
      list.push(r);
      groups.set(r.market, list);
    }
    return [...groups.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([market, list]) => ({ market, rows: list }));
  }
}

if (
  typeof customElements !== 'undefined' &&
  !customElements.get('investment-table')
) {
  customElements.define(
    'investment-table',
    InvestmentTable as unknown as CustomElementConstructor,
  );
}
