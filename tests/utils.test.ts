import { describe, it, expect } from 'vitest';
import { computeFinanceYear, monthEnd, fyMonths, monthKey } from '../src/utils/finance-year.js';
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
