import type { FinanceApi } from 'finance';
import { ExtensionLogger } from 'finance-logger';
import { listStocks } from '../dao/stocks.js';
import { insertPrice, listPrices } from '../dao/prices.js';

const logger = new ExtensionLogger('wealthflow');

/**
 * Current market prices, fetched from free sources.
 *
 * Two providers, in order:
 *
 *  1. **ASX's own research endpoint** — the primary. It is the exchange's
 *     public data service, needs no key, and answers in ~250ms. It gives the
 *     last traded price, the bid and the ask.
 *  2. **Yahoo Finance** — the fallback. Also keyless, and it adds the time of
 *     the last trade, which ASX does not give.
 *
 * Neither is real time: ASX prices are delayed, and Yahoo's ASX feed is
 * delayed too. That is fine for a portfolio summary, and the price's own
 * `as_at` date is recorded so the UI can say how old it is.
 *
 * **No key, no account, no configuration.** That was the requirement, and it is
 * why these two rather than the paid feeds.
 */

export type PriceProvider = 'asx' | 'yahoo';

export interface PriceQuote {
  code: string;
  price: number;
  provider: PriceProvider;
  /** The time of the last trade, when the provider gives one. */
  tradedAt?: string;
}

export interface PriceQuoteFailure {
  code: string;
  message: string;
}

export interface PriceFetchResult {
  quotes: PriceQuote[];
  failures: PriceQuoteFailure[];
}

export interface PriceUpdateResult {
  updated: number;
  failed: number;
  failures: PriceQuoteFailure[];
  asOf: string;
}

type FetchLike = (
  input: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>;

const ASX_HEADER_PATH = '/asx-research/1.0/companies/{code}/header';
const YAHOO_CHART_PATH = '/v8/finance/chart/{code}.AX?interval=1d&range=1d';

export interface PriceEndpoints {
  /** Base for the ASX research endpoint. */
  asx: string;
  /** Base for the Yahoo chart endpoint. */
  yahoo: string;
}

const DEFAULT_ENDPOINTS: PriceEndpoints = {
  asx: 'https://asx.api.markitdigital.com',
  yahoo: 'https://query1.finance.yahoo.com',
};

/**
 * The endpoints live on `globalThis` rather than in module state, because the
 * dev harness imports this module by one path and the extension imports it by
 * another. Two module instances would each keep their own override, and the
 * one the command actually used would still be pointing at the real hosts.
 */
const ENDPOINTS_KEY = '__wealthflowPriceEndpoints';

/**
 * Point the fetches at a different base.
 *
 * Neither endpoint sends `Access-Control-Allow-Origin`, so a browser cannot
 * read them. The real app never asks it to — the fetch runs in the host
 * process, which is plain Node and has no such rule. The DEV harness is a
 * page, so it routes through the Vite dev server's proxy instead, and this
 * is how it says so.
 */
export function setPriceEndpoints(next: Partial<PriceEndpoints>): void {
  const g = globalThis as any;
  g[ENDPOINTS_KEY] = { ...(g[ENDPOINTS_KEY] ?? {}), ...next };
}

export function getPriceEndpoints(): PriceEndpoints {
  const g = globalThis as any;
  return { ...DEFAULT_ENDPOINTS, ...(g[ENDPOINTS_KEY] ?? {}) };
}

const TIMEOUT_MS = 10000;

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
}

type JsonResult =
  { ok: true; json: any } | { ok: false; reason: string; network: boolean };

async function getJson(fetchImpl: FetchLike, url: string): Promise<JsonResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      headers: { 'User-Agent': 'wealthflow/0.1' },
      signal: ctrl.signal,
    });
    if (!res.ok)
      return { ok: false, reason: `HTTP ${res.status}`, network: false };
    return { ok: true, json: await res.json() };
  } catch (err: any) {
    // A browser that cannot read a cross-origin response fails the fetch
    // outright, with no status to inspect. That is what a CORS block looks
    // like from here.
    return { ok: false, reason: String(err?.message ?? err), network: true };
  } finally {
    clearTimeout(timer);
  }
}

/** The Vite dev server's proxy routes, used only as a FALLBACK. */
const DEV_PROXY = { asx: '/proxy/asx', yahoo: '/proxy/yahoo' };

/** True in a browser page served over http(s) - the dev harness. The app's
 *  panel is a `finance-shell:` document, and the app's fetch is host-side
 *  Node, so neither ever takes this path. */
function isBrowserPage(): boolean {
  const loc = (globalThis as any)?.location;
  return !!loc && /^https?:$/.test(loc.protocol ?? '');
}

/**
 * Fetch a URL, and if the browser blocked it, try the dev proxy.
 *
 * The price endpoints send no CORS headers, so a page cannot read them
 * directly. The dev server proxies them, and this is the safety net for the
 * case where the page did not pick up the endpoint override: the direct
 * request fails as a NETWORK error, and the proxy route is tried instead.
 *
 * In the app this never fires: the fetch is host-side, and the app's panel is
 * not an http page.
 */
