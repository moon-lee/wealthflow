import { describe, it, expect } from 'vitest';
import { createMockFinance } from '../src/mock/finance-mock.js';
import { listTrades } from '../src/dao/trades.js';
import { listParcels } from '../src/dao/parcels.js';
import { listDividends } from '../src/dao/dividends.js';
import { listStocks } from '../src/dao/stocks.js';
import { latestPrices } from '../src/dao/prices.js';
import { getPortfolioSummary } from '../src/services/portfolio-service.js';
import { seedHoldings } from '../src/data/seed-holdings.js';
import { RECONCILED_TOTALS } from '../src/data/reconciled-holdings.js';

/** A stock row, the way the seed writes one before the history lands. */
async function seedStock(f: any, code: string, shares: number) {
  const { createStock } = await import('../src/dao/stocks.js');
  await createStock(f, {
    stock_code: code,
    stock_full_name: code,
    shares,
    notes: null,
  });
}

describe('the holdings seed', () => {
  it('produces the three holdings, not just the stock rows', async () => {
    const f: any = createMockFinance();
    await seedStock(f, 'VAS', 0);
    await seedStock(f, 'VHY', 0);
    await seedStock(f, 'FGX', 0);
    await seedHoldings(f);
    const stocks = await listStocks(f, { status: 'all' });
    expect(stocks.map((s: any) => s.stock_code).sort()).toEqual([
      'FGX',
      'VAS',
      'VHY',
    ]);
    // The units come from the parcels, which come from the trades. A seed
    // that only writes `shares` leaves the Investment section with no holding
    // to show, because it derives units from the parcels.
    const parcels = await listParcels(f);
    expect(parcels.length).toBe(RECONCILED_TOTALS.parcels);
    const units = parcels.reduce((s: number, p: any) => s + p.quantity, 0);
    expect(units).toBe(RECONCILED_TOTALS.units);
  });

  it('reconciles the cost base, the income and the price', async () => {
    const f: any = createMockFinance();
    await seedStock(f, 'VAS', 0);
    await seedStock(f, 'VHY', 0);
    await seedStock(f, 'FGX', 0);
    await seedHoldings(f);
    const buys = (await listTrades(f)).filter((t: any) => t.side === 'buy');
    const cost = buys.reduce(
      (s: number, t: any) => s + t.quantity * t.price + t.brokerage,
      0,
    );
    expect(cost).toBeCloseTo(RECONCILED_TOTALS.preAdjustmentCostBase, 2);
    const divs = await listDividends(f);
    expect(divs.reduce((s: number, d: any) => s + d.gross, 0)).toBeCloseTo(
      RECONCILED_TOTALS.income,
      2,
    );
    const prices = await latestPrices(f);
    expect(prices.size).toBe(3);
  });

  it('gives the Investment section its three holdings and a value', async () => {
    const f: any = createMockFinance();
    await seedStock(f, 'VAS', 0);
    await seedStock(f, 'VHY', 0);
    await seedStock(f, 'FGX', 0);
    await seedHoldings(f);
    const s = await getPortfolioSummary(f, '2026-10-21');
    expect(s.holdings).toHaveLength(3);
    expect(s.holdings.map((h) => h.code).sort()).toEqual(['FGX', 'VAS', 'VHY']);
    expect(s.totalValue).toBeCloseTo(RECONCILED_TOTALS.value, 2);
    expect(s.totalCostBase).toBeCloseTo(
      RECONCILED_TOTALS.preAdjustmentCostBase,
      2,
    );
    expect(s.totalCapitalGain).toBeCloseTo(
      RECONCILED_TOTALS.value - RECONCILED_TOTALS.preAdjustmentCostBase,
      2,
    );
  });

  it('is idempotent — a second run changes nothing', async () => {
    const f: any = createMockFinance();
    await seedStock(f, 'VAS', 0);
    await seedStock(f, 'VHY', 0);
    await seedStock(f, 'FGX', 0);
    await seedHoldings(f);
    const first = {
      trades: (await listTrades(f)).length,
      dividends: (await listDividends(f)).length,
      parcels: (await listParcels(f)).length,
    };
    const second = await seedHoldings(f);
    expect((await listTrades(f)).length).toBe(first.trades);
    expect((await listDividends(f)).length).toBe(first.dividends);
    expect((await listParcels(f)).length).toBe(first.parcels);
    expect(second.trades).toBe(0);
    expect(second.dividends).toBe(0);
  });
});
