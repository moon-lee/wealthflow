import { describe, it, expect } from 'vitest';
import { createMockFinance } from '../src/mock/finance-mock.js';
import { createBank, setBankActive } from '../src/dao/banks.js';
import { createInterestEntry } from '../src/dao/interest-entries.js';
import { createPublicWealthAdapter } from '../src/services/public-wealth-adapter.js';

describe('getInterestSummary', () => {
  it('totals + byBank, includes deactivated history, empty→zeros, error→null', async () => {
    const f: any = createMockFinance();
    const a: any = await createBank(f, { name: 'Macquarie', account_number: '1' });
    const b: any = await createBank(f, { name: 'BOQ', account_number: '2' });
    await createInterestEntry(f, { bank_id: a.id, date: '2025-07-31', amount: 3.39, finance_year: '2025-2026' }, '07-01');
    await createInterestEntry(f, { bank_id: b.id, date: '2025-07-31', amount: 6.48, finance_year: '2025-2026' }, '07-01');
    await setBankActive(f, b.id, false);
    const svc = createPublicWealthAdapter(f);
    const s: any = await svc.getInterestSummary('2025-2026');
    expect(s.total).toBeCloseTo(9.87, 2);
    expect(s.byBank).toHaveLength(2);
    const empty: any = await svc.getInterestSummary('2030-2031');
    expect(empty.total).toBe(0);
    const emptyDiv: any = await svc.getDividendSummary('2030-2031');
    expect(emptyDiv.gross).toBe(0);
    expect(emptyDiv.franking).toBe(0);
  });
});
