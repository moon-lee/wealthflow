import { describe, it, expect } from 'vitest';
import { fyEndDate } from '../src/utils/finance-year.js';
import { sumSuper } from '../src/services/super-service.js';

describe('super service', () => {
  it('fyEndDate returns June 30 of the FY end year', () => {
    expect(fyEndDate('2025-2026')).toBe('2026-06-30');
  });
  it('latest balance is scoped to FY-end; contributions sum by FY', () => {
    const entries: any = [
      {
        date: '2025-08-15',
        kind: 'balance',
        amount: 100000,
        finance_year: '2025-2026',
      },
      {
        date: '2026-07-20',
        kind: 'balance',
        amount: 120000,
        finance_year: '2026-2027',
      },
      {
        date: '2025-09-01',
        kind: 'contribution',
        amount: 1000,
        finance_year: '2025-2026',
      },
      {
        date: '2025-10-01',
        kind: 'contribution',
        amount: 500,
        finance_year: '2025-2026',
      },
    ];
    const s = sumSuper('2025-2026', entries);
    expect(s.balance).toEqual({ amount: 100000, date: '2025-08-15' });
    expect(s.contributions).toEqual({ total: 1500, count: 2 });
    expect(s.sg).toEqual({ total: 0, count: 0 });
  });
  it('SG is summed apart from private contributions and apart from other FYs', () => {
    const entries: any = [
      {
        date: '2025-08-15',
        kind: 'balance',
        amount: 100000,
        finance_year: '2025-2026',
      },
      {
        date: '2025-09-01',
        kind: 'contribution',
        amount: 1000,
        finance_year: '2025-2026',
      },
      {
        date: '2025-10-01',
        kind: 'sg',
        amount: 350.5,
        finance_year: '2025-2026',
      },
      {
        date: '2025-11-01',
        kind: 'sg',
        amount: 350.5,
        finance_year: '2025-2026',
      },
      // Another FY's SG must not leak into this year's bucket.
      {
        date: '2026-08-01',
        kind: 'sg',
        amount: 400,
        finance_year: '2026-2027',
      },
    ];
    const s = sumSuper('2025-2026', entries);
    // Private stays deductible-only; SG never folds into it.
    expect(s.contributions).toEqual({ total: 1000, count: 1 });
    expect(s.sg).toEqual({ total: 701, count: 2 });
  });
  it('empty FY returns null balance and zero contributions', () => {
    expect(sumSuper('2030-2031', [])).toEqual({
      financialYear: '2030-2031',
      balance: null,
      contributions: { total: 0, count: 0 },
      sg: { total: 0, count: 0 },
    });
  });
});
