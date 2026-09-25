import { describe, it, expect } from 'vitest';
import { createMockFinance } from '../src/mock/finance-mock.js';
import { createBank } from '../src/dao/banks.js';
import { createInterestEntry } from '../src/dao/interest-entries.js';
import { createStock } from '../src/dao/stocks.js';
import { createDividend } from '../src/dao/dividends.js';
import { createPublicWealthAdapter } from '../src/services/public-wealth-adapter.js';

describe('full wealth service', () => {
  it('combines dividends + interest', async () => {
    const f: any = createMockFinance();
    const b: any = await createBank(f, { name: 'UBank', account_number: '9' });
    await createInterestEntry(f, { bank_id: b.id, date: '2025-07-31', amount: 10, finance_year: '2025-2026' }, '07-01');
    const s: any = await createStock(f, { code: 'VAS', name: 'V', shares: 5 });
    await createDividend(f, { stock_id: s.id, date: '2025-08-01', type: 'non_trust', gross: 100, franking: 30, finance_year: '2025-2026' }, '07-01');
    const svc = createPublicWealthAdapter(f);
    const d: any = await svc.getDividendSummary('2025-2026');
    expect(d.gross).toBe(100);
    expect(d.byType.non_trust.franking).toBe(30);
    expect(d.byStock[0].code).toBe('VAS');
    const o: any = await svc.getOverviewSummary('2025-2026');
    expect(o.combined.gross).toBe(110);
    expect(o.combined.franking).toBe(30);
    expect(o.interest.total).toBe(10);
  });
});
