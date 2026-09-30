import type { FinanceApi } from 'finance';
import { fyEndDate } from '../utils/finance-year.js';
import type { SuperEntry, SuperKind } from '../dao/super-entries.js';
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
  const inFy = (kind: SuperKind) =>
    entries.filter((e) => e.kind === kind && e.finance_year === financialYear);
  // Private and employer money stay in separate buckets: only the first one is
  // a Tax deduction, so a consumer must never have to subtract to find it.
  const mine = inFy('contribution');
  const employer = inFy('sg');
  const total = (rows: typeof entries) =>
    round2(rows.reduce((x, e) => x + Number(e.amount ?? 0), 0));
  return {
    financialYear,
    balance: top ? { amount: Number(top.amount), date: top.date } : null,
    contributions: { total: total(mine), count: mine.length },
    sg: { total: total(employer), count: employer.length },
  };
}

export async function getSuperTotals(
  finance: FinanceApi,
  financeYear: string,
): Promise<SuperSummary> {
  const entries = await listSuperEntries(finance, {});
  return sumSuper(financeYear, entries);
}
