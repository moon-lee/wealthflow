import { describe, it, expect } from 'vitest';
import { createMockFinance } from '../src/mock/finance-mock.js';
import { createStock } from '../src/dao/stocks.js';
import { createTrade, updateTrade, deleteTrade } from '../src/dao/trades.js';
import { listDisposals } from '../src/dao/disposals.js';
import {
  rebuildParcels,
  rebuildAllParcels,
} from '../src/services/parcel-service.js';
import {
  rebuildDisposals,
  replayStock,
  previewSell,
  AllocationDoesNotBalanceError,
} from '../src/services/trade-service.js';

async function holding() {
  const f: any = createMockFinance();
  const s: any = await createStock(f, {
    stock_code: 'VAS',
    stock_full_name: 'V',
    shares: 0,
  });
  // The mock allocates ids from one counter across every table, so the buys
  // are NOT ids 1 and 2. Capture them rather than hardcoding.
  const first: any = await createTrade(f, {
    stock_id: s.id,
    date: '2024-03-15',
    side: 'buy',
    quantity: 20,
    price: 95.4,
    brokerage: 3,
  });
  const second: any = await createTrade(f, {
    stock_id: s.id,
    date: '2025-11-20',
    side: 'buy',
    quantity: 15,
    price: 102.1,
    brokerage: 3,
  });
  await rebuildParcels(f, s.id);
  return { f, s, first, second };
}

describe('a parcel partly consumed by one sale is not over-allocated to the next', () => {
  it('does not let a second sale take units the first already sold', async () => {
    const { f, s } = await holding(); // 20 units @ $95.40, 15 units @ $102.10
    // First sale takes 25 of 35, leaving 10 in the second parcel.
    const a: any = await createTrade(f, {
      stock_id: s.id,
      date: '2026-01-05',
      side: 'sell',
      quantity: 25,
      price: 112,
    });
    const b: any = await createTrade(f, {
      stock_id: s.id,
      date: '2026-10-16',
      side: 'sell',
      quantity: 10,
      price: 118,
    });
    await rebuildDisposals(f, s.id);
    const rows = await listDisposals(f);
    expect(rows.reduce((x, r) => x + r.quantity, 0)).toBe(35);
    // The second sale can only be the 10 units left over from parcel 2.
    const second = rows.filter((r) => r.trade_id === b.id);
    expect(second).toHaveLength(1);
    expect(second[0]!.quantity).toBe(10);
    expect(second[0]!.origin_trade_id).not.toBe(a.id);
    // Cost base still conserves across the two sales.
    expect(rows.reduce((x, r) => x + r.cost_base, 0)).toBeCloseTo(
      1911 + 1534.5,
      2,
    );
  });

  it('refuses a third sale that exceeds what is left', async () => {
    const { f, s } = await holding();
    await createTrade(f, {
      stock_id: s.id,
      date: '2026-01-05',
      side: 'sell',
      quantity: 30,
      price: 112,
    });
    await createTrade(f, {
      stock_id: s.id,
      date: '2026-10-16',
      side: 'sell',
      quantity: 10,
      price: 118,
    });
    await expect(rebuildDisposals(f, s.id)).rejects.toThrow(
      AllocationDoesNotBalanceError,
    );
  });
});

describe('sell brokerage is refused, not ignored (spec 6.6)', () => {
  it('rejects a sell carrying brokerage', async () => {
    const { f, s } = await holding();
    await expect(
      createTrade(f, {
        stock_id: s.id,
        date: '2026-10-16',
        side: 'sell',
        quantity: 5,
        price: 112,
        brokerage: 3,
      }),
    ).rejects.toThrow(/cannot carry brokerage/i);
    expect(await listDisposals(f)).toHaveLength(0);
  });

  it('allows a sell with brokerage left at zero', async () => {
    const { f, s } = await holding();
    const t: any = await createTrade(f, {
      stock_id: s.id,
      date: '2026-10-16',
      side: 'sell',
      quantity: 5,
      price: 112,
    });
    expect(t.brokerage).toBe(0);
  });

  it('refuses an edit that would introduce brokerage onto a sell', async () => {
    const { f, s } = await holding();
    const sell: any = await createTrade(f, {
      stock_id: s.id,
      date: '2026-10-16',
      side: 'sell',
      quantity: 5,
      price: 112,
    });
    await expect(updateTrade(f, sell.id, { brokerage: 3 })).rejects.toThrow(
      /cannot carry brokerage/i,
    );
  });

  it('still accepts brokerage on a buy', async () => {
    const { f, s } = await holding();
    const t: any = await createTrade(f, {
      stock_id: s.id,
      date: '2026-01-05',
      side: 'buy',
      quantity: 5,
      price: 100,
      brokerage: 3,
    });
    expect(t.brokerage).toBe(3);
  });
});

