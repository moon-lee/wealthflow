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

  it('declares navigation in Overview, Banks, Stocks order with no add entries', () => {
    const fe: any = (pkg as any).financeExtension;
    const nav = fe.contributions.navigation;
    expect(nav.map((n: any) => n.label)).toEqual([
      'Overview',
      'Banks',
      'Stocks',
    ]);
    expect(nav.map((n: any) => n.command)).toEqual([
      'wealthflow.show-overview',
      'wealthflow.show-banks',
      'wealthflow.show-stocks',
    ]);
    const ids = fe.contributions.commands.map((c: any) => c.id);
    for (const item of nav) {
      expect(ids).toContain(item.command);
      expect(fe.contributions.allowedCommands).toContain(item.command);
    }
    expect(nav.map((n: any) => n.id)).toEqual([
      'wealthflow-overview',
      'wealthflow-banks',
      'wealthflow-stocks',
    ]);
  });

  it('declares bank_bank_full_name on wealthflow_banks', () => {
    const fe: any = (pkg as any).financeExtension;
    const banks = fe.tables.find((t: any) => t.name === 'wealthflow_banks');
    expect(banks).toBeDefined();
    expect(banks.columns.map((c: any) => c.name)).toContain('bank_full_name');
  });
});
