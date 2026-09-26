import { describe, it, expect } from 'vitest';
import { interestGridModel } from '../src/services/bank-service.js';

describe('interest grid totals single-source', () => {
  it('grid grandTotal equals service total', async () => {
    const { sumInterestByBank } =
      await import('../src/services/bank-service.js');
    const banks: any = [{ id: 1, bank_code: 'M' }];
    const entries: any = [{ bank_id: 1, date: '2025-07-31', amount: 3.39 }];
    expect(interestGridModel('2025-2026', banks, entries).grandTotal).toBe(
      sumInterestByBank(banks, entries).total,
    );
  });
});
