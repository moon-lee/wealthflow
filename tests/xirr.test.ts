import { describe, it, expect } from 'vitest';
import { xirr, npvAt, type CashFlow } from '../src/services/xirr.js';

describe('xirr', () => {
  it('reproduces a known annual rate', () => {
    const flows: CashFlow[] = [
      { date: '2020-01-01', amount: -1000 },
      { date: '2021-01-01', amount: 1100 },
    ];
    expect(xirr(flows, '2021-01-01')).toBeCloseTo(0.1, 2);
  });

  it('solves to the root, so the NPV at the answer is zero', () => {
    const flows: CashFlow[] = [
      { date: '2021-03-01', amount: -2000 },
      { date: '2022-09-01', amount: 500 },
      { date: '2024-01-01', amount: 1800 },
    ];
    const r = xirr(flows, '2024-01-01')!;
    expect(r).not.toBeNull();
    expect(Math.abs(npvAt(r, flows, '2024-01-01'))).toBeLessThan(1e-6);
  });

  it('returns null when every flow is the same sign', () => {
    const flows: CashFlow[] = [
      { date: '2020-01-01', amount: 1000 },
      { date: '2021-01-01', amount: 1100 },
    ];
    expect(xirr(flows, '2021-01-01')).toBeNull();
  });

  it('returns null for a single flow', () => {
    expect(
      xirr([{ date: '2020-01-01', amount: -1000 }], '2020-01-01'),
    ).toBeNull();
  });

  it('returns null when every flow lands on the same date', () => {
    const flows: CashFlow[] = [
      { date: '2020-01-01', amount: -1000 },
      { date: '2020-01-01', amount: 1000 },
    ];
    expect(xirr(flows, '2020-01-01')).toBeNull();
  });

  it('handles a break-even portfolio as a rate of zero', () => {
    const flows: CashFlow[] = [
      { date: '2020-01-01', amount: -1000 },
      { date: '2021-01-01', amount: 1000 },
    ];
    expect(xirr(flows, '2021-01-01')).toBeCloseTo(0, 6);
  });
});
