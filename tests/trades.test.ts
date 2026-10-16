import { describe, it, expect } from 'vitest';
import { createMockFinance } from '../src/mock/finance-mock.js';
import {
  createTrade,
  listTrades,
  deleteTrade,
  updateTrade,
} from '../src/dao/trades.js';

const buy = (over: Record<string, unknown> = {}) => ({
  stock_id: 1,
  date: '2025-10-16',
  side: 'buy' as const,
  quantity: 2,
  price: 108.8611,
  ...over,
});

describe('trades dao', () => {
  it('stores 4dp prices and fractional quantities without rounding', async () => {
    const f: any = createMockFinance();
    const t: any = await createTrade(
      f,
      buy({ quantity: 0.1504, price: 82.7065 }),
    );
    expect(t.price).toBe(82.7065);
    expect(t.quantity).toBe(0.1504);
  });

  it('defaults brokerage to 0 and source to manual', async () => {
    const f: any = createMockFinance();
    const t: any = await createTrade(f, buy());
    expect(t.brokerage).toBe(0);
    expect(t.source).toBe('manual');
    expect(t.dividend_id).toBeNull();
  });

  it('rejects a zero or negative quantity', async () => {
    const f: any = createMockFinance();
    await expect(createTrade(f, buy({ quantity: 0 }))).rejects.toThrow(
      /quantity/i,
    );
    await expect(createTrade(f, buy({ quantity: -1 }))).rejects.toThrow(
      /quantity/i,
    );
  });

  it('rejects a malformed date and a negative price', async () => {
    const f: any = createMockFinance();
    await expect(createTrade(f, buy({ date: '16/10/2025' }))).rejects.toThrow(
      /date/i,
    );
    await expect(createTrade(f, buy({ price: -1 }))).rejects.toThrow(/price/i);
  });

  it('rejects an unknown side and a missing stock', async () => {
    const f: any = createMockFinance();
    await expect(createTrade(f, buy({ side: 'short' }))).rejects.toThrow(
      /side/i,
    );
    await expect(createTrade(f, buy({ stock_id: 0 }))).rejects.toThrow(
      /stock/i,
    );
  });

  it('filters by stockId and date range, newest first', async () => {
    const f: any = createMockFinance();
    await createTrade(
      f,
      buy({ date: '2023-09-22', quantity: 10, price: 87.48 }),
    );
    await createTrade(f, buy({ date: '2026-09-10', quantity: 7, price: 110 }));
    await createTrade(
      f,
      buy({ stock_id: 2, date: '2025-01-01', quantity: 1, price: 5 }),
    );
    expect((await listTrades(f)).map((t: any) => t.date)).toEqual([
      '2026-09-10',
      '2025-01-01',
      '2023-09-22',
    ]);
    expect(await listTrades(f, { stockId: 2 })).toHaveLength(1);
    expect(await listTrades(f, { from: '2024-01-01' })).toHaveLength(2);
    expect(await listTrades(f, { to: '2024-12-31' })).toHaveLength(1);
  });

  it('updates and deletes by id', async () => {
    const f: any = createMockFinance();
    const t: any = await createTrade(f, buy());
    await updateTrade(f, t.id, { price: 120 });
    expect((await listTrades(f))[0].price).toBe(120);
    await deleteTrade(f, t.id);
    expect(await listTrades(f)).toHaveLength(0);
  });
});
