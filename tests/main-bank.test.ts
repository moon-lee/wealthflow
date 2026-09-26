import { describe, it, expect } from 'vitest';
import { createMockFinance } from '../src/mock/finance-mock.js';

describe('main bank wiring', () => {
  it('registers service with getInterestSummary', async () => {
    const { activate, deactivate } = await import('../src/main.js');
    const f: any = createMockFinance();
    const cmds: string[] = [];
    f.commands.registerCommand = (id: string) => cmds.push(id);
    await activate(f, { viewId: 'wealthflow' });
    expect(cmds).toContain('wealthflow.show-banks');
    expect(cmds).toContain('wealthflow.add-interest');
    // Params as an array: the host spreads them positionally, so a bare string
    // would reach the method one character at a time.
    const live: any = await f.services.invoke(
      'wealthflow',
      'getInterestSummary',
      ['2025-2026'],
    );
    expect(live).toBeTruthy();
    expect(live.financialYear).toBe('2025-2026');
    deactivate();
    expect(
      await f.services.invoke('wealthflow', 'getInterestSummary', [
        '2025-2026',
      ]),
    ).toBeNull();
  });
});
