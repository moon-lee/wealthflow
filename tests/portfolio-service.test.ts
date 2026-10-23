import { describe, it, expect } from 'vitest';
import { buildPortfolio, expectedTotals, AS_OF } from './fixtures/portfolio.js';
import { getPortfolioSummary } from '../src/services/portfolio-service.js';
import { createTrade } from '../src/dao/trades.js';
import { rebuildDisposals } from '../src/services/trade-service.js';
import { createMockFinance } from '../src/mock/finance-mock.js';
import { createStock } from '../src/dao/stocks.js';
import { createDividend } from '../src/dao/dividends.js';
import { insertPrice } from '../src/dao/prices.js';
import { rebuildAllParcels } from '../src/services/parcel-service.js';

describe('getPortfolioSummary', () => {
  it('values the portfolio from the current prices', async () => {
    const { finance } = await buildPortfolio();
    const s = await getPortfolioSummary(finance, AS_OF);
    const t = expectedTotals();
    expect(s.totalValue).toBeCloseTo(t.value, 2);
    expect(s.holdings).toHaveLength(3);
  });

  it('uses the PRE-AMIT cost base, so the gain is what was actually paid', async () => {
    const { finance } = await buildPortfolio();
    const s = await getPortfolioSummary(finance, AS_OF);
    const t = expectedTotals();
    expect(s.totalCostBase).toBeCloseTo(t.preAdjustmentCostBase, 2);
    expect(s.totalCapitalGain).toBeCloseTo(
      t.value - t.preAdjustmentCostBase,
      2,
    );
    // The post-AMIT basis would give a gain $15.26 LARGER. The AMIT
    // adjustment is a notional tax benefit that only crystallises on a
    // disposal, so the CGT section applies it and the paper gain does not.
    expect(t.value - t.costBase - s.totalCapitalGain!).toBeCloseTo(15.26, 2);
  });

  it('matches the reference to the cent, on every holding, at the seeded prices', async () => {
    const { finance } = await buildPortfolio();
    const s = await getPortfolioSummary(finance, AS_OF);
    // ShareSight's own figures at these prices (VAS $108.75, VHY $84.34,
    // FGX $1.34):
    expect(s.totalValue).toBeCloseTo(21369.63, 2);
    expect(s.totalCapitalGain).toBeCloseTo(3223.51, 2);
    expect(s.totalIncome).toBeCloseTo(2875.74, 2);
    expect(s.totalReturn).toBeCloseTo(6099.25, 2);
    const row = (code: string) => s.holdings.find((h) => h.code === code)!;
    expect(row('FGX').capitalGain).toBeCloseTo(201.98, 2);
    expect(row('VAS').capitalGain).toBeCloseTo(2705.59, 2);
    expect(row('VHY').capitalGain).toBeCloseTo(315.94, 2);
    expect(row('FGX').totalReturn).toBeCloseTo(429.1, 2);
    expect(row('VAS').totalReturn).toBeCloseTo(5050.96, 2);
    expect(row('VHY').totalReturn).toBeCloseTo(619.19, 2);
  });

  it('reports gross income and excludes franking credits', async () => {
    const { finance } = await buildPortfolio();
    const s = await getPortfolioSummary(finance, AS_OF);
    expect(s.totalIncome).toBeCloseTo(expectedTotals().income, 2);
  });

  it('splits the total return rate into capital gain and income, and they add up', async () => {
    const { finance } = await buildPortfolio();
    const s = await getPortfolioSummary(finance, AS_OF);
    expect(s.totalReturnRate).not.toBeNull();
    expect(s.capitalGainRate! + s.incomeRate!).toBeCloseTo(
      s.totalReturnRate!,
      6,
    );
  });

  it('reconciles the cash flows against the capital gain and income', async () => {
    const { finance } = await buildPortfolio();
    const s = await getPortfolioSummary(finance, AS_OF);
    const sum = s.cashFlows.reduce((a, f) => a + f.amount, 0);
    // SUM flows = capitalGain + income, exactly. The gain is measured on the
    // pre-AMIT basis, which is the basis the money went in on, so the cash in
    // and the cash out reconcile to the cent with no adjustment term.
    expect(sum).toBeCloseTo(s.totalCapitalGain! + s.totalIncome, 2);
  });

  it('shows a dash, not a partial total, when a holding has no price', async () => {
    const { finance, stockIds } = await buildPortfolio();
    await finance.db
      .table('wealthflow_prices')
      .delete({ stock_id: stockIds.VHY });
    const s = await getPortfolioSummary(finance, AS_OF);
    expect(s.totalValue).toBeNull();
    expect(s.totalCapitalGain).toBeNull();
    expect(
      s.holdings.find((h) => h.stockId === stockIds.VHY)!.value,
    ).toBeNull();
    // The priced holdings still show their own values.
    expect(
      s.holdings.find((h) => h.stockId === stockIds.VAS)!.value,
    ).not.toBeNull();
    // With no terminal value every flow is negative, so there is no rate.
    expect(s.totalReturnRate).toBeNull();
    expect(s.capitalGainRate).toBeNull();
    expect(s.incomeRate).toBeNull();
  });

  it('counts a realised gain after a sale, drops the sold units, and books the proceeds', async () => {
    const { finance, stockIds } = await buildPortfolio();
    await createTrade(finance, {
      stock_id: stockIds.FGX,
      date: '2026-10-20',
      side: 'sell',
      quantity: 100,
      price: 1.34,
    });
    await rebuildDisposals(finance, stockIds.FGX);
    const s = await getPortfolioSummary(finance, AS_OF);
    const fgx = s.holdings.find((h) => h.stockId === stockIds.FGX)!;
    expect(fgx.units).toBe(1009);
    expect(fgx.realisedGain).not.toBe(0);
    // The sale's proceeds must appear as an inflow, or the return is wrong.
    const onSaleDay = s.cashFlows
      .filter((f) => f.date === '2026-10-20')
      .reduce((a, f) => a + f.amount, 0);
    expect(onSaleDay).toBeCloseTo(100 * 1.34, 2);
  });

  it('prices the units you still hold, not the oldest ones', async () => {
    // FIFO consumes the OLDEST units first, so after a partial sale what
    // remains is the NEWEST units plus the tail of the oldest parcel. Pricing
    // the oldest N units instead would understate the open cost base and
    // overstate the gain — a wrong tax figure.
    const f: any = createMockFinance();
    const s: any = await createStock(f, {
      stock_code: 'VAS',
      stock_full_name: 'V',
      shares: 0,
    });
    await createTrade(f, {
      stock_id: s.id,
      date: '2023-01-02',
      side: 'buy',
      quantity: 100,
      price: 10,
      brokerage: 0,
    });
    await createTrade(f, {
      stock_id: s.id,
      date: '2024-01-02',
      side: 'buy',
      quantity: 100,
      price: 20,
      brokerage: 0,
    });
    await insertPrice(f, {
      stock_id: s.id,
      price: 30,
      as_at: AS_OF,
      source: 'manual',
    });
    await rebuildAllParcels(f);
    // Sell 50 units: FIFO takes them from the $10 parcel.
    await createTrade(f, {
      stock_id: s.id,
      date: '2026-01-02',
      side: 'sell',
      quantity: 50,
      price: 30,
    });
    await rebuildDisposals(f, s.id);

    const summary = await getPortfolioSummary(f, AS_OF);
    const h = summary.holdings[0]!;
    expect(h.units).toBe(150);
    // 50 left of the $10 parcel + all 100 of the $20 parcel = $2,500.
    expect(h.costBase).toBeCloseTo(2500, 2);
    expect(h.value).toBeCloseTo(150 * 30, 2);
    expect(h.unrealisedGain).toBeCloseTo(4500 - 2500, 2);
    // And the realised half of the gain is the sold 50 at $10 against $30.
    expect(h.realisedGain).toBeCloseTo(50 * (30 - 10), 2);
    expect(h.capitalGain).toBeCloseTo(2000 + 1000, 2);
  });

  it('nets a distribution and its DRP instead of double counting them', async () => {
    // A single-holding portfolio, so the day's net cash is unambiguous. The
    // real portfolio cannot be used for this: VAS and VHY both paid on
    // 16 Apr 2025, so a combined series mixes their flows on that date.
    const f: any = createMockFinance();
    const s: any = await createStock(f, {
      stock_code: 'VHY',
      stock_full_name: 'V',
      shares: 0,
    });
    await createTrade(f, {
      stock_id: s.id,
      date: '2023-10-04',
      side: 'buy',
      quantity: 10,
      price: 64.75,
      brokerage: 3,
    });
    await createDividend(
      f,
      {
        stock_id: s.id,
        date: '2025-04-16',
        type: 'trust',
        gross: 54.35,
        franking: 5.65,
        finance_year: '2024-2025',
        notes: null,
      },
      '07-01',
    );
    await createTrade(f, {
      stock_id: s.id,
      date: '2025-04-16',
      side: 'buy',
      quantity: 1,
      price: 70.1346,
      brokerage: 0,
      source: 'drp',
    });
    await insertPrice(f, {
      stock_id: s.id,
      price: 84.34,
      as_at: AS_OF,
      source: 'manual',
    });
    await rebuildAllParcels(f);

    const summary = await getPortfolioSummary(f, AS_OF);
    const byDate = new Map<string, number>();
    for (const cf of summary.cashFlows)
      byDate.set(cf.date, (byDate.get(cf.date) ?? 0) + cf.amount);
    // $54.35 paid in, $70.13 reinvested the same day: -$15.78 net.
    // Counting the distribution AND the DRP twice would give -$139.43;
    // netting them away entirely would give +$54.35. Neither passes.
    expect(byDate.get('2025-04-16')).toBeCloseTo(54.35 - 70.1346, 2);
  });
});
