import { describe, it, expect } from 'vitest';
import { createMockFinance } from '../src/mock/finance-mock.js';
import {
  createSuperEntry,
  listSuperEntries,
  updateSuperEntry,
  deleteSuperEntry,
} from '../src/dao/super-entries.js';

describe('super dao', () => {
  it('creates balance + contribution entries with auto FY', async () => {
    const f: any = createMockFinance();
    const b: any = await createSuperEntry(
      f,
      { date: '2025-08-15', kind: 'balance', amount: 125000 },
      '07-01',
    );
    expect(b.finance_year).toBe('2025-2026');
    await createSuperEntry(
      f,
      { date: '2025-09-01', kind: 'contribution', amount: 1000 },
      '07-01',
    );
    expect(
      await listSuperEntries(f, { financeYear: '2025-2026' }),
    ).toHaveLength(2);
    expect(await listSuperEntries(f, { kind: 'balance' })).toHaveLength(1);
  });
  it('rejects bad kind, negative amount, bad date', async () => {
    const f: any = createMockFinance();
    await expect(
      createSuperEntry(
        f,
        { date: '2025-08-01', kind: 'nope', amount: 1 },
        '07-01',
      ),
    ).rejects.toThrow(/kind must be one of/);
    await expect(
      createSuperEntry(
        f,
        { date: '2025-08-01', kind: 'balance', amount: -1 },
        '07-01',
      ),
    ).rejects.toThrow();
    await expect(
      createSuperEntry(
        f,
        { date: 'not-a-date', kind: 'balance', amount: 1 },
        '07-01',
      ),
    ).rejects.toThrow(/date must be YYYY-MM-DD/);
  });
  it('updates and deletes by id', async () => {
    const f: any = createMockFinance();
    const row: any = await createSuperEntry(
      f,
      { date: '2025-08-01', kind: 'contribution', amount: 500 },
      '07-01',
    );
    expect(
      ((await updateSuperEntry(f, row.id, { amount: 750 })) as any).affected,
    ).toBe(1);
    expect(((await deleteSuperEntry(f, row.id)) as any).affected).toBe(1);
    expect(await listSuperEntries(f, {})).toHaveLength(0);
  });
});
