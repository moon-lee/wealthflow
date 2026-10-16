export function addMonths(iso: string, months: number): string {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  const total = m - 1 + months;
  const year = y + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  // Clamp to the target month's length: 29 Feb + 12 months lands on 28 Feb in
  // a non-leap year, and must not roll over into March.
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Whole months between two ISO dates, truncated toward zero. */
export function monthsBetween(from: string, to: string): number {
  const a = Number(from.slice(0, 4)) * 12 + Number(from.slice(5, 7));
  const b = Number(to.slice(0, 4)) * 12 + Number(to.slice(5, 7));
  if (to.slice(8, 10) < from.slice(8, 10)) return b - a - 1;
  return b - a;
}

/** Today as `YYYY-MM-DD`, UTC so the answer does not shift with the clock. */
export function todayIso(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
}
