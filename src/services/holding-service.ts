import type { FinanceApi } from 'finance';
import {
  createTrade,
  updateTrade,
  deleteTrade,
  type Trade,
  type TradeInput,
} from '../dao/trades.js';
import { updateStock } from '../dao/stocks.js';
import { listParcels } from '../dao/parcels.js';
import { rebuildParcels } from './parcel-service.js';
import { rebuildDisposals, replayStock } from './trade-service.js';

/** A trade that cannot be changed on its own, because another record owns part
 *  of it. The message names where to make the change instead. */
export class TradeInUseError extends Error {
  readonly code = -32020;
  constructor(msg: string) {
    super(msg);
    this.name = 'TradeInUseError';
  }
}

/**
 * The derived state of a holding, and the one place it is rebuilt.
 *
 * A holding's numbers are a CHAIN, not a field:
 *
 *     trades  ->  parcels  ->  disposals  ->  shares
 *   (facts)   (as bought)   (FIFO eats)   (units held)
 *
 * `trades` is the only thing you write. Everything else is derived, and this
 * module is where the derivation happens.
 *
 * **The rebuild lives here, not in a screen.** When it lived in the Trades
 * page, a sale recorded anywhere else left the derived tables stale, and the
 * disposals were never rebuilt at all - `rebuildDisposals` had no caller in
 * `src/`, so the CGT section and the realised gain stayed empty after a sale.
 *
 * The order matters and is not interchangeable:
 *
 *  1. **parcels** - one per buy, holding the quantity AS ACQUIRED. The
 *     original lot is what FIFO allocates against, so it must not be reduced.
 *  2. **disposals** - one per sell, consuming the oldest lots first.
 *  3. **shares** - units HELD, which is parcels less disposals.
 *
 * Writing `shares` as the sum of acquired quantities is the bug this fixes:
 * after selling 30 of 100, the Stocks screen and the Parcels ledger both said
 * 100, because the disposals were not subtracted.
 */

/** Rebuild one holding's derived state, in the order the chain requires. */
export async function rebuildStock(
  finance: FinanceApi,
  stockId: number,
): Promise<void> {
  // A holding that does not exist means the caller has a stale id. Failing
  // loudly is better than silently rebuilding nothing and leaving a wrong
  // number on screen.
  const { listStocks } = await import('../dao/stocks.js');
  const stocks = await listStocks(finance, { status: 'all' });
  if (!stocks.some((s) => s.id === stockId))
    throw new Error(`No holding with id ${stockId}`);

  const parcels = await rebuildParcels(finance, stockId);
  const disposals = await rebuildDisposals(finance, stockId);
  const acquired = parcels.reduce((s, p) => s + p.quantity, 0);
  const sold = disposals.reduce((s, d) => s + d.quantity, 0);
  await updateStock(finance, stockId, { shares: round4(acquired - sold) });
}

/** Rebuild every holding. */
export async function rebuildAllStocks(finance: FinanceApi): Promise<void> {
  const { listStocks } = await import('../dao/stocks.js');
  const stocks = await listStocks(finance, { status: 'all' });
  for (const s of stocks) await rebuildStock(finance, s.id);
}

/**
 * Record a trade and rebuild the holding it belongs to.
 *
 * The write and the rebuild are one operation on purpose: a trade that is
 * stored without its derived state is a trade the rest of the app cannot see.
 */
export async function recordTrade(
  finance: FinanceApi,
  input: TradeInput,
): Promise<Trade> {
  const trade = await createTrade(finance, input);
  await rebuildStock(finance, trade.stock_id);
  return trade;
}

/** Amend a trade and rebuild. */
export async function amendTrade(
  finance: FinanceApi,
  id: number,
  patch: Partial<TradeInput>,
): Promise<void> {
  const before = await findTrade(finance, id);
  assertNotReinvestmentCoupled(before, 'edit');
  // The write cannot be rolled back, so the chain is checked against the state
  // the patch WOULD leave behind. A buy shrunk below a later sell is refused
  // here, before it lands, with the row and its parcels untouched.
  const pending: Trade = {
    ...before,
    stock_id: patch.stock_id ?? before.stock_id,
    date: patch.date ?? before.date,
    side: patch.side ?? before.side,
    quantity: patch.quantity ?? before.quantity,
    price: patch.price ?? before.price,
    brokerage: patch.brokerage ?? before.brokerage,
  };
  if (pending.stock_id === before.stock_id) {
    await assertChainBalances(finance, before.stock_id, {
      exceptTradeId: id,
      pending,
    });
  } else {
    // A trade can move between holdings: each side must balance on its own.
    await assertChainBalances(finance, before.stock_id, {
      exceptTradeId: id,
    });
    await assertChainBalances(finance, pending.stock_id, {
      exceptTradeId: id,
      pending,
    });
  }
  await updateTrade(finance, id, patch);
  await rebuildStock(finance, before.stock_id);
  if (before.stock_id !== patch.stock_id && patch.stock_id != null)
    await rebuildStock(finance, patch.stock_id);
}

/** Delete a trade and rebuild. */
export async function removeTrade(
  finance: FinanceApi,
  id: number,
): Promise<void> {
  const before = await findTrade(finance, id);
  assertNotReinvestmentCoupled(before, 'delete');
  // Deleting first and rebuilding second corrupts a holding when the rebuild
  // refuses: the trade is gone but the parcels and disposals still describe it.
  // Check first, and only then remove the row.
  await assertChainBalances(finance, before.stock_id, {
    exceptTradeId: id,
  });
  await deleteTrade(finance, id);
  await rebuildStock(finance, before.stock_id);
}

/** A dividend reinvestment's buy is half of a coupled pair. Changing it alone
 *  leaves the dividend claiming units that no longer exist. */
function assertNotReinvestmentCoupled(
  t: Trade,
  action: 'edit' | 'delete',
): void {
  if (t.source !== 'drp' && t.dividend_id == null) return;
  throw new TradeInUseError(
    `This buy is the parcel for a dividend reinvestment — ${action} it from the Dividends section, so the dividend and the parcel stay together.`,
  );
}

/**
 * Refuse a write that would leave the chain unable to balance, BEFORE it lands.
 *
 * `replayStock` is the same allocation the rebuild uses, so this is a dry run
 * rather than a second opinion. A deleted or moved buy is modelled without its
 * parcel: the stored parcel is still in the table while the check runs.
 */
async function assertChainBalances(
  finance: FinanceApi,
  stockId: number,
  opts: { exceptTradeId?: number; pending?: Trade | null } = {},
): Promise<void> {
  const parcels =
    opts.exceptTradeId != null
      ? (await listParcels(finance, { stockId })).filter(
          (p) => p.origin_trade_id !== opts.exceptTradeId,
        )
      : undefined;
  await replayStock(finance, stockId, { ...opts, parcels });
}

async function findTrade(finance: FinanceApi, id: number): Promise<Trade> {
  const { listTrades } = await import('../dao/trades.js');
  const all = await listTrades(finance);
  const found = all.find((t) => t.id === id);
  if (!found) throw new Error(`No trade with id ${id}`);
  return found;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
