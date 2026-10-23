import { describe, it, expect } from 'vitest';
import { createMockFinance } from '../src/mock/finance-mock.js';
import { createStock } from '../src/dao/stocks.js';
import {
  insertPrice,
  listPrices,
  latestPrices,
  latestPriceFor,
} from '../src/dao/prices.js';

describe('prices', () => {
  it('keeps every price row — a price history, not a current-price column', async () => {
    const f: any = createMockFinance();
    const s: any = await createStock(f, {
      stock_code: 'VAS',
      stock_full_name: 'V',
      shares: 0,
    });
    await insertPrice(f, {
      stock_id: s.id,
      price: 100,
      as_at: '2026-01-01',
    });
    await insertPrice(f, {
      stock_id: s.id,
      price: 110,
      as_at: '2026-06-01',
    });
    expect(await listPrices(f, s.id)).toHaveLength(2);
  });

  it('returns the most recent price as the current one', async () => {
    const f: any = createMockFinance();
    const s: any = await createStock(f, {
      stock_code: 'VAS',
      stock_full_name: 'V',
      shares: 0,
    });
    await insertPrice(f, {
      stock_id: s.id,
      price: 100,
      as_at: '2026-01-01',
    });
    await insertPrice(f, {
      stock_id: s.id,
      price: 110,
      as_at: '2026-06-01',
    });
    const cur = await latestPriceFor(f, s.id);
    expect(cur!.price).toBe(110);
    expect(cur!.asAt).toBe('2026-06-01');
  });

  it('breaks a same-date tie on the later row, so a re-entry wins', async () => {
    const f: any = createMockFinance();
    const s: any = await createStock(f, {
      stock_code: 'VAS',
      stock_full_name: 'V',
      shares: 0,
    });
    await insertPrice(f, {
      stock_id: s.id,
      price: 100,
      as_at: '2026-01-01',
    });
    await insertPrice(f, {
      stock_id: s.id,
      price: 101,
      as_at: '2026-01-01',
    });
    expect((await latestPriceFor(f, s.id))!.price).toBe(101);
  });

  it('returns null for a holding that has never been priced', async () => {
    const f: any = createMockFinance();
    const s: any = await createStock(f, {
      stock_code: 'VAS',
      stock_full_name: 'V',
      shares: 0,
    });
    expect(await latestPriceFor(f, s.id)).toBeNull();
  });

  it('maps one current price per stock', async () => {
    const f: any = createMockFinance();
    const a: any = await createStock(f, {
      stock_code: 'VAS',
      stock_full_name: 'V',
      shares: 0,
    });
    const b: any = await createStock(f, {
      stock_code: 'VHY',
      stock_full_name: 'V',
      shares: 0,
    });
    await insertPrice(f, {
      stock_id: a.id,
      price: 100,
      as_at: '2026-01-01',
    });
    await insertPrice(f, {
      stock_id: b.id,
      price: 50,
      as_at: '2026-01-01',
    });
    const map = await latestPrices(f);
    expect(map.get(a.id)!.price).toBe(100);
    expect(map.get(b.id)!.price).toBe(50);
  });

  it('refuses a price of zero, which is not a price', async () => {
    const f: any = createMockFinance();
    const s: any = await createStock(f, {
      stock_code: 'VAS',
      stock_full_name: 'V',
      shares: 0,
    });
    await expect(
      insertPrice(f, { stock_id: s.id, price: 0, as_at: '2026-01-01' }),
    ).rejects.toThrow();
  });
});
