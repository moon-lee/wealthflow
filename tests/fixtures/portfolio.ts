import { createStock } from '../../src/dao/stocks.js';
import { createTrade } from '../../src/dao/trades.js';
import { createDividend } from '../../src/dao/dividends.js';
import { createAdjustment } from '../../src/dao/cost-base-adjustments.js';
import { insertPrice } from '../../src/dao/prices.js';
import { rebuildAllParcels } from '../../src/services/parcel-service.js';
import { createMockFinance } from '../../src/mock/finance-mock.js';
import { computeFinanceYear } from '../../src/utils/finance-year.js';
import {
  HOLDING_HISTORY,
  PRICE_AS_AT,
  RECONCILED_TOTALS,
} from '../../src/data/reconciled-holdings.js';

export {
  HOLDING_HISTORY,
  PRICE_AS_AT,
  RECONCILED_TOTALS,
} from '../../src/data/reconciled-holdings.js';

/**
 * The canonical portfolio: the three real holdings, from the reconciled
 * history in `src/data/reconciled-holdings.ts`.
 *
 * Every test in the portfolio work asserts against this, so a wrong
 * transcription would be a wrong expectation rather than a wrong number. The
 * totals in `RECONCILED_TOTALS` are the holding documents' own totals, and
 * `tests/portfolio-fixture.test.ts` pins the seed against them.
 *
 * The as-of date is FIXED. A test that depends on `today` stops being a test
 * of anything the moment the date rolls over.
 */
export const AS_OF = PRICE_AS_AT;

export interface PortfolioFixture {
  finance: any;
  stockIds: Record<'VAS' | 'VHY' | 'FGX', number>;
}

export function expectedTotals(): {
  units: number;
  parcels: number;
  preAdjustmentCostBase: number;
  adjustment: number;
  costBase: number;
  income: number;
  franking: number;
  value: number;
} {
  return { ...RECONCILED_TOTALS };
}

export async function buildPortfolio(): Promise<PortfolioFixture> {
  const finance: any = createMockFinance();
  const stockIds = {} as PortfolioFixture['stockIds'];

  for (const h of HOLDING_HISTORY) {
    const stock: any = await createStock(finance, {
      stock_code: h.code,
      stock_full_name: h.name,
      shares: 0,
    });
    stockIds[h.code] = stock.id;

    for (const b of h.buys) {
      await createTrade(finance, {
        stock_id: stock.id,
        date: b.date,
        side: 'buy',
        quantity: b.quantity,
        price: b.price,
        brokerage: b.brokerage,
        source: 'manual',
      });
    }
    for (const d of h.drps) {
      await createTrade(finance, {
        stock_id: stock.id,
        date: d.date,
        side: 'buy',
        quantity: d.quantity,
        price: d.price,
        brokerage: 0,
        source: 'drp',
      });
    }
    for (const d of h.distributions) {
      await createDividend(
        finance,
        {
          stock_id: stock.id,
          date: d.date,
          type: 'trust',
          gross: d.gross,
          franking: d.franking,
          finance_year: computeFinanceYear(d.date, '07-01') ?? '',
          notes: null,
        },
        '07-01',
      );
      // A "—" in the document's adjustment column is a real $0.00 row, not a
      // missing one. Dropping the zeros would make "did I record every
      // distribution?" unanswerable.
      await createAdjustment(finance, {
        stock_id: stock.id,
        date: d.date,
        amount: d.costBaseAdj,
        reason: 'AMIT cost base adjustment',
      });
    }
    await insertPrice(finance, {
      stock_id: stock.id,
      price: h.price,
      as_at: PRICE_AS_AT,
      source: 'manual',
    });
  }

  // Parcels are derived. Rebuilding here means the fixture exercises the
  // real derive path, and a later test that disposes of stock finds units on
  // hand instead of a refusal.
  await rebuildAllParcels(finance);

  return { finance, stockIds };
}
