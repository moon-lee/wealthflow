import { describe, it, expect } from 'vitest';
import { createMockFinance } from '../src/mock/finance-mock.js';
import { createStock, setStockActive } from '../src/dao/stocks.js';

describe('stocks dao', () => {
  it('uppercases code and rejects global duplicate incl. inactive', async () => {
    const f: any = createMockFinance();
    const s: any = await createStock(f, { code: 'vas', name: 'Vanguard', shares: 120 });
    expect(s.code).toBe('VAS');
    await setStockActive(f, s.id, false);
    await expect(createStock(f, { code: 'VAS', name: 'Dup', shares: 1 })).rejects.toThrow(/already exists — reactivate/);
  });
  it('rejects negative shares', async () => {
    const f: any = createMockFinance();
    await expect(createStock(f, { code: 'VHY', name: 'X', shares: -1 })).rejects.toThrow();
  });
});