async function getJsonWithDevFallback(
  fetchImpl: FetchLike,
  url: string,
  proxyUrl: string,
): Promise<JsonResult> {
  const first = await getJson(fetchImpl, url);
  if (first.ok || !first.network) return first;
  if (!isBrowserPage()) return first;
  const viaProxy = await getJson(fetchImpl, proxyUrl);
  if (viaProxy.ok) return viaProxy;
  // Report the original failure: "CORS blocked" is the useful message.
  return first;
}

async function fromAsx(
  code: string,
  fetchImpl: FetchLike,
): Promise<PriceQuote | null> {
  const path = ASX_HEADER_PATH.replace('{code}', encodeURIComponent(code));
  const res = await getJsonWithDevFallback(
    fetchImpl,
    getPriceEndpoints().asx + path,
    DEV_PROXY.asx + path,
  );
  if (!res.ok) return null;
  const price = Number(res.json?.data?.priceLast);
  if (!Number.isFinite(price) || price <= 0) return null;
  return { code, price, provider: 'asx' };
}

async function fromYahoo(
  code: string,
  fetchImpl: FetchLike,
): Promise<PriceQuote | null> {
  const path = YAHOO_CHART_PATH.replace('{code}', encodeURIComponent(code));
  const res = await getJsonWithDevFallback(
    fetchImpl,
    getPriceEndpoints().yahoo + path,
    DEV_PROXY.yahoo + path,
  );
  if (!res.ok) return null;
  const meta = res.json?.chart?.result?.[0]?.meta;
  const price = Number(meta?.regularMarketPrice);
  if (!Number.isFinite(price) || price <= 0) return null;
  const out: PriceQuote = { code, price, provider: 'yahoo' };
  if (meta?.regularMarketTime)
    out.tradedAt = new Date(meta.regularMarketTime * 1000).toISOString();
  return out;
}

/** One code, from whichever source answers. */
export async function fetchQuote(
  code: string,
  fetchImpl: FetchLike,
): Promise<PriceQuote | null> {
  return (await fromAsx(code, fetchImpl)) ?? (await fromYahoo(code, fetchImpl));
}

/** Many codes. One failure does not stop the others. */
export async function fetchQuotes(
  codes: string[],
  fetchImpl: FetchLike,
): Promise<PriceFetchResult> {
  const quotes: PriceQuote[] = [];
  const failures: PriceQuoteFailure[] = [];
  for (const code of codes) {
    try {
      const q = await fetchQuote(code, fetchImpl);
      if (q) quotes.push(q);
      else failures.push({ code, message: 'no price returned' });
    } catch (err: any) {
      failures.push({ code, message: String(err?.message ?? err) });
    }
  }
  return { quotes, failures };
}

/**
 * Fetches the current price for every holding and records it in the price
 * history.
 *
 * A holding that cannot be priced is left ALONE. Its last known price stays,
 * and the UI's staleness warning says so. Overwriting a good price with a
 * zero because a request failed would be worse than being out of date.
 */
export async function updatePrices(
  finance: FinanceApi,
  opts: { fetch?: FetchLike; codes?: string[] } = {},
): Promise<PriceUpdateResult> {
  const fetchImpl = (opts.fetch ?? (globalThis as any).fetch) as FetchLike;
  const asOf = todayIso();

  let codes = opts.codes;
  if (!codes) {
    const stocks = await listStocks(finance, { status: 'all' });
    codes = stocks.map((s) => s.stock_code);
  }
  if (codes.length === 0) return { updated: 0, failed: 0, failures: [], asOf };

  const { quotes, failures } = await fetchQuotes(codes, fetchImpl);

  // A quote carries a ticker code; the price table is keyed by stock id.
  const stocks = await listStocks(finance, { status: 'all' });
  const idOf = new Map(stocks.map((s) => [s.stock_code.toUpperCase(), s.id]));

  let updated = 0;
  for (const q of quotes) {
    const stockId = idOf.get(q.code.toUpperCase());
    if (stockId === undefined) {
      failures.push({ code: q.code, message: 'no such holding' });
      continue;
    }
    try {
      // The price table is a HISTORY. A click that returns the same price on
      // the same day should not stack a duplicate row.
      const existing = await listPrices(finance, stockId);
      const latest = existing[existing.length - 1];
      if (
        latest &&
        latest.as_at === asOf &&
        Math.abs(Number(latest.price) - q.price) < 1e-9
      )
        continue;
      await insertPrice(finance, {
        stock_id: stockId,
        price: q.price,
        as_at: asOf,
        source: 'api',
      });
      updated += 1;
    } catch (err: any) {
      failures.push({ code: q.code, message: String(err?.message ?? err) });
    }
  }

  if (failures.length)
    logger.warn('some prices could not be fetched', failures);
  logger.info('prices updated', { updated, failed: failures.length, asOf });
  return { updated, failed: failures.length, failures, asOf };
}
