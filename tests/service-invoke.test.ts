import { describe, it, expect, afterEach } from 'vitest';
import { createMockFinance } from '../src/mock/finance-mock.js';
import { createBank } from '../src/dao/banks.js';
import { createInterestEntry } from '../src/dao/interest-entries.js';
import { createStock } from '../src/dao/stocks.js';
import { createDividend } from '../src/dao/dividends.js';
import { createPublicWealthAdapter } from '../src/services/public-wealth-adapter.js';

/**
 * The mock's services.invoke must behave exactly like the real host, which
 * spreads params into positional args (domain-service-registry.ts:38). If this
 * drifts, a consumer extension passes its tests against the mock and silently
 * gets different numbers in the app.
 */
describe('mock services.invoke matches host arg convention', () => {
  const registered: string[] = [];
  const spy = (
    name: string,
    impl: Record<string, (...a: unknown[]) => unknown>,
  ) => {
    const f: any = createMockFinance();
    registered.push(name);
    f.services.register(name, impl);
    return f;
  };

  afterEach(() => {
    const g: any = globalThis as any;
    for (const n of registered.splice(0)) g.__mockServices?.delete(n);
  });

  it('spreads an array of params positionally', async () => {
    const f = spy('svc-args', {
      add: (a: unknown, b: unknown) => `${a}+${b}`,
      zero: () => 'ok',
    });
    expect(await f.services.invoke('svc-args', 'add', [2, 3])).toBe('2+3');
    expect(await f.services.invoke('svc-args', 'zero', [])).toBe('ok');
  });

  it('spreads an object by insertion order, not by name', async () => {
    const f = spy('svc-obj', { pair: (a: unknown, b: unknown) => `${a}|${b}` });
    expect(
      await f.services.invoke('svc-obj', 'pair', { x: 'first', y: 'second' }),
    ).toBe('first|second');
  });

  it('splits a bare string into characters, as the host does', async () => {
    // Not a mock bug: Object.values('2025-2026') is ['2','0','2','5',...].
    // This is why consumers must pass ['2025-2026'], not '2025-2026'.
    const f = spy('svc-str', { echo: (...a: unknown[]) => a });
    expect(await f.services.invoke('svc-str', 'echo', 'ab')).toEqual([
      'a',
      'b',
    ]);
  });

  it('calls a zero-arg method with no params', async () => {
    const f = spy('svc-noargs', { ping: () => 'pong' });
    expect(await f.services.invoke('svc-noargs', 'ping')).toBe('pong');
    expect(await f.services.invoke('svc-noargs', 'ping', null)).toBe('pong');
  });

  it('returns null for an unknown service or method', async () => {
    const f = spy('svc-known', { ping: () => 'pong' });
    expect(await f.services.invoke('svc-missing', 'ping', [])).toBeNull();
    expect(await f.services.invoke('svc-known', 'missing', [])).toBeNull();
  });

  it('unregisters a service', async () => {
    const f = spy('svc-gone', { ping: () => 'pong' });
    f.services.unregister('svc-gone');
    registered.length = 0;
    expect(await f.services.invoke('svc-gone', 'ping', [])).toBeNull();
  });
});

describe('public adapter over the mock transport', () => {
  const seed = async () => {
    const f: any = createMockFinance();
    const b: any = await createBank(f, {
      bank_code: 'UBank',
      account_number: '9',
    });
    await createInterestEntry(
      f,
      {
        bank_id: b.id,
        date: '2025-07-31',
        amount: 10,
        finance_year: '2025-2026',
      },
      '07-01',
    );
    const s: any = await createStock(f, {
      stock_code: 'VAS',
      stock_full_name: 'V',
      shares: 5,
    });
    await createDividend(
      f,
      {
        stock_id: s.id,
        date: '2025-08-01',
        type: 'non_trust',
        gross: 100,
        franking: 30,
        finance_year: '2025-2026',
      },
      '07-01',
    );
    return f;
  };

  it('returns the same summary invoked as a direct call', async () => {
    const f = await seed();
    const adapter: any = createPublicWealthAdapter(f);
    f.services.register('wealthflow', adapter);
    const g: any = globalThis as any;

    try {
      const overWire: any = await f.services.invoke(
        'wealthflow',
        'getOverviewSummary',
        ['2025-2026'],
      );
      const direct: any = await adapter.getOverviewSummary('2025-2026');
      expect(overWire).toEqual(direct);
      expect(overWire.combined.gross).toBe(110);
      expect(overWire.combined.franking).toBe(30);
      expect(overWire.interest.total).toBe(10);
      expect(overWire.dividends.gross).toBe(100);
    } finally {
      g.__mockServices?.delete('wealthflow');
    }
  });

  it('survives the host unbound dispatch (no `this`)', async () => {
    // Production crash 2026-09-27: host.js invoke does `let e = a[r]; e(...)`,
    // so adapter methods must work with `this === undefined`.
    const f = await seed();
    const adapter: any = createPublicWealthAdapter(f);
    const fn = adapter.getOverviewSummary;
    const res: any = await fn('2025-2026');
    expect(res?.combined?.gross).toBe(110);
    expect(res?.combined?.franking).toBe(30);
  });

  it('reports the financial year it was given, not a wrapped value', async () => {
    const f = await seed();
    f.services.register('wealthflow', createPublicWealthAdapter(f));
    const g: any = globalThis as any;
    try {
      const hit: any = await f.services.invoke(
        'wealthflow',
        'getInterestSummary',
        ['2025-2026'],
      );
      const miss: any = await f.services.invoke(
        'wealthflow',
        'getInterestSummary',
        ['1999-2000'],
      );
      expect(hit.financialYear).toBe('2025-2026');
      expect(hit.total).toBe(10);
      expect(miss.financialYear).toBe('1999-2000');
      expect(miss.total).toBe(0);
    } finally {
      g.__mockServices?.delete('wealthflow');
    }
  });
});
