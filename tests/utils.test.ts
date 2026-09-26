import { describe, it, expect } from 'vitest';
import {
  computeFinanceYear,
  monthEnd,
  fyMonths,
  monthKey,
  nextMonthKey,
  nextMonthSameDay,
} from '../src/utils/finance-year.js';
import { formatAUD, maskAccount, formatBSB } from '../src/utils/format.js';

describe('utils', () => {
  it('computes FY for July start', () => {
    expect(computeFinanceYear('2025-07-01', '07-01')).toBe('2025-2026');
    expect(computeFinanceYear('2025-06-30', '07-01')).toBe('2024-2025');
  });
  it('monthEnd clamps to month-end', () => {
    expect(monthEnd('2025-02-10')).toBe('2025-02-28');
    expect(monthKey('2025-07-15')).toBe('2025-07');
  });
  it('nextMonthKey rolls the year at December', () => {
    expect(nextMonthKey('2025-12-31')).toBe('2026-01');
    expect(nextMonthKey('2025-08')).toBe('2025-09');
  });
  it('nextMonthSameDay keeps the day, clamped to a shorter month', () => {
    expect(nextMonthSameDay('2025-08-31')).toBe('2025-09-30');
    expect(nextMonthSameDay('2026-01-31')).toBe('2026-02-28');
    // 2028 is a leap year, so February has 29 days.
    expect(nextMonthSameDay('2028-01-31')).toBe('2028-02-29');
    expect(nextMonthSameDay('2026-08-01')).toBe('2026-09-01');
    expect(nextMonthSameDay('2025-12-15')).toBe('2026-01-15');
    expect(nextMonthSameDay('nope')).toBe('');
  });
  it('fyMonths returns 12 AU FY months', () => {
    expect(fyMonths('2025-2026')).toEqual([
      '2025-07',
      '2025-08',
      '2025-09',
      '2025-10',
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
    ]);
  });
  it('formats AUD + masks + BSB', () => {
    expect(formatAUD(25.93)).toBe('$25.93');
    expect(maskAccount('1234567')).toBe('•••4567');
    expect(formatBSB('012345')).toBe('012-345');
  });
});
