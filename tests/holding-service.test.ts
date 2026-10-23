import { describe, it, expect } from 'vitest';
import { createMockFinance } from '../src/mock/finance-mock.js';
import { createStock } from '../src/dao/stocks.js';
import { listStocks } from '../src/dao/stocks.js';
import { listParcels } from '../src/dao/parcels.js';
import { listDisposals } from '../src/dao/disposals.js';
import {
  rebuildStock,
  rebuildAllStocks,
  recordTrade,
  amendTrade,
  removeTrade,
} from '../src/services/holding-service.js';

async function holding() {
  const f: any = createMockFinance();
  const s: any = await createStock(f, {
    stock_code: 'VAS',
    stock_full_name: 'V',
    shares: 0,
  });
  await recordTrade(f, {
    stock_id: s.id,
    date: '2023-01-02',
    side: 'buy',
    quantity: 100,
    price: 100,
    brokerage: 0,
  });
  return { f, s };
}

const sharesOf = async (f: any, id: number) =>
  Number(
    (await listStocks(f, { status: 'all' })).find((s: any) => s.id === id)!
      .shares,
  );

describe('the holding service owns the derived state', () => {
  it('writes shares as the units HELD, not the units bought', async () => {
    const { f, s } = await holding();
    await recordTrade(f, {
      stock_id: s.id,
      date: '2026-10-20',
      side: 'sell',
      quantity: 30,
      price: 150,
    });
    // 100 bought, 30 sold -> 70 held.
    expect(await sharesOf(f, s.id)).toBe(70);
  });

  it('rebuilds the disposals as part of the same rebuild', async () => {
    const { f, s } = await holding();
    await recordTrade(f, {
      stock_id: s.id,
      date: '2026-10-20',
      side: 'sell',
      quantity: 30,
      price: 150,
    });
    const disposals = await listDisposals(f);
    expect(disposals).toHaveLength(1);
    expect(disposals[0]!.quantity).toBe(30);
  });

  it('keeps the parcels as ACQUIRED, so FIFO still has the original lot', async () => {
    const { f, s } = await holding();
    await recordTrade(f, {
      stock_id: s.id,
      date: '2026-10-20',
      side: 'sell',
      quantity: 30,
      price: 150,
    });
    const parcels = await listParcels(f);
    expect(parcels).toHaveLength(1);
    expect(parcels[0]!.quantity).toBe(100);
  });

  it('gives the units back when the sale is removed', async () => {
    const { f, s } = await holding();
    const sell = await recordTrade(f, {
      stock_id: s.id,
      date: '2026-10-20',
      side: 'sell',
      quantity: 30,
      price: 150,
    });
    expect(await sharesOf(f, s.id)).toBe(70);
    await removeTrade(f, sell.id);
    expect(await sharesOf(f, s.id)).toBe(100);
    expect(await listDisposals(f)).toHaveLength(0);
  });

  it('gives the units back when the sale is amended away', async () => {
    const { f, s } = await holding();
    const sell = await recordTrade(f, {
      stock_id: s.id,
      date: '2026-10-20',
      side: 'sell',
      quantity: 30,
      price: 150,
    });
    await amendTrade(f, sell.id, { quantity: 0.0001 });
    expect(await sharesOf(f, s.id)).toBeCloseTo(99.9999, 4);
  });

  it('rebuilds when a buy is amended', async () => {
    const { f, s } = await holding();
    const buy = await listParcels(f);
    expect(buy[0]!.quantity).toBe(100);
    const trades = await (
      await import('../src/dao/trades.js')
    ).listTrades(f, {
      stockId: s.id,
    });
    await amendTrade(f, trades[0]!.id, { quantity: 40 });
    expect((await listParcels(f))[0]!.quantity).toBe(40);
    expect(await sharesOf(f, s.id)).toBe(40);
  });

  it('rebuilds every holding at once', async () => {
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
    await recordTrade(f, {
      stock_id: a.id,
      date: '2023-01-02',
      side: 'buy',
      quantity: 10,
      price: 100,
      brokerage: 0,
    });
    await recordTrade(f, {
      stock_id: b.id,
      date: '2023-01-02',
      side: 'buy',
      quantity: 5,
      price: 50,
      brokerage: 0,
    });
    await rebuildAllStocks(f);
    expect(await sharesOf(f, a.id)).toBe(10);
    expect(await sharesOf(f, b.id)).toBe(5);
  });

  it('refuses to rebuild a holding that does not exist', async () => {
    const f: any = createMockFinance();
    await expect(rebuildStock(f, 999)).rejects.toThrow();
  });
});
