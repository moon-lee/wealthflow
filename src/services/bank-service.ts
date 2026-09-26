import type { FinanceApi } from 'finance';
import { fyMonths, monthKey } from '../utils/finance-year.js';
import type { Bank } from '../dao/banks.js';
import type { InterestEntry } from '../dao/interest-entries.js';
import { listInterestEntries } from '../dao/interest-entries.js';
import type { InterestSummary } from './public-wealth-adapter.js';

export function validateBsb(bsb: string | null | undefined): string | null {
  if (bsb == null || bsb === '') return null;
  return /^\d{6}$/.test(bsb.replace(/\D/g, '')) ? null : 'BSB must be 6 digits';
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function sumInterestByBank(
  banks: Pick<Bank, 'id' | 'bank_code'>[],
  entries: Pick<InterestEntry, 'bank_id' | 'amount'>[],
): {
  total: number;
  byBank: { bankId: number; bank_code: string; total: number }[];
} {
  const byBank = banks.map((b) => ({
    bankId: b.id,
    bank_code: b.bank_code,
    total: round2(
      entries
        .filter((e) => e.bank_id === b.id)
        .reduce((s, e) => s + Number(e.amount ?? 0), 0),
    ),
  }));
  return { total: round2(byBank.reduce((s, b) => s + b.total, 0)), byBank };
}

export async function getInterestTotals(
  finance: FinanceApi,
  banks: Pick<Bank, 'id' | 'bank_code'>[],
  financeYear: string,
): Promise<InterestSummary> {
  const entries = await listInterestEntries(finance, { financeYear });
  const { total, byBank } = sumInterestByBank(banks, entries);
  return { financialYear: financeYear, total, byBank };
}

export function interestGridModel(
  fy: string,
  banks: Pick<Bank, 'id' | 'bank_code'>[],
  entries: InterestEntry[],
): {
  months: string[];
  cells: Record<string, Record<number, number | null>>;
  rowTotals: Record<string, number>;
  colTotals: Record<number, number>;
  grandTotal: number;
} {
  const months = fyMonths(fy);
  const cells: Record<string, Record<number, number | null>> = {};
  const rowTotals: Record<string, number> = {};
  const colTotals: Record<number, number> = {};
  for (const b of banks) colTotals[b.id] = 0;
  let grand = 0;
  for (const m of months) {
    cells[m] = {};
    let row = 0;
    for (const b of banks) {
      const hit = entries.find(
        (e) => e.bank_id === b.id && monthKey(e.date) === m,
      );
      cells[m][b.id] = hit ? Number(hit.amount) : null;
      row += hit ? Number(hit.amount) : 0;
      colTotals[b.id] = round2(
        colTotals[b.id] + (hit ? Number(hit.amount) : 0),
      );
    }
    rowTotals[m] = round2(row);
    grand = round2(grand + row);
  }
  return { months, cells, rowTotals, colTotals, grandTotal: grand };
}
