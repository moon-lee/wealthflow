import type { FinanceApi } from 'finance';
import type { Stock } from '../dao/stocks.js';
import { listStocks } from '../dao/stocks.js';
import type { Trade } from '../dao/trades.js';
import { listTrades } from '../dao/trades.js';
import type { Parcel } from '../dao/parcels.js';
import { listParcels } from '../dao/parcels.js';
import type { DividendEntry } from '../dao/dividends.js';
import { listDividends } from '../dao/dividends.js';
import type { DisposalRow } from '../dao/disposals.js';
import { listDisposals } from '../dao/disposals.js';
import { latestPrices, type CurrentPrice } from '../dao/prices.js';
import { carriedForwardFor } from '../dao/capital-losses.js';
import { openCostBase } from './amit-service.js';
import { xirr, type CashFlow } from './xirr.js';
import { computeFinanceYear } from '../utils/finance-year.js';

/**
 * The portfolio view: what you hold, what it is worth, and what it has
 * returned.
 *
 * Nothing here is stored. Every figure is derived from the ledger on read,
 * the same rule the parcels follow — so a correction to a trade flows straight
 * through to the tax number without a rebuild step anyone can forget.
 */

/** Days after which a manually-entered price is flagged as stale. */
const STALE_AFTER_DAYS = 7;

/**
 * Which cost base the portfolio view measures its gains against.
 *
 * - `pre`  - what you actually PAID. The gain on your outlay. This is what
 *   ShareSight shows, and it is the default.
 * - `post` - your TAX cost base: what you paid, less the AMIT adjustments the
 *   trust has credited to you. A lower cost base means a larger taxable gain
 *   when you sell, so this is the number that reconciles with the CGT section.
 *
 * The AMIT adjustment is a notional benefit that only crystallises on a
 * disposal, so neither is "more correct": they answer different questions.
 */
export type AmitBasis = 'pre' | 'post';

/** The setting the basis is stored in. Namespaced to this extension. */
export const AMIT_BASIS_SETTING = 'wealthflow.amitBasis';

/**
 * Read the chosen basis, defaulting to `pre`.
 *
 * The service reads it rather than taking it as a parameter, so the
 * Investment table and the Trades Summary - which each hold their own copy of
 * the summary - can never be on different bases. One setting, one answer.
 */
export async function readAmitBasis(finance: FinanceApi): Promise<AmitBasis> {
  try {
    const raw = await finance.settings?.get(AMIT_BASIS_SETTING);
    return raw === 'post' ? 'post' : 'pre';
  } catch {
    // A missing or broken settings store must not take the screen down.
    return 'pre';
  }
}

/** Store the chosen basis. */
export async function writeAmitBasis(
  finance: FinanceApi,
  basis: AmitBasis,
): Promise<void> {
  await finance.settings?.set(AMIT_BASIS_SETTING, basis);
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
}

function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
}

/**
 * The market a holding trades on.
 *
 * `wealthflow_stocks` has no market column and the app cannot migrate one,
 * so this is derived. Every holding is ASX-listed, so it returns 'ASX' for
 * all of them today. The grouping code reads only this function, so a real
 * market column can replace it later without touching the grouping.
 */
export function marketOf(stock: { stock_code: string }): string {
  void stock;
  return 'ASX';
}

export interface HoldingSummary {
  stockId: number;
  code: string;
  name: string;
  market: string;
  /** Units still held: acquired, less whatever a disposal consumed. */
  units: number;
  price: number | null;
  priceAsAt: string | null;
  priceSource: string | null;
  /** units x price. Null when the holding has never been priced. */
  value: number | null;
  /** What was actually paid for the open units - the PRE-AMIT basis. The same
   *  number whichever basis the gain is measured on. */
  costBasePreAdjustment: number;
  /** This position's share of the fund's AMIT adjustment. Signed. Zero on a
   *  holding with no adjustments at all (FGX is an LIC, not a trust). */
  amitShare: number;
  /** The cost base the gain is measured against: the pre-AMIT figure on the
   *  `pre` basis, that figure less the AMIT share on the `post` basis. */
  costBase: number;
  /** market value - cost base. Null when there is no price. */
  unrealisedGain: number | null;
  /** Proceeds less the cost base of everything sold, all time, pre-discount,
   *  on the SAME footing as the unrealised half. */
  realisedGain: number;
  /** Gross distributions, all time. Franking credits are not cash. */
  income: number;
  franking: number;
  /** unrealised + realised. Null when there is no price. */
  capitalGain: number | null;
  totalReturn: number | null;
  /** The holding's own annualised (money-weighted) return, as a decimal. */
  returnRate: number | null;
  /** That rate, allocated between the capital gain and the income by their
   *  dollar contributions — the same rule the portfolio total uses. */
  capitalGainRate: number | null;
  incomeRate: number | null;
}

