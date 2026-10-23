import { describe, it, expect } from 'vitest';
import pkg from '../package.json';

describe('manifest', () => {
  it('declares single view, 8 commands, 11 tables', () => {
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
        'wealthflow.show-trades',
        'wealthflow.update-prices',
      ].sort(),
    );
    expect(fe.tables.map((t: any) => t.name).sort()).toEqual(
      [
        'wealthflow_banks',
        'wealthflow_capital_losses',
        'wealthflow_cost_base_adjustments',
        'wealthflow_dividends',
        'wealthflow_disposals',
        'wealthflow_interest_entries',
        'wealthflow_parcels',
        'wealthflow_prices',
        'wealthflow_stocks',
        'wealthflow_super_entries',
        'wealthflow_trades',
      ].sort(),
    );
    for (const id of ids)
      expect(fe.contributions.allowedCommands).toContain(id);
  });

  it('declares the Quick Links Refresh item, then Overview, Banks, Stocks, Trades, with no add entries', () => {
    const fe: any = (pkg as any).financeExtension;
    const nav = fe.contributions.navigation;
    // Refresh leads, in the shared "Quick Links" group, so every extension
    // presents it identically (matching taxflow and dashboard).
    expect(nav.map((n: any) => n.label)).toEqual([
      'Refresh',
      'Overview',
      'Banks',
      'Stocks',
      'Trades',
    ]);
    expect(nav.map((n: any) => n.command)).toEqual([
      'wealthflow.refresh',
      'wealthflow.show-overview',
      'wealthflow.show-banks',
      'wealthflow.show-stocks',
      'wealthflow.show-trades',
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
      'wealthflow-trades',
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

  it('declares wealthflow_prices as an append-only price history', () => {
    const fe: any = (pkg as any).financeExtension;
    const t = fe.tables.find((x: any) => x.name === 'wealthflow_prices');
    expect(t).toBeDefined();
    expect(t.columns.map((c: any) => c.name).sort()).toEqual(
      ['as_at', 'price', 'source', 'stock_id'].sort(),
    );
    // A price of 0 is not a price, and a price without a date cannot be
    // "as of" anything.
    expect(t.columns.find((c: any) => c.name === 'price').nullable).toBe(false);
    expect(t.columns.find((c: any) => c.name === 'as_at').nullable).toBe(false);
  });

  it('declares AMIT adjustments as fund-level, not parcel-level', () => {
    const fe: any = (pkg as any).financeExtension;
    const t = fe.tables.find(
      (x: any) => x.name === 'wealthflow_cost_base_adjustments',
    );
    const cols = t.columns.map((c: any) => c.name);
    // Spec 6.1: adjustments arrive as a per-distribution fund-level dollar
    // amount. A parcel/event key would assert knowledge the statement does not
    // carry, and is the thing spec 6.1 explicitly corrects.
    expect(cols).not.toContain('parcel_id');
    expect(cols).not.toContain('origin_trade_id');
    expect(cols).toContain('stock_id');
    expect(cols).toContain('date');
    // Signed: negative reduces cost base, so it must NOT be min-constrained.
    expect(t.columns.find((c: any) => c.name === 'amount').min).toBeUndefined();
  });

  it('carries the DRP figures on the dividend row itself', () => {
    const fe: any = (pkg as any).financeExtension;
    const cols = fe.tables
      .find((x: any) => x.name === 'wealthflow_dividends')
      .columns.map((c: any) => c.name);
    expect(cols).toContain('amount_reinvested');
    expect(cols).toContain('units_acquired');
  });

  it('declares wealthflow_disposals keyed on origin_trade_id with no parcel_id', () => {
    const fe: any = (pkg as any).financeExtension;
    const t = fe.tables.find((x: any) => x.name === 'wealthflow_disposals');
    expect(t).toBeDefined();
    const cols = t.columns.map((c: any) => c.name);
    // A rebuild re-mints parcel ids, so a disposal that pointed at one would
    // silently detach from the parcel it describes.
    expect(cols).not.toContain('parcel_id');
    expect(cols).toContain('origin_trade_id');
    for (const money of [
      'proceeds',
      'cost_base',
      'nominal_gain',
      'discount_applied',
      'net_gain',
    ])
      expect(t.columns.find((c: any) => c.name === money).type, money).toBe(
        'real',
      );
    // Every v1 table carries a finance_year; audit 4 of seed-sql enforces it.
    expect(cols).toContain('finance_year');
  });

  it('declares wealthflow_capital_losses as an opening balance', () => {
    const fe: any = (pkg as any).financeExtension;
    const t = fe.tables.find(
      (x: any) => x.name === 'wealthflow_capital_losses',
    );
    expect(t.columns.map((c: any) => c.name).sort()).toEqual(
      ['finance_year', 'opening_balance'].sort(),
    );
  });

  it('declares wealthflow_trades with the full Phase 1-3 column set', () => {
    const fe: any = (pkg as any).financeExtension;
    const t = fe.tables.find((x: any) => x.name === 'wealthflow_trades');
    expect(t).toBeDefined();
    // dividend_id is declared now but used only in Phase 3: the app runs
    // CREATE TABLE IF NOT EXISTS and never migrates, so a later task could not
    // add it without dropping the table by hand.
    expect(t.columns.map((c: any) => c.name).sort()).toEqual(
      [
        'brokerage',
        'date',
        'dividend_id',
        'notes',
        'price',
        'quantity',
        'side',
        'source',
        'stock_id',
      ].sort(),
    );
    expect(t.columns.find((c: any) => c.name === 'quantity').type).toBe('real');
    expect(t.columns.find((c: any) => c.name === 'price').type).toBe('real');
    expect(t.columns.find((c: any) => c.name === 'dividend_id').nullable).toBe(
      true,
    );
  });

  it('declares wealthflow_parcels keyed on origin_trade_id with no eligibility column', () => {
    const fe: any = (pkg as any).financeExtension;
    const t = fe.tables.find((x: any) => x.name === 'wealthflow_parcels');
    expect(t).toBeDefined();
    expect(t.columns.map((c: any) => c.name).sort()).toEqual(
      [
        'acquired_date',
        'brokerage',
        'origin_trade_id',
        'price',
        'quantity',
        'stock_id',
      ].sort(),
    );
    expect(t.columns.find((c: any) => c.name === 'quantity').type).toBe('real');
    // Eligibility is computed on read: a stored boolean goes stale the moment
    // a parcel crosses its own 12-month line without any write.
    expect(t.columns.map((c: any) => c.name)).not.toContain(
      'discount_eligible',
    );
  });

  it('allowlists the four trade UI events', () => {
    const fe: any = (pkg as any).financeExtension;
    for (const evt of [
      'trade-create',
      'trade-edit',
      'trade-delete',
      'trade-edit-request',
    ])
      expect(fe.contributions.allowedUiEvents).toContain(evt);
  });
});
