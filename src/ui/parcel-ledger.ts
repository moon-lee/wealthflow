import { LitElement, html } from 'lit';
import { sharedStyles } from '../styles/shared-styles.js';
import { wealthflowStyles } from '../styles/wealthflow-styles.js';
import type { Parcel } from '../dao/parcels.js';
import { listParcels } from '../dao/parcels.js';
import { listStocks } from '../dao/stocks.js';
import type { ParcelGroup } from '../services/parcel-service.js';
import {
  groupParcels,
  parcelCostBase,
  isDiscountEligible,
  monthsHeld,
} from '../services/parcel-service.js';
import { addMonths, monthsBetween, todayIso } from '../utils/dates.js';
import { formatAUD } from '../utils/format.js';

const Base =
  typeof HTMLElement !== 'undefined'
    ? LitElement
    : (class {} as unknown as typeof LitElement);

export interface ParcelRow extends Parcel {
  costBase: number;
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
  stocks: { id: number; stock_code: string; stock_full_name: string }[] = [];
  expanded = new Set<number>();

  get groups(): ParcelGroup[] {
    return groupParcels(this.stocks, this.parcels, this.asOf);
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
      const [stocks, parcels] = await Promise.all([
        listStocks(this.finance, { status: 'all' }),
        listParcels(this.finance),
      ]);
      this.stocks = stocks;
      this.parcels = parcels;
    } catch (e: any) {
      this.error = String(e?.message || e);
    }
    (this as any).requestUpdate?.();
  }

  toggleGroup(stockId: number): void {
    const next = new Set(this.expanded);
    if (next.has(stockId)) next.delete(stockId);
    else next.add(stockId);
    this.expanded = next;
    (this as any).requestUpdate?.();
  }

  /** Oldest first — that is FIFO's order, so the top row is what a sale eats. */
  expandedParcels(stockId: number): ParcelRow[] {
    return this.parcels
      .filter((p) => p.stock_id === stockId)
      .slice()
      .sort((a, b) => (a.acquired_date < b.acquired_date ? -1 : 1))
      .map((p) => {
        const costBase = parcelCostBase(p);
        return {
          ...p,
          costBase,
          perUnit: p.quantity > 0 ? costBase / p.quantity : 0,
          heldLabel: heldLabel(p.acquired_date, this.asOf),
          discountLabel: discountLabel(p.acquired_date, this.asOf),
        };
      });
  }

  override render(): unknown {
    if (typeof HTMLElement === 'undefined') return html``;
    return html`
      <div class="order-stack">
        <div class="section flush">
          <div class="section-header">
            <h3 class="section-title">Parcels</h3>
            <div class="header-actions">
              <span class="muted">${this.rowCount} parcels</span>
            </div>
          </div>
          <div class="section-body">
            ${
              this.error
                ? html`<p class="field-error">Error: ${this.error}</p>`
                : ''
            }
            <p class="muted">
              Derived from your trade history — parcels are never edited by
              hand. Change a trade and this rebuilds.
            </p>
            ${this.groups.map((g) => this.renderGroup(g))}
          </div>
        </div>
      </div>
    `;
  }

  private renderGroup(g: ParcelGroup): unknown {
    const open = this.expanded.has(g.stockId);
    const rows = open ? this.expandedParcels(g.stockId) : [];
    return html`
      <div class="parcel-group">
        <button
          type="button"
          class="parcel-group-head"
          aria-expanded=${open ? 'true' : 'false'}
          @click=${() => this.toggleGroup(g.stockId)}
        >
          <span>${open ? '▾' : '▸'}</span>
          <b>${g.stockCode}</b>
          <span class="muted">${g.stockName}</span>
          <span style="flex:1"></span>
          ${
            g.notTracked
              ? html`<span class="section-badge">not yet tracked</span>`
              : html`
                  <span>${qty(g.units)} units</span>
                  <span>${g.parcelCount} parcels</span>
                  <span>avg ${formatAUD(g.avgCost)}</span>
                  <span
                    >${qty(g.eligibleUnits)}/${qty(g.units)}
                    discount-eligible</span
                  >
                `
          }
        </button>
        ${
          open && rows.length
            ? html`
                <table class="hist-table">
                  <thead>
                    <tr>
                      <th scope="col">Acquired</th>
                      <th scope="col" class="num">Units</th>
                      <th scope="col" class="num">Cost base</th>
                      <th scope="col" class="num">Per unit</th>
                      <th scope="col" class="num">Held</th>
                      <th scope="col">50% discount</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${rows.map(
                      (p) =>
                        html`<tr>
                          <td>${p.acquired_date}</td>
                          <td class="num">${qty(p.quantity)}</td>
                          <td class="num">${formatAUD(p.costBase)}</td>
                          <td class="num">${formatAUD(p.perUnit)}</td>
                          <td class="num">${p.heldLabel}</td>
                          <td
                            class=${
                              isDiscountEligible(p.acquired_date, this.asOf)
                                ? 'ok'
                                : 'pending'
                            }
                          >
                            ${p.discountLabel}
                          </td>
                        </tr>`,
                    )}
                  </tbody>
                </table>
              `
            : ''
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