export interface PortfolioSummary {
  asOf: string;
  /** Which cost base the gains are measured against. Reported so a consumer
   *  knows which question the numbers answer, and so the screen can say so. */
  amitBasis: AmitBasis;
  /** Null when any holding is unpriced — a partial total is not a total. */
  totalValue: number | null;
  totalCostBase: number;
  totalCapitalGain: number | null;
  totalIncome: number;
  totalReturn: number | null;
  /** The money-weighted annualised return. Null when there is no solution. */
  totalReturnRate: number | null;
  /** The total rate, allocated by dollar contribution. */
  capitalGainRate: number | null;
  incomeRate: number | null;
  currencyGain: number;
  currencyGainRate: number;
  carriedForwardLoss: number;
  hasOpeningBalance: boolean;
  /** The OLDEST price date, because a value is no more current than its
   *  stalest input. */
  priceAsAt: string | null;
  stalePrices: boolean;
  /** True when every priced holding's price was FETCHED from the market
   *  rather than typed in. A portfolio value built from hand-typed prices can
   *  be quietly wrong, and the screen should be able to say so. */
  pricesLive: boolean;
  holdings: HoldingSummary[];
  /** The dated series the XIRR was solved from, exposed so the cash-flow
   *  identity is assertable rather than trusted. */
  cashFlows: CashFlow[];
}

/** Units still held for a stock: acquired less consumed by disposals. */
function openUnits(
  parcels: Parcel[],
  disposals: DisposalRow[],
  stockId: number,
): number {
  const acquired = parcels
    .filter((p) => p.stock_id === stockId)
    .reduce((s, p) => s + p.quantity, 0);
  const sold = disposals
    .filter((d) => d.stock_id === stockId)
    .reduce((s, d) => s + d.quantity, 0);
  return round4(acquired - sold);
}

