import { describe, it, expect } from 'vitest';
import { createMockFinance } from '../src/mock/finance-mock.js';
import { createStock } from '../src/dao/stocks.js';
import { listPrices } from '../src/dao/prices.js';
import {
  fetchQuote,
  fetchQuotes,
  updatePrices,
} from '../src/services/price-service.js';

const ASX_BODY = (code: string, price: number) => ({
  data: {
    symbol: code,
    priceLast: price,
    priceAsk: price + 0.06,
    priceBid: price - 0.12,
    priceChange: 0.15,
    priceChangePercent: 0.1378,
    volume: 234396,
  },
});

const YAHOO_BODY = (code: string, price: number) => ({
  chart: {
    result: [
      {
        meta: {
          symbol: `${code}.AX`,
          currency: 'AUD',
          exchangeName: 'ASX',
          instrumentType: 'ETF',
          regularMarketPrice: price,
          regularMarketTime: 1792559635,
        },
      },
    ],
  },
});

/** A fetch that answers from a table, and 404s anything it does not know. */
function fakeFetch(table: Record<string, any>) {
  const calls: string[] = [];
  const impl = async (url: string) => {
    calls.push(url);
    for (const [key, body] of Object.entries(table)) {
      if (url.includes(key))
        return {
          ok: true,
          status: 200,
          json: async () => body,
        };
    }
    return {
      ok: false,
      status: 404,
      json: async () => ({}),
    };
  };
  return { impl: impl as any, calls };
}

describe('fetchQuote', () => {
  it('prefers the ASX own endpoint', async () => {
    const f = fakeFetch({
      markitdigital: ASX_BODY('VAS', 109.02),
      '/chart/': YAHOO_BODY('VAS', 109.02),
    });
    const q = await fetchQuote('VAS', f.impl);
    expect(q!.price).toBe(109.02);
    expect(q!.provider).toBe('asx');
    // The fallback was never needed.
    expect(f.calls.filter((u) => u.includes('yahoo'))).toHaveLength(0);
  });

  it('falls back to Yahoo when ASX does not answer', async () => {
    const f = fakeFetch({ '/chart/': YAHOO_BODY('VHY', 84.6) });
    const q = await fetchQuote('VHY', f.impl);
    expect(q!.price).toBe(84.6);
    expect(q!.provider).toBe('yahoo');
    expect(q!.tradedAt).toBe('2026-10-21T05:13:55.000Z');
  });

  it('returns null when neither source has it', async () => {
    const f = fakeFetch({});
    expect(await fetchQuote('ZZZZ', f.impl)).toBeNull();
  });

  it('rejects a zero price rather than recording it', async () => {
    const f = fakeFetch({ markitdigital: ASX_BODY('VAS', 0) });
    expect(await fetchQuote('VAS', f.impl)).toBeNull();
  });
});

describe('fetchQuotes', () => {
  it('prices every code it can and reports the ones it cannot', async () => {
    const f = fakeFetch({
      '/companies/VAS': ASX_BODY('VAS', 109.02),
      '/companies/VHY': ASX_BODY('VHY', 84.6),
      '/companies/FGX': ASX_BODY('FGX', 1.34),
    });
    const r = await fetchQuotes(['VAS', 'VHY', 'FGX', 'NOPE'], f.impl);
    expect(r.quotes.map((q) => q.code)).toEqual(['VAS', 'VHY', 'FGX']);
    expect(r.failures.map((x) => x.code)).toEqual(['NOPE']);
  });

  it('keeps going after one code fails', async () => {
    const f = fakeFetch({
      '/companies/VAS': ASX_BODY('VAS', 109.02),
      '/companies/FGX': ASX_BODY('FGX', 1.34),
    });
    const r = await fetchQuotes(['VAS', 'BROKEN', 'FGX'], f.impl);
    expect(r.quotes.map((q) => q.code)).toEqual(['VAS', 'FGX']);
    expect(r.failures).toHaveLength(1);
  });
});

