import { describe, it, expect } from 'vitest';
import { createBank } from '../src/dao/banks.js';
import {
  createInterestEntry,
  listInterestEntries,
} from '../src/dao/interest-entries.js';
import { createMockFinance } from '../src/mock/finance-mock.js';

describe('interest once-per-month', () => {
  it('accepts first entry then rejects same bank-month', async () => {
    const f: any = createMockFinance();
    const b: any = await createBank(f, {
      bank_code: 'Macquarie',
      account_number: '111',
    });
    await createInterestEntry(
      f,
      {
        bank_id: b.id,
        date: '2025-07-15',
        amount: 3.39,
        finance_year: '2025-2026',
      },
      '07-01',
    );
    await expect(
      createInterestEntry(
        f,
        {
          bank_id: b.id,
          date: '2025-07-20',
          amount: 1,
          finance_year: '2025-2026',
        },
        '07-01',
      ),
    ).rejects.toThrow(/already exists in Jul 2025/);
    expect(
      await listInterestEntries(f, { financeYear: '2025-2026' }),
    ).toHaveLength(1);
  });
  it('rejects negative amount and inactive bank', async () => {
    const f: any = createMockFinance();
    const b: any = await createBank(f, {
      bank_code: 'ANZ',
      account_number: '222',
    });
    await expect(
      createInterestEntry(
        f,
        {
          bank_id: b.id,
          date: '2025-08-01',
          amount: -1,
          finance_year: '2025-2026',
        },
        '07-01',
      ),
    ).rejects.toThrow();
  });
});
