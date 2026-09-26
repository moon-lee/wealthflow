import { describe, it, expect } from 'vitest';
import { createMockFinance } from '../src/mock/finance-mock.js';
import { createBank } from '../src/dao/banks.js';
import { createInterestEntry } from '../src/dao/interest-entries.js';
import { createPublicWealthAdapter } from '../src/services/public-wealth-adapter.js';

describe('global FY', () => {
  it('different FYs give different totals (no drift)', async () => {
    const f: any = createMockFinance();
    const b: any = await createBank(f, { bank_code: 'M', account_number: '1' });
    await createInterestEntry(
      f,
      {
        bank_id: b.id,
        date: '2025-07-31',
        amount: 5,
        finance_year: '2025-2026',
      },
      '07-01',
    );
    await createInterestEntry(
      f,
      {
        bank_id: b.id,
        date: '2024-07-31',
        amount: 7,
        finance_year: '2024-2025',
      },
      '07-01',
    );
    const svc = createPublicWealthAdapter(f);
    expect((await svc.getInterestSummary('2025-2026'))?.total).toBe(5);
    expect((await svc.getInterestSummary('2024-2025'))?.total).toBe(7);
  });
});
