/**
 * Money-weighted internal rate of return.
 *
 * A simple "total return, annualised over the holding period" figure is a
 * CAGR, and it is the wrong number for a personal portfolio: it treats money
 * invested in year five as if it had been there since year one. XIRR weights
 * each cash flow by when it actually happened, which is the question a person
 * is really asking — "how did MY money do".
 */

export interface CashFlow {
  /** `YYYY-MM-DD`. */
  date: string;
  /** Negative is money out (a purchase), positive is money in. */
  amount: number;
}

/** Days in a year, the convention for annualised money-weighted returns. */
const DAYS_PER_YEAR = 365.25;

function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
}

/**
 * The net present value of a series at a given annual rate.
 *
 * Exponentiation runs from the EARLIEST flow, not from today: the whole
 * series is discounted to its own start, which is what makes the result
 * independent of when you ask the question.
 */
export function npvAt(rate: number, flows: CashFlow[], asOf: string): number {
  const usable = flows.filter(
    (f) =>
      f.amount !== 0 && f.date <= asOf && !Number.isNaN(Date.parse(f.date)),
  );
  if (usable.length === 0) return 0;
  const first = usable.reduce(
    (min, f) => (f.date < min ? f.date : min),
    usable[0]!.date,
  );
  let total = 0;
  for (const f of usable) {
    const years = daysBetween(first, f.date) / DAYS_PER_YEAR;
    total += f.amount / Math.pow(1 + rate, years);
  }
  return total;
}

/**
 * The candidate rates searched for a sign change. This is a SEARCH, not a
 * claim about the answer's range — a portfolio that lost money has its root
 * at a NEGATIVE rate, which is why the ladder runs below zero.
 */
const LADDER = [
  -0.99, -0.95, -0.9, -0.8, -0.6, -0.4, -0.2, -0.1, -0.05, -0.01, 0.01, 0.05,
  0.1, 0.2, 0.3, 0.5, 0.75, 1, 1.5, 2, 3, 5, 10,
];

/**
 * The annualised money-weighted return, or `null` when there is no solution.
 *
 * `null` is a real answer, not a failure: a portfolio with only outflows has
 * no rate, and the screen must show a dash rather than a fabricated number.
 */
export function xirr(flows: CashFlow[], asOf: string): number | null {
  const usable = flows.filter(
    (f) =>
      f.amount !== 0 && f.date <= asOf && !Number.isNaN(Date.parse(f.date)),
  );
  if (usable.length < 2) return null;
  // If every flow lands on one date there is no time spread, so every rate
  // gives the same NPV and there is no single answer. That is `null`, not 0.
  const first = usable.reduce(
    (min, f) => (f.date < min ? f.date : min),
    usable[0]!.date,
  );
  const last = usable.reduce(
    (max, f) => (f.date > max ? f.date : max),
    usable[0]!.date,
  );
  if (first === last) return null;
  const hasPositive = usable.some((f) => f.amount > 0);
  const hasNegative = usable.some((f) => f.amount < 0);
  if (!hasPositive || !hasNegative) return null;

  // A break-even portfolio has its root at exactly zero.
  if (Math.abs(npvAt(0, usable, asOf)) < 1e-9) return 0;

  // Find a bracket: two adjacent ladder rates whose NPVs have opposite signs.
  let lo = 0;
  let hi = 0;
  let loVal = 0;
  let hiVal = 0;
  let found = false;
  for (let i = 0; i < LADDER.length - 1; i++) {
    const a = LADDER[i]!;
    const b = LADDER[i + 1]!;
    const av = npvAt(a, usable, asOf);
    const bv = npvAt(b, usable, asOf);
    if (av === 0) return a;
    if (bv === 0) return b;
    if ((av < 0 && bv > 0) || (av > 0 && bv < 0)) {
      lo = a;
      hi = b;
      loVal = av;
      hiVal = bv;
      found = true;
      break;
    }
  }
  if (!found) return null;

  // Bisect, keeping the sub-interval whose endpoints have opposite signs.
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const mv = npvAt(mid, usable, asOf);
    if (Math.abs(mv) < 1e-12) return mid;
    if ((mv < 0 && loVal < 0) || (mv > 0 && loVal > 0)) {
      lo = mid;
      loVal = mv;
    } else {
      hi = mid;
      hiVal = mv;
    }
  }
  void hiVal;
  return (lo + hi) / 2;
}
