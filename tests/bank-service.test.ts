import { describe, it, expect } from 'vitest';
import {
  sumInterestByBank,
  interestGridModel,
} from '../src/services/bank-service.js';

describe('bank service', () => {
  it('sums by bank incl. inactive history', () => {
    const banks = [
      { id: 1, name: 'Macquarie' },
      { id: 2, name: 'BOQ' },
    ];
    const entries = [
      { bank_id: 1, date: '2025-07-31', amount: 3.39 },
      { bank_id: 1, date: '2025-08-31', amount: 2.1 },
      { bank_id: 2, date: '2025-07-31', amount: 6.48 },
    ];
    const { total, byBank } = sumInterestByBank(banks as any, entries as any);
    expect(total).toBeCloseTo(11.97, 2);
    expect(byBank.find((b) => b.bankId === 1)?.total).toBeCloseTo(5.49, 2);
  });
  it('grid model maps 12 FY months', () => {
    const g = interestGridModel(
      '2025-2026',
      [{ id: 1, name: 'M' }] as any,
      [{ bank_id: 1, date: '2025-07-31', amount: 3.39 }] as any,
    );
    expect(g.months[0]).toBe('2025-07');
    expect(g.cells['2025-07'][1]).toBe(3.39);
    expect(g.cells['2025-08'][1]).toBeNull();
  });
});
