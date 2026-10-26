import { LitElement, html } from 'lit';
import { sharedStyles } from '../styles/shared-styles.js';
import { wealthflowStyles } from '../styles/wealthflow-styles.js';
import type { Parcel } from '../dao/parcels.js';
import { listParcels } from '../dao/parcels.js';
import type { DisposalRow } from '../dao/disposals.js';
import { listDisposals } from '../dao/disposals.js';
import { listStocks } from '../dao/stocks.js';
import type { ParcelGroup } from '../services/parcel-service.js';
import {
  groupParcels,
  parcelCostBase,
  isDiscountEligible,
  monthsHeld,
  remainingOf,
} from '../services/parcel-service.js';
import { addMonths, monthsBetween, todayIso } from '../utils/dates.js';
import { formatAUD, formatPrice } from '../utils/format.js';
import { dateSortHeader } from './sort-header.js';

const Base =
  typeof HTMLElement !== 'undefined'
    ? LitElement
    : (class {} as unknown as typeof LitElement);

export interface ParcelRow extends Parcel {
  /** The class the discount cell carries. Computed here rather than in the
   *  template: a CONDITIONAL class binding in an attribute misaligns lit's
   *  bindings for the whole template. */
  discountClass: string;
  costBase: number;
  /** Units of this lot still held, after the disposals that consumed it. */
  remaining: number;
  perUnit: number;
  heldLabel: string;
  discountLabel: string;
}

/**
 * `months` is a month-INDEX difference, not elapsed whole months: a parcel
 * qualifying 2027-09-10 seen from 2026-10-16 is 10 months and 25 days away, and
 * its label is "In 11 months" because that is the month it lands in.
 */
function discountLabel(acquired: string, asOf: string): string {
  const eligibleOn = addMonths(acquired, 12);
  if (asOf === eligibleOn) return 'Eligible today';
  if (asOf > eligibleOn) return 'Eligible';
  const months =
    Number(eligibleOn.slice(0, 4)) * 12 +
    Number(eligibleOn.slice(5, 7)) -
    (Number(asOf.slice(0, 4)) * 12 + Number(asOf.slice(5, 7)));
  return months <= 1 ? 'In under a month' : `In ${months} months`;
}

function heldLabel(acquired: string, asOf: string): string {
  const m = monthsHeld(acquired, asOf);
  if (m < 12) return `${m} mo`;
  const y = Math.floor(m / 12);
  const rem = m % 12;
  return rem === 0 ? `${y} yr` : `${y} yr ${rem} mo`;
}

function qty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(4);
}

/**
 * The parcel ledger, grouped by holding and expanding into lots.
 *
 * It READS wealthflow_parcels and never recomputes it. A ledger the user
 * believes they can edit is a ledger they will break; the header says so.
 */
export class ParcelLedger extends Base {
  static override styles =
    typeof HTMLElement !== 'undefined'
      ? ([sharedStyles, wealthflowStyles] as any)
      : [];
  finance: any = null;
  error = '';
  asOf = todayIso();
  parcels: Parcel[] = [];
  disposals: DisposalRow[] = [];
  stocks: { id: number; stock_code: string; stock_full_name: string }[] = [];
  /** The card whose parcels are open; null when every card is closed. */
  selectedStockId: number | null = null;
  page = 0;
  /** Acquired-column order. True is latest-first, the default. */
  acquiredSortDesc = true;
  readonly pageSize = 10;

  get groups(): ParcelGroup[] {
    return groupParcels(this.stocks, this.parcels, this.asOf, this.disposals);
  }

  get rowCount(): number {
    return this.parcels.length;
  }

  async setFinance(f: any): Promise<void> {
    this.finance = f;
    await this.reload();
  }

  async reload(): Promise<void> {
    if (!this.finance) return;
    this.error = '';
    try {
      const [stocks, parcels, disposals] = await Promise.all([
        listStocks(this.finance, { status: 'all' }),
        listParcels(this.finance),
        listDisposals(this.finance),
      ]);
      this.stocks = stocks;
      this.parcels = parcels;
      this.disposals = disposals;
    } catch (e: any) {
      this.error = String(e?.message || e);
    }
    (this as any).requestUpdate?.();
  }

  /** A second click on the open card closes it. */
  selectStock(stockId: number): void {
    if (this.selectedStockId === stockId) {
      this.selectedStockId = null;
      this.page = 0;
      (this as any).requestUpdate?.();
      return;
    }
    this.selectedStockId = stockId;
    this.page = 0;
    (this as any).requestUpdate?.();
  }

  /** Flip the Acquired order and return to page one: page 3 of the old order
   * is rarely page 3 of the new one. */
  sortByAcquired(): void {
    this.acquiredSortDesc = !this.acquiredSortDesc;
    this.page = 0;
    (this as any).requestUpdate?.();
  }

