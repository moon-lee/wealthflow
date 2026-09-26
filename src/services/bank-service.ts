import type { FinanceApi } from 'finance';
import {
  computeFinanceYear,
  fyMonths,
  monthKey,
  nextMonthKey,
  nextMonthSameDay,
} from '../utils/finance-year.js';
import type { Bank } from '../dao/banks.js';
import type { InterestEntry } from '../dao/interest-entries.js';
import {
  createInterestEntry,
  listInterestEntries,
} from '../dao/interest-entries.js';
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

/** One entry a repeat would create. */
export interface InterestRepeatRow {
  bankId: number;
  bank_code: string;
  date: string;
  amount: number;
  notes: string | null;
}

export interface InterestRepeatPlan {
  /** Latest month holding any entry, or null when nothing has been logged. */
  sourceMonth: string | null;
  targetMonth: string | null;
  rows: InterestRepeatRow[];
}

export interface InterestRepeatOutcome {
  copied: InterestRepeatRow[];
  skipped: { bankId: number; bank_code: string; reason: string }[];
}

/**
 * What a repeat of the newest month would do: every bank that paid in the latest
 * month on record, re-dated one month on and keeping its amount and notes.
 *
 * The source is the latest month rather than a month inside the current FY, so
 * repeating still works in July, when the last entry logged belongs to the
 * financial year that just closed. Planning separately from writing lets the
 * caller confirm with the user before anything touches the database.
 */
export async function planInterestMonthRepeat(
  finance: FinanceApi,
  banks: Pick<Bank, 'id' | 'bank_code'>[],
): Promise<InterestRepeatPlan> {
  const entries = await listInterestEntries(finance);
  if (entries.length === 0)
    return { sourceMonth: null, targetMonth: null, rows: [] };
  const sourceMonth = monthKey(entries[entries.length - 1]!.date);
  const targetMonth = nextMonthKey(sourceMonth);
  const rows = entries
    .filter((e) => monthKey(e.date) === sourceMonth)
    .map((e) => ({
      bankId: e.bank_id,
      bank_code:
        banks.find((b) => b.id === e.bank_id)?.bank_code ?? `#${e.bank_id}`,
      date: nextMonthSameDay(e.date),
      amount: Number(e.amount),
      notes: e.notes ?? null,
    }));
  return { sourceMonth, targetMonth, rows };
}

/**
 * Write a planned repeat. A bank that already has an entry in the target month
 * — or has been deactivated — is reported as skipped instead of aborting the
 * rest of the batch.
 */
export async function applyInterestMonthRepeat(
  finance: FinanceApi,
  plan: InterestRepeatPlan,
  fyStart = '07-01',
): Promise<InterestRepeatOutcome> {
  const outcome: InterestRepeatOutcome = { copied: [], skipped: [] };
  for (const row of plan.rows) {
    try {
      await createInterestEntry(
        finance,
        {
          bank_id: row.bankId,
          date: row.date,
          amount: row.amount,
          finance_year: computeFinanceYear(row.date, fyStart) ?? undefined,
          notes: row.notes,
        },
        fyStart,
      );
      outcome.copied.push(row);
    } catch (e: any) {
      outcome.skipped.push({
        bankId: row.bankId,
        bank_code: row.bank_code,
        reason: String(e?.message || e),
      });
    }
  }
  return outcome;
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
