import type { FinanceApi } from 'finance';
import type { DisposalRow } from '../dao/disposals.js';
import { listDisposals } from '../dao/disposals.js';
import { carriedForwardFor } from '../dao/capital-losses.js';
import { listStocks } from '../dao/stocks.js';
import { summariseYear, type CapitalGainsSummary } from './cgt-service.js';
import type { Trade } from '../dao/trades.js';
import { listTrades } from '../dao/trades.js';
import { computeFinanceYear } from '../utils/finance-year.js';

/**
 * The FY capital gains summary. This is the number a tax agent asks for, so it
 * is computed from the stored disposals rather than recomputed on read — the
 * disposals are the record, and the summary is a view of them.
 */
export async function getCapitalGainsSummary(
  finance: FinanceApi,
  financialYear: string,
): Promise<CapitalGainsSummary> {
  const [disposals, opening, stocks, sells] = await Promise.all([
    listDisposals(finance, { financeYear: financialYear }),
    carriedForwardFor(finance, financialYear),
    listStocks(finance, { status: 'all' }),
    listTrades(finance),
  ]);

  const codeOf = new Map(stocks.map((s) => [s.id, s.stock_code]));
  const rows = disposals.map((d) => ({
    stockId: d.stock_id,
    stockCode: codeOf.get(d.stock_id) ?? `#${d.stock_id}`,
    disposalDate: d.disposal_date,
    proceeds: d.proceeds,
    costBase: d.cost_base,
    nominalGain: d.nominal_gain,
    adjustment: d.discount_applied,
    netGain: d.net_gain,
  }));

  const summary = summariseYear(rows, financialYear, opening);
  // Counted from the trades, not the disposals: a sell that split across three
  // parcels is ONE sell, and reporting "3 disposals" in the badge would misstate
  // what the taxpayer did.
  const sellCount = (sells as Trade[]).filter(
    (t) =>
      t.side === 'sell' &&
      computeFinanceYear(t.date, '07-01') === financialYear,
  ).length;
  return { ...summary, sellCount };
}

export type { CapitalGainsSummary };
export type { DisposalRow };