  /** Latest first by default, like the logs. The header flips it to oldest
   * first, which is FIFO's reading order. */
  expandedParcels(stockId: number): ParcelRow[] {
    const dir = this.acquiredSortDesc ? -1 : 1;
    return this.parcels
      .filter((p) => p.stock_id === stockId)
      .slice()
      .sort((a, b) => {
        if (a.acquired_date !== b.acquired_date)
          return (a.acquired_date < b.acquired_date ? -1 : 1) * dir;
        // Same-day parcels break by id, so paging cannot show one twice.
        return (a.id - b.id) * dir;
      })
      .map((p) => {
        const costBase = parcelCostBase(p);
        // How much of the lot is LEFT. A lot that was partly sold shows what
        // remains of it, not what was bought.
        const remaining = remainingOf(p, this.disposals);
        return {
          ...p,
          costBase,
          remaining,
          perUnit: remaining > 0 ? costBase / remaining : 0,
          heldLabel: heldLabel(p.acquired_date, this.asOf),
          discountLabel: discountLabel(p.acquired_date, this.asOf),
          discountClass: isDiscountEligible(p.acquired_date, this.asOf)
            ? 'ok'
            : 'pending',
        };
      });
  }

  override render(): unknown {
    if (typeof HTMLElement === 'undefined') return html``;
    const codes = ['FGX', 'VAS', 'VHY'];
    const cardGroups = codes
      .map((code) => {
        const stock = this.stocks.find((s) => s.stock_code === code);
        if (!stock) return null;
        return this.groups.find((g) => g.stockId === stock.id) || null;
      })
      .filter(Boolean) as ParcelGroup[];

    return html`
      <div>
        ${
          this.error
            ? html`<p class="field-error">Error: ${this.error}</p>`
            : ''
        }
        <p class="muted">
          Derived from your trade history — parcels are never edited by hand.
          Change a trade and this rebuilds.
        </p>
        <div class="parcel-cards">
          ${cardGroups.map((g) => this.renderCard(g))}
        </div>
        ${
          this.selectedStockId
            ? (() => {
                const g = this.groups.find(
                  (x) => x.stockId === this.selectedStockId,
                );
                return g ? this.renderGroupDetail(g) : '';
              })()
            : ''
        }
      </div>
    `;
  }

  private renderCard(g: ParcelGroup): unknown {
    const selected = this.selectedStockId === g.stockId;
    return html`
      <button
        type="button"
        class="btn btn-secondary parcel-card${selected ? ' is-selected' : ''}"
        @click=${() => this.selectStock(g.stockId)}
      >
        <div class="parcel-card-body">
          <div class="parcel-card-code">${g.stockCode}</div>
          <div class="muted parcel-card-name">${g.stockName}</div>
          ${
            g.notTracked
              ? html`<div class="muted parcel-card-note">not yet tracked</div>`
              : html`<div class="parcel-card-stats">
                  <span>${qty(g.units)} units</span>
                  <span>${g.parcelCount} parcels</span>
                  <span>avg ${formatPrice(g.avgCost)}</span>
                </div>`
          }
        </div>
      </button>
    `;
  }

  private renderGroupDetail(g: ParcelGroup): unknown {
    const rows = this.expandedParcels(g.stockId);
    const pages = Math.max(1, Math.ceil(rows.length / this.pageSize));
    if (this.page >= pages) this.page = pages - 1;
    const start = this.page * this.pageSize;
    const pageRows = rows.slice(start, start + this.pageSize);
    return html`
      <div class="parcel-group-detail">
        ${
          rows.length
            ? html`
                <div>
                  <table class="hist-table">
                    <thead>
                      <tr>
                        <th
                          scope="col"
                          aria-sort=${this.acquiredSortDesc ? 'descending' : 'ascending'}
                        >
                          ${dateSortHeader(
                            'Acquired',
                            this.acquiredSortDesc,
                            () => this.sortByAcquired(),
                          )}
                        </th>
                        <th scope="col" class="num">Units</th>
                        <th scope="col" class="num">Cost base</th>
                        <th scope="col" class="num">Per unit</th>
                        <th scope="col" class="num">Held</th>
                        <th scope="col">50% discount</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${pageRows.map(
                        (p) =>
                          html`<tr>
                            <td class="mono">${p.acquired_date}</td>
                            <td class="num">${qty(p.remaining)}</td>
                            <td class="num">${formatAUD(p.costBase)}</td>
                            <td class="num">${formatPrice(p.perUnit)}</td>
                            <td class="num">${p.heldLabel}</td>
                            <td class=${p.discountClass}>${p.discountLabel}</td>
                          </tr>`,
                      )}
                    </tbody>
                  </table>
                  ${
                    pages > 1
                      ? html`<div class="table-pager">
                          <span class="muted"
                            >Page ${this.page + 1} of ${pages} · ${rows.length}
                            parcels</span
                          >
                          <div class="pager-actions">
                            <button
                              class="btn btn-secondary btn-small"
                              type="button"
                              ?disabled=${this.page === 0}
                              @click=${() => {
                                this.page = Math.max(0, this.page - 1);
                                (this as any).requestUpdate?.();
                              }}
                            >
                              Previous
                            </button>
                            <button
                              class="btn btn-secondary btn-small"
                              type="button"
                              ?disabled=${this.page >= pages - 1}
                              @click=${() => {
                                this.page = Math.min(pages - 1, this.page + 1);
                                (this as any).requestUpdate?.();
                              }}
                            >
                              Next
                            </button>
                          </div>
                        </div>`
                      : ''
                  }
                </div>
              `
            : html`<p class="muted">No parcels.</p>`
        }
      </div>
    `;
  }
}

if (
  typeof customElements !== 'undefined' &&
  !customElements.get('parcel-ledger')
) {
  customElements.define(
    'parcel-ledger',
    ParcelLedger as unknown as CustomElementConstructor,
  );
}
