import { describe, it, expect } from 'vitest';
import { createMockFinance } from '../src/mock/finance-mock.js';
import { createStock, listStocks } from '../src/dao/stocks.js';
import { createTrade } from '../src/dao/trades.js';
import { listParcels, replaceParcels } from '../src/dao/parcels.js';
import { addMonths } from '../src/utils/dates.js';
import {
  parcelCostBase,
  isDiscountEligible,
  rebuildParcels,
  rebuildAllParcels,
  derivedShares,
  groupParcels,
} from '../src/services/parcel-service.js';

const ASOF = '2026-10-16';

/** [quantity, date, price, brokerage] — VAS, reconciled from AllTradesReport.xlsx. */
const VAS_FIXTURE: Array<[number, string, number, number]> = [
  [11, '2021-09-28', 94.93, 9.5],
  [11, '2022-01-25', 89.0, 3],
  [6, '2022-06-17', 81.5, 3],
  [6, '2022-07-01', 81.5, 3],
  [1, '2022-07-18', 81.4095, 0],
  [6, '2022-09-14', 86.28, 3],
  [4, '2022-09-21', 84.8, 3],
  [5, '2022-09-23', 83.3, 3],
  [1, '2022-10-18', 80.3959, 0],
  [11, '2023-07-07', 87.0, 3],
  [1, '2023-07-18', 89.181, 0],
  [10, '2023-09-22', 87.48, 3],
  [9, '2023-10-02', 87.12, 3],
  [10, '2023-10-03', 85.79, 3],
  [1, '2023-10-17', 87.1399, 0],
  [8, '2024-01-03', 92.93, 3],
  [1, '2024-01-17', 93.706, 0],
  [5, '2024-04-16', 94.28, 3],
  [1, '2024-04-17', 97.9497, 0],
  [10, '2024-10-01', 102.0, 3],
  [1, '2024-10-16', 102.5435, 0],
  [2, '2025-01-17', 100.7245, 0],
  [10, '2025-03-07', 99.7, 3],
  [10, '2025-04-04', 95.7, 3],
  [10, '2025-04-07', 88.92, 3],
  [1, '2025-04-16', 97.1013, 0],
  [2, '2025-10-16', 109.8171, 0],
  [1, '2026-01-19', 108.0618, 0],
  [1, '2026-04-20', 105.0007, 0],
  [1, '2026-07-16', 108.7983, 0],
  [7, '2026-09-10', 110.0, 3],
  [1, '2026-10-16', 108.8611, 0],
];

describe('addMonths', () => {
  it('adds calendar months and clamps to the target month length', () => {
    expect(addMonths('2025-10-16', 12)).toBe('2026-10-16');
    expect(addMonths('2024-08-31', 12)).toBe('2025-08-31');
    expect(addMonths('2024-02-29', 12)).toBe('2025-02-28');
    expect(addMonths('2024-02-29', 48)).toBe('2028-02-29');
  });
});

describe('isDiscountEligible', () => {
  it('is true on the 12-month anniversary itself', () => {
    expect(isDiscountEligible('2025-10-16', ASOF)).toBe(true);
  });
  it('is false one day short and true one day before that', () => {
    expect(isDiscountEligible('2025-10-17', ASOF)).toBe(false);
    expect(isDiscountEligible('2025-10-15', ASOF)).toBe(true);
  });
  it('matches the reconciled VAS position', () => {
    for (const d of [
      '2026-01-19',
      '2026-04-20',
      '2026-07-16',
      '2026-09-09',
      '2026-09-10',
      '2026-10-16',
    ])
      expect(isDiscountEligible(d, ASOF), d).toBe(false);
    expect(isDiscountEligible('2025-10-16', ASOF)).toBe(true);
  });
});

describe('parcelCostBase', () => {
  it('is quantity x price + brokerage, spread across the parcel', () => {
    expect(parcelCostBase({ quantity: 7, price: 110, brokerage: 3 })).toBe(773);
    expect(parcelCostBase({ quantity: 1, price: 108.8611, brokerage: 0 })).toBe(
      108.8611,
    );
    expect(parcelCostBase({ quantity: 5, price: 94.28, brokerage: 3 })).toBe(
      474.4,
    );
  });
});