describe('previewSell', () => {
  it('shows the tax consequence before anything is saved', async () => {
    const { f, s } = await holding();
    const { listParcels } = await import('../src/dao/parcels.js');
    const parcels = await listParcels(f, { stockId: s.id });
    const rows = previewSell(parcels, 25, 112, '2026-10-16');
    expect(rows.map((r) => r.quantity)).toEqual([20, 5]);
    expect(rows[0].eligible).toBe(true);
    expect(rows[0].discountApplied).toBe(-164.5);
    expect(rows[1].eligible).toBe(false);
    expect(rows.reduce((x, r) => x + r.netGain, 0)).toBeCloseTo(213, 2);
    expect(await listDisposals(f)).toHaveLength(0);
  });

  it('refuses to preview more than is held', async () => {
    const { f, s } = await holding();
    const { listParcels } = await import('../src/dao/parcels.js');
    const parcels = await listParcels(f, { stockId: s.id });
    expect(() => previewSell(parcels, 36, 112)).toThrow(/35 units on hand/i);
  });
});

describe('rebuildDisposals', () => {
  it('splits one sell across two parcels and persists both rows', async () => {
    const { f, s } = await holding();
    await createTrade(f, {
      stock_id: s.id,
      date: '2026-10-16',
      side: 'sell',
      quantity: 25,
      price: 112,
    });
    await rebuildDisposals(f, s.id);
    const rows = await listDisposals(f);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.quantity).sort((a, b) => a - b)).toEqual([5, 20]);
    expect(rows.every((r) => r.finance_year === '2026-2027')).toBe(true);
    expect(rows.reduce((x, r) => x + r.net_gain, 0)).toBeCloseTo(213, 2);
  });

  it('marks only the eligible parcel, and signs its adjustment negative', async () => {
    const { f, s } = await holding();
    await createTrade(f, {
      stock_id: s.id,
      date: '2026-10-16',
      side: 'sell',
      quantity: 25,
      price: 112,
    });
    await rebuildDisposals(f, s.id);
    const rows = await listDisposals(f);
    const eligible = rows.find((r) => r.eligible)!;
    const ineligible = rows.find((r) => !r.eligible)!;
    expect(eligible.discount_applied).toBe(-164.5);
    expect(ineligible.discount_applied).toBe(0);
  });

  it('conserves cost base across the whole holding', async () => {
    const { f, s } = await holding();
    await createTrade(f, {
      stock_id: s.id,
      date: '2026-10-16',
      side: 'sell',
      quantity: 35,
      price: 112,
    });
    await rebuildDisposals(f, s.id);
    const total = (await listDisposals(f)).reduce((x, r) => x + r.cost_base, 0);
    expect(total).toBeCloseTo(1911 + 1534.5, 2);
  });

  it('leaves the sell to consume the remainder when a later buy lands', async () => {
    const { f, s, second } = await holding();
    await createTrade(f, {
      stock_id: s.id,
      date: '2026-10-16',
      side: 'sell',
      quantity: 35,
      price: 112,
    });
    const later: any = await createTrade(f, {
      stock_id: s.id,
      date: '2026-11-01',
      side: 'buy',
      quantity: 5,
      price: 110,
      brokerage: 3,
    });
    await rebuildAllParcels(f);
    await rebuildDisposals(f, s.id);
    const rows = await listDisposals(f);
    expect(rows.reduce((x, r) => x + r.quantity, 0)).toBe(35);
    // The new parcel is untouched by the earlier sale.
    expect(rows.some((r) => r.origin_trade_id === later.id)).toBe(false);
    expect(
      rows.every((r) => r.origin_trade_id !== second.id || r.quantity > 0),
    ).toBe(true);
  });
});

