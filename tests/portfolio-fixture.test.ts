import { describe, it, expect } from 'vitest';
import { listTrades } from '../src/dao/trades.js';
import { listParcels } from '../src/dao/parcels.js';
import { listDividends } from '../src/dao/dividends.js';
import { listAdjustments } from '../src/dao/cost-base-adjustments.js';
import { buildPortfolio, expectedTotals, AS_OF } from './fixtures/portfolio.js';

describe('the canonical portfolio fixture', () => {
  it('reproduces the reconciled units, parcels and cost base', async () => {
    const { finance } = await buildPortfolio();
    const t = expectedTotals();
    const buys = (await listTrades(finance)).filter((x) => x.side === 'buy');
    expect(buys.reduce((s, x) => s + x.quantity, 0)).toBe(t.units);
    expect((await listParcels(finance)).length).toBe(t.parcels);
    const cost = buys.reduce(
      (s, x) => s + x.quantity * x.price + x.brokerage,
      0,
    );
    expect(cost).toBeCloseTo(t.preAdjustmentCostBase, 2);
  });

  it('reproduces the gross income and the AMIT adjustment total', async () => {
    const { finance, stockIds } = await buildPortfolio();
    const t = expectedTotals();
    const divs = await listDividends(finance);
    expect(divs.reduce((s, d) => s + d.gross, 0)).toBeCloseTo(t.income, 2);
    expect(divs.reduce((s, d) => s + d.franking, 0)).toBeCloseTo(t.franking, 2);
    const adj = (await listAdjustments(finance, stockIds.VAS)).reduce(
      (s, a) => s + a.amount,
      0,
    );
    expect(adj).toBeCloseTo(-4.43, 4);
  });

  it('records the zero-unit DRP as income with no trade', async () => {
    const { finance } = await buildPortfolio();
    const zero = (await listTrades(finance)).filter((t) => t.quantity === 0);
    expect(zero).toHaveLength(0);
    const drps = (await listTrades(finance)).filter((t) => t.source === 'drp');
    expect(drps.every((d) => d.quantity > 0)).toBe(true);
  });

  it('fixes the as-of date so no test depends on today', () => {
    expect(AS_OF).toBe('2026-10-21');
  });
});
