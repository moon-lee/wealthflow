import { describe, it, expect } from 'vitest';
import { createMockFinance } from '../src/mock/finance-mock.js';
import { createStock } from '../src/dao/stocks.js';
import { createDividend, listDividends } from '../src/dao/dividends.js';

describe('dividends dao', () => {
  it('accepts all 3 types, rejects bad type + negative gross', async () => {
    const f: any = createMockFinance();
    const s: any = await createStock(f, { code: 'VAS', name: 'V', shares: 10 });
    await createDividend(
      f,
      {
        stock_id: s.id,
        date: '2025-01-15',
        type: 'non_trust',
        gross: 100,
        franking: 20,
        finance_year: '2024-2025',
      },
      '07-01',
    );
    await createDividend(
      f,
      {
        stock_id: s.id,
        date: '2025-04-15',
        type: 'trust',
        gross: 50,
        franking: 0,
        finance_year: '2024-2025',
      },
      '07-01',
    );
    await expect(
      createDividend(
        f,
        {
          stock_id: s.id,
          date: '2025-05-01',
          type: 'nope',
          gross: 1,
          franking: 0,
          finance_year: '2024-2025',
        },
        '07-01',
      ),
    ).rejects.toThrow(/type must be/);
    await expect(
      createDividend(
        f,
        {
          stock_id: s.id,
          date: '2025-05-01',
          type: 'trust',
          gross: -1,
          franking: 0,
          finance_year: '2024-2025',
        },
        '07-01',
      ),
    ).rejects.toThrow();
    expect(await listDividends(f, { financeYear: '2024-2025' })).toHaveLength(
      2,
    );
  });
});
