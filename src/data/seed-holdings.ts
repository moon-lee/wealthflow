import type { FinanceApi } from 'finance';
import { createTrade, listTrades } from '../dao/trades.js';
import { createDividend, listDividends } from '../dao/dividends.js';
import {
  createAdjustment,
  listAdjustments,
} from '../dao/cost-base-adjustments.js';
import { insertPrice, listPrices } from '../dao/prices.js';
import { listStocks } from '../dao/stocks.js';
import { rebuildAllStocks } from '../services/holding-service.js';
import { HOLDING_HISTORY, PRICE_AS_AT } from './reconciled-holdings.js';

export interface HoldingSeedCounts {
  dividends: number;
  adjustments: number;
  trades: number;
  prices: number;
  skipped: number;
}

/**
 * Seeds the three holdings from the reconciled history.
 *
 * This lives in tracked code, NOT in `src/seed/` — the seed folder is
 * gitignored personal data, and a test that imports it would fail in a fresh
 * clone. The holding history itself is already tracked, in
 * `reconciled-holdings.ts`, so the personal part of the seed is only the
 * banks and the interest.
 *
 * Idempotent: every write is guarded, so a re-run skips what is already
 * there rather than stacking duplicates.
 */
export async function seedHoldings(
  finance: FinanceApi,
): Promise<HoldingSeedCounts> {
  const done: HoldingSeedCounts = {
    dividends: 0,
    adjustments: 0,
    trades: 0,
    prices: 0,
    skipped: 0,
  };
  const skip = () => {
    done.skipped += 1;
  };

  const stocks = await listStocks(finance, { status: 'all' });
  const stockId = (code: string) => {
    const s = stocks.find((x) => x.stock_code === code);
    if (!s) throw new Error(`seed: stock ${code} is missing`);
    return s.id;
  };

  for (const h of HOLDING_HISTORY) {
    const sid = stockId(h.code);

    // The distributions, each with the AMIT adjustment that rode on it. A "—"
    // in the source is a real $0.00 row, not a missing one.
    const dividendIdByDate = new Map<string, number>();
    for (const d of h.distributions) {
      const rows = await listDividends(finance, { stockId: sid });
      let row = rows.find(
        (r) => r.date === d.date && Number(r.gross) === d.gross,
      );
      if (!row) {
        row = await createDividend(
          finance,
          {
            stock_id: sid,
            date: d.date,
            type: 'trust',
            gross: d.gross,
            franking: d.franking,
            notes: null,
          },
          '07-01',
        );
        done.dividends += 1;
      } else {
        skip();
      }
      dividendIdByDate.set(d.date, row.id);

      const adj = await listAdjustments(finance, sid);
      if (
        !adj.some(
          (a) => a.date === d.date && Number(a.amount) === d.costBaseAdj,
        )
      ) {
        await createAdjustment(finance, {
          stock_id: sid,
          date: d.date,
          amount: d.costBaseAdj,
          reason: 'AMIT cost base adjustment',
        });
        done.adjustments += 1;
      } else {
        skip();
      }
    }

    // The buys and the reinvestments. A DRP is linked to the distribution on
    // the same date, so the parcel's origin is traceable.
    for (const t of [
      ...h.buys.map((b) => ({
        ...b,
        source: 'manual' as const,
        dividendId: null as number | null,
      })),
      ...h.drps.map((d) => ({
        date: d.date,
        quantity: d.quantity,
        price: d.price,
        brokerage: 0,
        source: 'drp' as const,
        dividendId: dividendIdByDate.get(d.date) ?? null,
      })),
    ]) {
      const rows = await listTrades(finance, { stockId: sid });
      if (
        rows.some(
          (r) =>
            r.date === t.date &&
            Number(r.quantity) === t.quantity &&
            r.source === t.source,
        )
      ) {
        skip();
        continue;
      }
      await createTrade(finance, {
        stock_id: sid,
        date: t.date,
        side: 'buy',
        quantity: t.quantity,
        price: t.price,
        brokerage: t.brokerage,
        source: t.source,
        dividend_id: t.dividendId,
      });
      done.trades += 1;
    }

    // The price the portfolio is valued at. A price row is history, so a
    // re-seed that finds the same price on the same date skips rather than
    // stacking duplicates.
    const prices = await listPrices(finance, sid);
    if (
      !prices.some(
        (p) => Number(p.price) === h.price && p.as_at === PRICE_AS_AT,
      )
    ) {
      await insertPrice(finance, {
        stock_id: sid,
        price: h.price,
        as_at: PRICE_AS_AT,
        source: 'manual',
      });
      done.prices += 1;
    } else {
      skip();
    }
  }

  // The parcels and the derived share counts come last: they are a function
  // of the trades that were just written.
  await rebuildAllStocks(finance);
  return done;
}
