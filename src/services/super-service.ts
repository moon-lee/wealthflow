import type { FinanceApi } from 'finance';
import { fyEndDate } from '../utils/finance-year.js';
import type { SuperEntry } from '../dao/super-entries.js';
import { listSuperEntries } from '../dao/super-entries.js';
import type { SuperSummary } from './public-wealth-adapter.js';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function sumSuper(
  financialYear: string,
  entries: Pick<SuperEntry, 'date' | 'kind' | 'amount' | 'finance_year'>[],
): SuperSummary {
  const end = fyEndDate(financialYear);
  const balances = entries
    .filter((e) => e.kind === 'balance' && e.date <= end)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const top = balances[0];
  const mine = entries.filter(
    (e) => e.kind === 'contribution' && e.finance_year === financialYear,
  );
  return {
    financialYear,
    balance: top ? { amount: Number(top.amount), date: top.date } : null,
    contributions: {
      total: round2(mine.reduce((x, e) => x + Number(e.amount ?? 0), 0)),
      count: mine.length,
    },
  };
}

export async function getSuperTotals(
  finance: FinanceApi,
  financeYear: string,
): Promise<SuperSummary> {
  const entries = await listSuperEntries(finance, {});
  return sumSuper(financeYear, entries);
}