describe('editing replays the allocation and refuses what will not balance', () => {
  it('lets a cosmetic correction through untouched', async () => {
    const { f, s } = await holding();
    const sell: any = await createTrade(f, {
      stock_id: s.id,
      date: '2026-10-16',
      side: 'sell',
      quantity: 25,
      price: 112,
    });
    await rebuildDisposals(f, s.id);
    const before = await listDisposals(f);
    expect(before).toHaveLength(2);
    // Correcting the SELL's own brokerage... which is not a field we accept,
    // so correct the PRICE by a cent instead: structural allocation unchanged.
    const pending = { ...sell, price: 112.01 };
    const produced = await replayStock(f, s.id, {
      exceptTradeId: sell.id,
      pending,
    });
    expect(produced).toHaveLength(2);
    expect(produced.reduce((x, r) => x + r.quantity, 0)).toBe(25);
    // Same parcels, different money. Compared by the natural key, because a
    // disposal deliberately carries no parcel_id.
    expect(produced.map((r) => r.originTradeId)).toEqual(
      before.map((r) => r.origin_trade_id),
    );
  });

  it('REFUSES reducing a buy below what a later sell already took', async () => {
    const { f, s, first } = await holding();
    await createTrade(f, {
      stock_id: s.id,
      date: '2026-10-16',
      side: 'sell',
      quantity: 25,
      price: 112,
    });
    await rebuildDisposals(f, s.id);
    // Cut the first buy from 20 to 5: only 20 units would exist before the sale.
    const pending = {
      id: first.id,
      stock_id: s.id,
      date: '2024-03-15',
      side: 'buy' as const,
      quantity: 5,
      price: 95.4,
      brokerage: 3,
      source: 'manual' as const,
      dividend_id: null,
      notes: null,
    };
    await expect(
      replayStock(f, s.id, { exceptTradeId: first.id, pending }),
    ).rejects.toThrow(AllocationDoesNotBalanceError);
    await expect(
      replayStock(f, s.id, { exceptTradeId: first.id, pending }),
    ).rejects.toThrow(/only 20 on hand/i);
  });

  it('lets an edit through when the replay still balances', async () => {
    const { f, s, first } = await holding();
    await createTrade(f, {
      stock_id: s.id,
      date: '2026-10-16',
      side: 'sell',
      quantity: 10,
      price: 112,
    });
    await rebuildDisposals(f, s.id);
    // Cutting the first buy to 15 still leaves 30 units before a 10-unit sale.
    const pending = {
      id: first.id,
      stock_id: s.id,
      date: '2024-03-15',
      side: 'buy' as const,
      quantity: 15,
      price: 95.4,
      brokerage: 3,
      source: 'manual' as const,
      dividend_id: null,
      notes: null,
    };
    const produced = await replayStock(f, s.id, {
      exceptTradeId: first.id,
      pending,
    });
    expect(produced.reduce((x, r) => x + r.quantity, 0)).toBe(10);
  });

  it('restores the units when a sell is deleted', async () => {
    const { f, s } = await holding();
    // The service owns the whole chain, so a caller no longer has to know the
    // rebuild order: write, then the derived state follows.
    const { recordTrade, removeTrade } =
      await import('../src/services/holding-service.js');
    const sell: any = await recordTrade(f, {
      stock_id: s.id,
      date: '2026-10-16',
      side: 'sell',
      quantity: 25,
      price: 112,
    });
    expect(await listDisposals(f)).toHaveLength(2);
    const sharesOf = async () =>
      (
        await (
          await import('../src/dao/stocks.js')
        ).listStocks(f, { status: 'all' })
      )[0].shares;
    expect(await sharesOf()).toBe(10);
    await removeTrade(f, sell.id);
    expect(await listDisposals(f)).toHaveLength(0);
    expect(await sharesOf()).toBe(35);
  });
});
