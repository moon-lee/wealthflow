import { describe, it, expect } from 'vitest';
import pkg from '../package.json';

describe('manifest', () => {
  it('declares single view, 6 commands, 5 tables', () => {
    const fe: any = (pkg as any).financeExtension;
    expect(fe.id).toBe('wealthflow');
    expect(fe.contributions.views).toHaveLength(1);
    expect(fe.contributions.views[0].id).toBe('wealthflow');
    const ids = fe.contributions.commands.map((c: any) => c.id).sort();
    expect(ids).toEqual(
      [
        'wealthflow.add-dividend',
        'wealthflow.add-interest',
        'wealthflow.refresh',
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
        'wealthflow_super_entries',
      ].sort(),
    );
    for (const id of ids)
      expect(fe.contributions.allowedCommands).toContain(id);
  });

  it('declares the Quick Links Refresh item, then Overview, Banks, Stocks, with no add entries', () => {
    const fe: any = (pkg as any).financeExtension;
    const nav = fe.contributions.navigation;
    // Refresh leads, in the shared "Quick Links" group, so every extension
    // presents it identically (matching taxflow and dashboard).
    expect(nav.map((n: any) => n.label)).toEqual([
      'Refresh',
      'Overview',
      'Banks',
      'Stocks',
    ]);
    expect(nav.map((n: any) => n.command)).toEqual([
      'wealthflow.refresh',
      'wealthflow.show-overview',
      'wealthflow.show-banks',
      'wealthflow.show-stocks',
    ]);
    expect(nav[0].group).toBe('Quick Links');
    const ids = fe.contributions.commands.map((c: any) => c.id);
    for (const item of nav) {
      expect(ids).toContain(item.command);
      expect(fe.contributions.allowedCommands).toContain(item.command);
    }
    expect(nav.map((n: any) => n.id)).toEqual([
      'wealthflow-refresh',
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

  it('declares wealthflow_super_entries with kind/amount columns', () => {
    const fe: any = (pkg as any).financeExtension;
    const table = fe.tables.find(
      (t: any) => t.name === 'wealthflow_super_entries',
    );
    expect(table).toBeDefined();
    expect(table.columns.map((c: any) => c.name).sort()).toEqual(
      ['amount', 'date', 'finance_year', 'kind', 'notes'].sort(),
    );
    for (const evt of ['super-create', 'super-edit', 'super-delete'])
      expect(fe.contributions.allowedUiEvents).toContain(evt);
  });
});