describe('updatePrices', () => {
  async function seeded() {
    const f: any = createMockFinance();
    for (const [code, name] of [
      ['VAS', 'V'],
      ['VHY', 'V'],
      ['FGX', 'F'],
    ])
      await createStock(f, {
        stock_code: code,
        stock_full_name: name,
        shares: 0,
      });
    return f;
  }

  it('records a price row for every holding it could price', async () => {
    const f = await seeded();
    const fake = fakeFetch({
      '/companies/VAS': ASX_BODY('VAS', 109.02),
      '/companies/VHY': ASX_BODY('VHY', 84.6),
      '/companies/FGX': ASX_BODY('FGX', 1.34),
    });
    const r = await updatePrices(f, { fetch: fake.impl });
    expect(r.updated).toBe(3);
    expect(r.failed).toBe(0);
    const rows = await listPrices(f);
    expect(rows).toHaveLength(3);
    expect(rows.map((x) => Number(x.price)).sort((a, b) => a - b)).toEqual([
      1.34, 84.6, 109.02,
    ]);
  });

  it('leaves an unpriced holding ALONE rather than writing a zero', async () => {
    const f = await seeded();
    const fake = fakeFetch({
      '/companies/VAS': ASX_BODY('VAS', 109.02),
    });
    const r = await updatePrices(f, { fetch: fake.impl });
    expect(r.updated).toBe(1);
    expect(r.failed).toBe(2);
    // One row only, for the holding that answered. A zero would overwrite a
    // good price and be worse than being out of date.
    const rows = await listPrices(f);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!.price)).toBe(109.02);
  });

  it('does not stack a duplicate row for the same price on the same day', async () => {
    const f = await seeded();
    const fake = fakeFetch({
      '/companies/VAS': ASX_BODY('VAS', 109.02),
      '/companies/VHY': ASX_BODY('VHY', 84.6),
      '/companies/FGX': ASX_BODY('FGX', 1.34),
    });
    await updatePrices(f, { fetch: fake.impl });
    const second = await updatePrices(f, { fetch: fake.impl });
    expect(second.updated).toBe(0);
    expect((await listPrices(f)).length).toBe(3);
  });

  it('records a new row when the price has moved', async () => {
    const f = await seeded();
    const first = fakeFetch({
      '/companies/VAS': ASX_BODY('VAS', 109.02),
      '/companies/VHY': ASX_BODY('VHY', 84.6),
      '/companies/FGX': ASX_BODY('FGX', 1.34),
    });
    await updatePrices(f, { fetch: first.impl });
    const second = fakeFetch({
      '/companies/VAS': ASX_BODY('VAS', 110.5),
      '/companies/VHY': ASX_BODY('VHY', 84.6),
      '/companies/FGX': ASX_BODY('FGX', 1.34),
    });
    const r = await updatePrices(f, { fetch: second.impl });
    expect(r.updated).toBe(1);
    expect((await listPrices(f)).length).toBe(4);
  });

  it('registers commands on the mock, so the dev bridge can run them', async () => {
    // The dev harness's shell bridge calls finance.commands.execute, so the
    // mock's command API has to be a REAL registry. It used to be a stub that
    // swallowed every call, which made a button that delegates work to the
    // host look broken in dev.
    const f: any = createMockFinance();
    let ran = 0;
    f.commands.registerCommand('test.cmd', 'Test', (arg: unknown) => {
      ran += 1;
      return { echoed: arg };
    });
    expect(await f.commands.execute('test.cmd', 'hello')).toEqual({
      echoed: 'hello',
    });
    expect(ran).toBe(1);
    // An unknown command is null, not a throw.
    expect(await f.commands.execute('nope')).toBeNull();
  });

  it('can be pointed at a different base, which is how dev gets around CORS', async () => {
    const { setPriceEndpoints, getPriceEndpoints } =
      await import('../src/services/price-service.js');
    const before = getPriceEndpoints();
    expect(before.asx).toContain('asx.api.markitdigital.com');
    setPriceEndpoints({ asx: '/proxy/asx' });
    try {
      expect(getPriceEndpoints().asx).toBe('/proxy/asx');
      // The Yahoo base is untouched.
      expect(getPriceEndpoints().yahoo).toBe(before.yahoo);
      // And the request actually goes to the new base.
      const f = fakeFetch({ '/proxy/asx/': ASX_BODY('VAS', 109.02) });
      const q = await fetchQuote('VAS', f.impl);
      expect(q!.price).toBe(109.02);
      expect(f.calls[0]).toContain('/proxy/asx/');
    } finally {
      setPriceEndpoints({ asx: before.asx });
    }
  });

  it('falls back to the dev proxy when the browser blocks the direct request', async () => {
    // A CORS block fails the fetch outright - no status, no body - so the
    // only way to tell it from a 404 is that the request THREW.
    const g = globalThis as any;
    const had = 'location' in g;
    const real = g.location;
    g.location = { protocol: 'http:' };
    try {
      const impl = async (url: string) => {
        if (url.startsWith('https://')) throw new TypeError('Failed to fetch');
        if (url.startsWith('/proxy/asx/'))
          return {
            ok: true,
            status: 200,
            json: async () => ASX_BODY('VAS', 109.02),
          };
        return { ok: false, status: 404, json: async () => ({}) };
      };
      const q = await fetchQuote('VAS', impl as any);
      expect(q!.price).toBe(109.02);
    } finally {
      if (had) g.location = real;
      else delete g.location;
    }
  });

  it('does NOT use the proxy outside a browser page', async () => {
    // The app's fetch is host-side Node, where there is no CORS and no dev
    // server. It must not try a proxy route that does not exist.
    const g = globalThis as any;
    const had = 'location' in g;
    const real = g.location;
    delete g.location;
    try {
      const seen: string[] = [];
      const impl = async (url: string) => {
        seen.push(url);
        throw new TypeError('Failed to fetch');
      };
      expect(await fetchQuote('VAS', impl as any)).toBeNull();
      expect(seen.some((u) => u.startsWith('/proxy/'))).toBe(false);
    } finally {
      if (had) g.location = real;
    }
  });

  it('marks the row as sourced from the API, not by hand', async () => {
    const f = await seeded();
    const fake = fakeFetch({
      '/companies/VAS': ASX_BODY('VAS', 109.02),
    });
    await updatePrices(f, { fetch: fake.impl });
    const rows = await listPrices(f);
    expect(rows[0]!.source).toBe('api');
  });
});
