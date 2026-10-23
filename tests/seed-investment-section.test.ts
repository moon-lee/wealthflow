import { describe, it, expect } from 'vitest';
import { createMockFinance } from '../src/mock/finance-mock.js';
import { createStock } from '../src/dao/stocks.js';
import { seedHoldings } from '../src/data/seed-holdings.js';
import { getPortfolioSummary } from '../src/services/portfolio-service.js';
import { RECONCILED_TOTALS } from '../src/data/reconciled-holdings.js';

describe('the seeded Investment section', () => {
  it('shows the three holdings with their real position', async () => {
    const f: any = createMockFinance();
    for (const code of ['VAS', 'VHY', 'FGX'])
      await createStock(f, {
        stock_code: code,
        stock_full_name: code,
        shares: 0,
        notes: null,
      });
    await seedHoldings(f);
    const s = await getPortfolioSummary(f, '2026-10-21');
    expect(s.holdings.map((h) => h.code)).toEqual(['FGX', 'VAS', 'VHY']);
    for (const h of s.holdings) {
      expect(h.units).toBeGreaterThan(0);
      expect(h.value).not.toBeNull();
      expect(h.costBase).toBeGreaterThan(0);
    }
    expect(s.totalValue).toBeCloseTo(RECONCILED_TOTALS.value, 2);
    expect(s.totalIncome).toBeCloseTo(RECONCILED_TOTALS.income, 2);
    expect(s.totalReturnRate).not.toBeNull();
  });
});
