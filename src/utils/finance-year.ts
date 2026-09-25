const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoDate(s: string): boolean {
  if (!ISO_RE.test(s)) return false;
  const t = Date.parse(s + 'T00:00:00Z');
  return !Number.isNaN(t);
}

/** Compute the FY label (e.g. `'2025-2026'`) containing `date` for AU July-start years. */
export function computeFinanceYear(date: string, fyStart: string): string | null {
  const ts = Date.parse(date + 'T00:00:00Z');
  if (Number.isNaN(ts)) return null;
  const [mm, dd] = fyStart.split('-');
  if (!mm || !dd) return null;
  const d = new Date(ts);
  const year = d.getUTCFullYear();
  const startThis = Date.parse(`${year}-${mm}-${dd}T00:00:00Z`);
  const startLast = Date.parse(`${year - 1}-${mm}-${dd}T00:00:00Z`);
  const fyStartYear = ts >= startThis ? year : ts >= startLast ? year - 1 : NaN;
  if (!Number.isFinite(fyStartYear)) return null;
  return `${fyStartYear}-${fyStartYear + 1}`;
}

/** Normalize a finance-year label to `YYYY-YYYY` (expands legacy `YYYY-YY`). */
export function normalizeFinanceYear(fy: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(fy.trim());
  if (!m) return fy;
  const start = Number(m[1]);
  return `${start}-${Math.floor(start / 100) * 100 + Number(m[2])}`;
}

/** Calendar-month key `YYYY-MM` for an ISO date. */
export function monthKey(date: string): string {
  return date.slice(0, 7);
}

/** Month-end `YYYY-MM-DD` for an ISO date or `YYYY-MM` key. */
export function monthEnd(dateOrMonth: string): string {
  const ym = dateOrMonth.length === 7 ? dateOrMonth : dateOrMonth.slice(0, 7);
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${ym}-${String(last).padStart(2, '0')}`;
}

/** The 12 `YYYY-MM` months of an AU financial year label. */
export function fyMonths(fy: string): string[] {
  const start = Number(fy.slice(0, 4));
  const out: string[] = [];
  for (let m = 7; m <= 12; m++) out.push(`${start}-${String(m).padStart(2, '0')}`);
  for (let m = 1; m <= 6; m++) out.push(`${start + 1}-${String(m).padStart(2, '0')}`);
  return out;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Display label (`Jul 2025`) for a `YYYY-MM` key. */
export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}
