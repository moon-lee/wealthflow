import { describe, it, expect } from 'vitest';
import pkg from '../package.json';

describe('manifest', () => {
  it('declares single view, 5 commands, 4 tables', () => {
    const fe: any = (pkg as any).financeExtension;
    expect(fe.id).toBe('wealthflow');
    expect(fe.contributions.views).toHaveLength(1);
    expect(fe.contributions.views[0].id).toBe('wealthflow');
    const ids = fe.contributions.commands.map((c: any) => c.id).sort();
    expect(ids).toEqual(
      [
        'wealthflow.add-dividend',
        'wealthflow.add-interest',
        'wealthflow.show-banks',
        'wealthflow.show-overview',
        'wealthflow.show-stocks',
      ].sort(),
    );
    expect(fe.tables.map((t: any) => t.name).sort()).toEqual(
      [
        'wealthflow_banks',
        'wealthflow_dividends',
        'wealthflow_interest_entries',
        'wealthflow_stocks',
      ].sort(),
    );
    for (const id of ids)
      expect(fe.contributions.allowedCommands).toContain(id);
  });
});
