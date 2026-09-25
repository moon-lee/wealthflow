import type { FinanceApi } from 'finance';
import type { Stock } from '../dao/stocks.js';
import type { DividendEntry } from '../dao/dividends.js';
import { listDividends } from '../dao/dividends.js';
import type { DividendSummary } from './public-wealth-adapter.js';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export const DIVIDEND_TYPE_LABELS = {
  non_trust: 'Non Trust',
  trust: 'Trust (ETF)',
  foreign: 'Foreign',
} as const;

export function sumDividends(
  financialYear: string,
  stocks: Pick<Stock, 'id' | 'code' | 'name'>[],
  entries: Pick<DividendEntry, 'stock_id' | 'type' | 'gross' | 'franking'>[],
): DividendSummary {
  const byType = {
    non_trust: { gross: 0, franking: 0 },
    trust: { gross: 0, franking: 0 },
    foreign: { gross: 0, franking: 0 },
  };
  for (const e of entries) {
    const t = (e.type in byType ? e.type : 'non_trust') as keyof typeof byType;
    byType[t].gross = round2(byType[t].gross + Number(e.gross ?? 0));
    byType[t].franking = round2(byType[t].franking + Number(e.franking ?? 0));
  }
  const byStock = stocks.map((s) => {
    const mine = entries.filter((e) => e.stock_id === s.id);
    return {
      stockId: s.id,
      code: s.code,
      name: s.name,
      gross: round2(mine.reduce((x, e) => x + Number(e.gross ?? 0), 0)),
      franking: round2(mine.reduce((x, e) => x + Number(e.franking ?? 0), 0)),
    };
  });
  return {
    financialYear,
    gross: round2(entries.reduce((x, e) => x + Number(e.gross ?? 0), 0)),
    franking: round2(entries.reduce((x, e) => x + Number(e.franking ?? 0), 0)),
    byType,
    byStock,
  };
}

export async function getDividendTotals(
  finance: FinanceApi,
  stocks: Pick<Stock, 'id' | 'code' | 'name'>[],
  financeYear: string,
): Promise<DividendSummary> {
  const entries = await listDividends(finance, { financeYear });
  return sumDividends(financeYear, stocks, entries);
}