describe('parcel service', () => {
  it('transcribes the VAS fixture without a typo', () => {
    expect(VAS_FIXTURE).toHaveLength(32);
    expect(VAS_FIXTURE.reduce((s, [q]) => s + q, 0)).toBe(165);
    const cb = VAS_FIXTURE.reduce((s, [q, , p, b]) => s + q * p + b, 0);
    expect(Math.round(cb * 100) / 100).toBe(15238.16);
  });

  it('derives one parcel per buy and writes derived shares', async () => {
    const f: any = createMockFinance();
    const vas: any = await createStock(f, {
      stock_code: 'VAS',
      stock_full_name: 'V',
      shares: 164,
    });
    await createTrade(f, {
      stock_id: vas.id,
      date: '2021-09-28',
      side: 'buy',
      quantity: 11,
      price: 94.93,
      brokerage: 9.5,
    });
    await createTrade(f, {
      stock_id: vas.id,
      date: '2026-09-10',
      side: 'buy',
      quantity: 7,
      price: 110,
      brokerage: 3,
    });
    const parcels = await rebuildParcels(f, vas.id);
    expect(parcels).toHaveLength(2);
    expect(await derivedShares(f)).toEqual(new Map([[vas.id, 18]]));
    const s: any = (await listStocks(f, { status: 'all' }))[0];
    expect(s.shares).toBe(18);
  });

  it('keeps two buys on the same date as two distinct parcels', async () => {
    const f: any = createMockFinance();
    const vas: any = await createStock(f, {
      stock_code: 'VAS',
      stock_full_name: 'V',
      shares: 0,
    });
    await createTrade(f, {
      stock_id: vas.id,
      date: '2022-09-23',
      side: 'buy',
      quantity: 5,
      price: 83.3,
      brokerage: 3,
    });
    await createTrade(f, {
      stock_id: vas.id,
      date: '2022-09-23',
      side: 'buy',
      quantity: 4,
      price: 84.8,
      brokerage: 3,
    });
    const parcels = await rebuildParcels(f, vas.id);
    expect(parcels).toHaveLength(2);
    expect(new Set(parcels.map((p) => p.id)).size).toBe(2);
    expect(new Set(parcels.map((p) => p.origin_trade_id)).size).toBe(2);
  });

  it('ignores sell trades in Phase 1', async () => {
    const f: any = createMockFinance();
    const vas: any = await createStock(f, {
      stock_code: 'VAS',
      stock_full_name: 'V',
      shares: 0,
    });
    await createTrade(f, {
      stock_id: vas.id,
      date: '2025-01-17',
      side: 'buy',
      quantity: 10,
      price: 100,
    });
    await createTrade(f, {
      stock_id: vas.id,
      date: '2026-01-01',
      side: 'sell',
      quantity: 4,
      price: 120,
    });
    expect(await rebuildParcels(f, vas.id)).toHaveLength(1);
  });

  it('is idempotent: a second rebuild yields the same parcels under the same natural key', async () => {
    const f: any = createMockFinance();
    const vas: any = await createStock(f, {
      stock_code: 'VAS',
      stock_full_name: 'V',
      shares: 0,
    });
    await createTrade(f, {
      stock_id: vas.id,
      date: '2025-01-17',
      side: 'buy',
      quantity: 2,
      price: 100.7245,
      source: 'drp',
    });
    await rebuildParcels(f, vas.id);
    const first = await listParcels(f, { stockId: vas.id });
    await rebuildParcels(f, vas.id);
    const second = await listParcels(f, { stockId: vas.id });
    // The surrogate `id` is re-minted on every rebuild, because the host API
    // has no batch upsert and replaceParcels deletes then inserts. What must be
    // stable is the natural key (stock_id, origin_trade_id) — that is what
    // Plan 2's disposals will reference, and never parcel_id.
    const keyOf = (ps: typeof first) =>
      ps.map((p) => [
        p.stock_id,
        p.origin_trade_id,
        p.acquired_date,
        p.quantity,
        p.price,
        p.brokerage,
      ]);
    expect(keyOf(second)).toEqual(keyOf(first));
  });

  it('discards hand-edited parcels on rebuild', async () => {
    const f: any = createMockFinance();
    const vas: any = await createStock(f, {
      stock_code: 'VAS',
      stock_full_name: 'V',
      shares: 0,
    });
    await createTrade(f, {
      stock_id: vas.id,
      date: '2025-01-17',
      side: 'buy',
      quantity: 2,
      price: 100.7245,
    });
    await rebuildParcels(f, vas.id);
    await replaceParcels(f, vas.id, [
      {
        stock_id: vas.id,
        origin_trade_id: 999,
        acquired_date: '2020-01-01',
        quantity: 9,
        price: 1,
        brokerage: 0,
      },
    ]);
    await rebuildParcels(f, vas.id);
    expect((await listParcels(f, { stockId: vas.id }))[0].acquired_date).toBe(
      '2025-01-17',
    );
  });

  it('marks a holding with no trades as notTracked, never as zero units', async () => {
    const f: any = createMockFinance();
    await createStock(f, {
      stock_code: 'VHY',
      stock_full_name: 'V',
      shares: 22,
    });
    await rebuildAllParcels(f);
    const [g] = groupParcels(
      await listStocks(f, { status: 'all' }),
      await listParcels(f),
      ASOF,
    );
    expect(g.notTracked).toBe(true);
    expect(g.units).toBe(0);
    expect(g.avgCost).toBe(0);
  });

  it('groups the real VAS position: 165 units, 32 parcels, 154 eligible', async () => {
    const f: any = createMockFinance();
    const vas: any = await createStock(f, {
      stock_code: 'VAS',
      stock_full_name: 'V',
      shares: 165,
    });
    for (const [q, d, p, b] of VAS_FIXTURE)
      await createTrade(f, {
        stock_id: vas.id,
        date: d,
        side: 'buy',
        quantity: q,
        price: p,
        brokerage: b,
        source: b === 0 ? 'drp' : 'manual',
      });
    await rebuildParcels(f, vas.id);
    const [g] = groupParcels(
      await listStocks(f, { status: 'all' }),
      await listParcels(f),
      ASOF,
    );
    expect(g.units).toBe(165);
    expect(g.parcelCount).toBe(32);
    expect(g.eligibleUnits).toBe(154);
    expect(g.notTracked).toBe(false);
    expect(g.avgCost).toBeCloseTo(15238.16 / 165, 3);
  });
});
