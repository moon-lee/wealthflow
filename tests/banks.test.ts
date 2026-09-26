import { describe, it, expect } from 'vitest';
import { createBank, listBanks, setBankActive } from '../src/dao/banks.js';

function stub(rows: Record<string, unknown>[] = []) {
  const mem = [...rows];
  let id = 100;
  return {
    db: {
      table: () => ({
        find: async (f: any = {}) =>
          mem.filter((r) =>
            Object.entries(f).every(([k, v]) => (r as any)[k] === v),
          ),
        findOne: async (f: any = {}) =>
          mem.find((r) =>
            Object.entries(f).every(([k, v]) => (r as any)[k] === v),
          ) ?? null,
        insert: async (row: any) => {
          const r = { id: id++, is_active: true, ...row };
          mem.push(r);
          return r;
        },
        update: async (f: any, p: any) => {
          let n = 0;
          for (const r of mem)
            if (Object.entries(f).every(([k, v]) => (r as any)[k] === v)) {
              Object.assign(r, p);
              n++;
            }
          return { affected: n };
        },
        delete: async () => ({ affected: 0 }),
        count: async () => mem.length,
      }),
    },
  };
}

describe('banks dao', () => {
  it('creates + lists active by default', async () => {
    const f: any = stub();
    const row: any = await createBank(f, {
      name: 'Macquarie',
      full_name: 'Macquarie Bank Limited',
      bsb: '012345',
      account_number: '1234567',
    });
    expect(row.id).toBeDefined();
    expect(row.full_name).toBe('Macquarie Bank Limited');
    expect(await listBanks(f, { status: 'active' })).toHaveLength(1);
  });
  it('rejects blank name/account', async () => {
    const f: any = stub();
    await expect(
      createBank(f, { name: '', account_number: '1' }),
    ).rejects.toThrow();
  });
  it('deactivate hides from active filter but keeps row', async () => {
    const f: any = stub();
    const row: any = await createBank(f, {
      name: 'BOQ',
      account_number: '999',
    });
    await setBankActive(f, row.id, false);
    expect(await listBanks(f, { status: 'active' })).toHaveLength(0);
    expect(await listBanks(f, { status: 'all' })).toHaveLength(1);
  });
});
