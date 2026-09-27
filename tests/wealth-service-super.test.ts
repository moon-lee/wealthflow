import { describe, it, expect } from 'vitest';
import { createMockFinance } from '../src/mock/finance-mock.js';
import { createSuperEntry } from '../src/dao/super-entries.js';
import { createPublicWealthAdapter } from '../src/services/public-wealth-adapter.js';

describe('getSuperSummary', () => {
  it('returns balance + contributions, empty→zeros, error→null', async () => {
    const f: any = createMockFinance();
    await createSuperEntry(
      f,
      { date: '2025-08-15', kind: 'balance', amount: 100000 },
      '07-01',
    );
    await createSuperEntry(
      f,
      { date: '2025-09-01', kind: 'contribution', amount: 1000 },
      '07-01',
    );
    const svc = createPublicWealthAdapter(f);
    const s: any = await svc.getSuperSummary('2025-2026');
    expect(s.balance).toEqual({ amount: 100000, date: '2025-08-15' });
    expect(s.contributions).toEqual({ total: 1000, count: 1 });
    const empty: any = await svc.getSuperSummary('2020-2021');
    expect(empty.balance).toBeNull();
    expect(empty.contributions).toEqual({ total: 0, count: 0 });
    // Balance is as-at FY-end: a later FY with no new entries still sees the last one.
    const later: any = await svc.getSuperSummary('2030-2031');
    expect(later.balance).toEqual({ amount: 100000, date: '2025-08-15' });
    expect(later.contributions).toEqual({ total: 0, count: 0 });
    const o: any = await svc.getOverviewSummary('2025-2026');
    expect(o.super.contributions.total).toBe(1000);
    expect(o.super.balance).toEqual({ amount: 100000, date: '2025-08-15' });
    const broken: any = {
      ...f,
      db: {
        table: () => {
          throw new Error('db down');
        },
      },
    };
    expect(
      await createPublicWealthAdapter(broken).getSuperSummary('2025-2026'),
    ).toBeNull();
  });
});
