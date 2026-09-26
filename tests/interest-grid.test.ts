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

  it('monthsWithEntries keeps only months that hold an entry', async () => {
    const { monthsWithEntries } = await import('../src/ui/interest-grid.js');
    const banks: any = [{ id: 1 }, { id: 2 }];
    expect(monthsWithEntries('2025-2026', banks, [])).toEqual([]);
    expect(
      monthsWithEntries('2025-2026', banks, [
        { bank_id: 1, date: '2026-02-28' },
        { bank_id: 1, date: '2025-07-31' },
      ]),
    ).toEqual(['2025-07', '2026-02']);
    // An entry for a bank that is no longer listed must not conjure a row.
    expect(
      monthsWithEntries('2025-2026', banks, [
        { bank_id: 99, date: '2025-09-30' },
      ]),
    ).toEqual([]);
  });
});
