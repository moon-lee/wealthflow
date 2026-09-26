import { describe, it, expect } from 'vitest';
import { createMockFinance } from '../src/mock/finance-mock.js';
import { createStock, setStockActive } from '../src/dao/stocks.js';

describe('stocks dao', () => {
  it('uppercases code and rejects global duplicate incl. inactive', async () => {
    const f: any = createMockFinance();
    const s: any = await createStock(f, {
      stock_code: 'vas',
      stock_full_name: 'Vanguard',
      shares: 120,
    });
    expect(s.stock_code).toBe('VAS');
    await setStockActive(f, s.id, false);
    await expect(
      createStock(f, { stock_code: 'VAS', stock_full_name: 'Dup', shares: 1 }),
    ).rejects.toThrow(/already exists — reactivate/);
  });
  it('rejects negative shares', async () => {
    const f: any = createMockFinance();
    await expect(
      createStock(f, { stock_code: 'VHY', stock_full_name: 'X', shares: -1 }),
    ).rejects.toThrow();
  });
});