export async function getPortfolioSummary(
  finance: FinanceApi,
  asOf?: string,
): Promise<PortfolioSummary> {
  const when = asOf ?? todayIso();
  // The basis is read HERE, once, so every figure in this summary - and every
  // section that renders one - is on the same footing.
  const amitBasis = await readAmitBasis(finance);
  const [stocks, trades, parcels, dividends, disposals, prices] =
    await Promise.all([
      listStocks(finance, { status: 'all' }),
      listTrades(finance),
      listParcels(finance),
      listDividends(finance),
      listDisposals(finance),
      latestPrices(finance),
    ]);

  const holdings: HoldingSummary[] = [];
  for (const stock of stocks) {
    const units = openUnits(parcels, disposals, stock.id);
    if (units === 0) continue;
    const current: CurrentPrice | undefined = prices.get(stock.id);
    const cost = await openCostBase(finance, stock.id, when);
    const value = current ? round4(units * current.price) : null;
    // The gain is measured against the cost base the user chose:
    //
    //   pre  - what was actually PAID. The AMIT adjustment is a notional tax
    //          benefit that only crystallises on a disposal, so it is not part
    //          of what the paper gain is measured against.
    //   post - the tax basis: what you paid, less the AMIT adjustment the
    //          trust credited to you. This is the basis the CGT section uses.
    //
    // The CGT section always uses `post`, whatever this is set to. That one is
    // the law.
    const basis = amitBasis === 'post' ? cost.costBase : cost.preAdjustment;
    const unrealisedGain = value === null ? null : round4(value - basis);
    // The realised half sits on the SAME footing: a disposal's stored gain is
    // measured against its POST-AMIT cost base, so on the pre-AMIT basis the
    // AMIT share is added back to put it alongside the unrealised half. One
    // footing, or the two halves would not add up to the total.
    const realisedGain = round4(
      disposals
        .filter((d) => d.stock_id === stock.id)
        .reduce(
          (s, d) =>
            s + d.nominal_gain + (amitBasis === 'pre' ? d.amit_share : 0),
          0,
        ),
    );
    const capitalGain =
      unrealisedGain === null ? null : round4(unrealisedGain + realisedGain);
    const stockDividends = dividends.filter((d) => d.stock_id === stock.id);
    const income = round4(stockDividends.reduce((s, d) => s + d.gross, 0));
    const franking = round4(
      stockDividends.reduce((s, d) => s + (d.franking ?? 0), 0),
    );

    // The holding's OWN annualised return: the same cash-flow series as the
    // portfolio's, for this holding alone. The table's % mode shows these, so
    // the number beside a holding is that holding's rate — and the total row
    // is the portfolio's, which is the same figure the Trades Summary shows.
    const holdingFlows: CashFlow[] = [];
    for (const t of trades as Trade[]) {
      if (t.stock_id !== stock.id) continue;
      holdingFlows.push({
        date: t.date,
        amount:
          t.side === 'buy'
            ? -round4(t.price * t.quantity + t.brokerage)
            : round4(t.price * t.quantity),
      });
    }
    for (const d of stockDividends)
      holdingFlows.push({ date: d.date, amount: round4(d.gross) });
    if (value !== null) holdingFlows.push({ date: when, amount: value });

    const returnRate = xirr(holdingFlows, when);
    let capitalGainRate: number | null = null;
    let incomeRate: number | null = null;
    if (returnRate !== null) {
      const base = capitalGain === null ? null : capitalGain + income;
      if (base === 0) {
        capitalGainRate = 0;
        incomeRate = 0;
      } else if (base !== null && capitalGain !== null) {
        capitalGainRate = returnRate * (capitalGain / base);
        incomeRate = returnRate - capitalGainRate;
      }
    }
    holdings.push({
      stockId: stock.id,
      code: stock.stock_code,
      name: stock.stock_full_name,
      market: marketOf(stock),
      units,
      price: current ? current.price : null,
      priceAsAt: current ? current.asAt : null,
      priceSource: current ? current.source : null,
      value,
      costBasePreAdjustment: cost.preAdjustment,
      amitShare: cost.amitShare,
      costBase: basis,
      unrealisedGain,
      realisedGain,
      capitalGain,
      income,
      franking,
      totalReturn: capitalGain === null ? null : round4(capitalGain + income),
      returnRate,
      capitalGainRate,
      incomeRate,
    });
  }
  holdings.sort((a, b) => a.code.localeCompare(b.code));

  const priced = holdings.filter((h) => h.value !== null);
  const allPriced = priced.length === holdings.length;
  const totalValue = allPriced
    ? round4(priced.reduce((s, h) => s + (h.value ?? 0), 0))
    : null;
  const totalCostBase = round4(holdings.reduce((s, h) => s + h.costBase, 0));
  const totalCapitalGain = allPriced
    ? round4(holdings.reduce((s, h) => s + (h.capitalGain ?? 0), 0))
    : null;
  const totalIncome = round4(holdings.reduce((s, h) => s + h.income, 0));
  const totalReturn = allPriced
    ? round4(holdings.reduce((s, h) => s + (h.totalReturn ?? 0), 0))
    : null;

  // ---- The cash-flow series --------------------------------------------
  // Buys are money out, sells and distributions are money in, and what is
  // still held is the terminal value. A distribution and its DRP land on the
  // same date and net to zero: the cash arrived and was immediately spent on
  // units that are still in the terminal value.
  const flows: CashFlow[] = [];
  for (const t of trades as Trade[]) {
    if (t.side === 'buy') {
      flows.push({
        date: t.date,
        amount: -round4(t.price * t.quantity + t.brokerage),
      });
    } else {
      flows.push({ date: t.date, amount: round4(t.price * t.quantity) });
    }
  }
  for (const d of dividends as DividendEntry[]) {
    flows.push({ date: d.date, amount: round4(d.gross) });
  }
  if (totalValue !== null) flows.push({ date: when, amount: totalValue });

  const totalReturnRate = xirr(flows, when);

  let capitalGainRate: number | null = null;
  let incomeRate: number | null = null;
  if (totalReturnRate !== null) {
    const base =
      totalCapitalGain === null ? null : totalCapitalGain + totalIncome;
    if (base === 0) {
      capitalGainRate = 0;
      incomeRate = 0;
    } else if (base !== null && totalCapitalGain !== null) {
      // No rounding here: these are ratios, not money, and rounding them
      // would stop the two rates from adding up to the total they came from.
      capitalGainRate = totalReturnRate * (totalCapitalGain / base);
      incomeRate = totalReturnRate - capitalGainRate;
    }
  }

  const priceDates = priced
    .map((h) => h.priceAsAt)
    .filter((d): d is string => !!d);
  const priceAsAt = priceDates.length
    ? priceDates.reduce((min, d) => (d < min ? d : min))
    : null;
  const stalePrices =
    priceAsAt !== null && daysBetween(priceAsAt, when) > STALE_AFTER_DAYS;
  const pricesLive =
    priced.length > 0 && priced.every((h) => h.priceSource === 'api');

  const fy = computeFinanceYear(when, '07-01') ?? '';
  const carriedForwardLoss = await carriedForwardFor(finance, fy);

  return {
    asOf: when,
    amitBasis,
    totalValue,
    totalCostBase,
    totalCapitalGain,
    totalIncome,
    totalReturn,
    totalReturnRate,
    capitalGainRate,
    incomeRate,
    // Every holding is AUD, so there is no currency gain to report. It is
    // shown as zero rather than hidden, because a row that appears when it is
    // needed beats a row that appears when it is wanted.
    currencyGain: 0,
    currencyGainRate: 0,
    carriedForwardLoss,
    hasOpeningBalance: carriedForwardLoss > 0,
    priceAsAt,
    stalePrices,
    pricesLive,
    holdings,
    cashFlows: flows,
  };
}

export type { Stock };
