import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { readSheet1 } from '../scripts/xlsx-read.mjs';
import {
  parseTrades,
  audit,
  HELD_CODES,
  EXPECTED,
} from '../scripts/import-sharesight.mjs';

const WORKBOOK = 'docs/AllTradesReport.xlsx';

describe('xlsx reader', () => {
  it('reads the real workbook without a dependency', () => {
    const rows = readSheet1(readFileSync(WORKBOOK));
    expect(rows.length).toBeGreaterThan(80);
    expect(rows[0].A).toBe('All trades report for: My Lists');
  });

  it('reads the header row verbatim', () => {
    const rows = readSheet1(readFileSync(WORKBOOK));
    const header = rows.find((r: any) => r.Code === 'Code');
    expect(header.Date).toBe('Date');
    expect(header.Type).toBe('Type');
    expect(header.Qty).toBe('Qty');
    expect(header.Price).toBe('Price');
    expect(header.Brokerage).toBe('Brokerage');
  });

  it('keys data rows by header name, not by column letter', () => {
    const rows = readSheet1(readFileSync(WORKBOOK));
    const data = rows.find((r: any) => r.Code === 'TLS');
    expect(data.Date).toBe('2020-09-17');
    expect(data.Type).toBe('Buy');
    expect(data.D).toBeUndefined();
  });

  it('keeps full precision on a price', () => {
    const rows = readSheet1(readFileSync(WORKBOOK));
    const drp = rows.find(
      (r: any) => r.Code === 'VAS' && r.Date === '2026-10-16',
    );
    expect(drp.Price).toBe('108.8611');
  });
});

describe('import-sharesight', () => {
  it('parses every held holding and matches the reconciled figures', () => {
    const parsed = parseTrades(readSheet1(readFileSync(WORKBOOK)));
    const { accepted, heldCounts } = parsed;
    for (const code of HELD_CODES) {
      const mine = accepted.filter((r: any) => r.code === code);
      // Row counts come from the workbook (including any row the importer
      // refuses); units and cost base come from what will actually be written.
      expect(heldCounts[code].rows, code).toBe(EXPECTED[code].rows);
      expect(
        mine.reduce((s: number, r: any) => s + r.quantity, 0),
        code,
      ).toBe(EXPECTED[code].units);
      const cb = mine.reduce(
        (s: number, r: any) => s + r.quantity * r.price + r.brokerage,
        0,
      );
      expect(Math.round(cb * 100) / 100, code).toBe(EXPECTED[code].costBase);
    }
  });

  it('applies the live-source correction to the stale workbook row, and says so', () => {
    // The workbook export carries VHY 16 Jul 2026 as 0 units and $0.00. The
    // owner's copy of that row says 1 unit at $82.706. The source wins, the
    // correction is recorded, and it is reported - never applied silently.
    const { accepted, rejected, corrections } = parseTrades(
      readSheet1(readFileSync(WORKBOOK)),
    );
    expect(rejected).toEqual([]);
    expect(corrections).toHaveLength(1);
    expect(corrections[0].code).toBe('VHY');
    expect(corrections[0].date).toBe('2026-07-16');
    expect(corrections[0].from).toBe('0');
    expect(corrections[0].to).toBe(1);
    const vhy = accepted.filter((r: any) => r.code === 'VHY');
    expect(vhy).toHaveLength(5);
    const drp = vhy.find((r: any) => r.date === '2026-07-16');
    expect(drp.quantity).toBe(1);
    expect(drp.price).toBe(82.706);
  });

  it('passes its own audit against the real workbook', () => {
    const failed = audit(
      parseTrades(readSheet1(readFileSync(WORKBOOK))),
    ).filter((c) => !c.ok);
    expect(failed).toEqual([]);
  });

  it('fails the audit when the figures do not match, so it cannot write a wrong ledger', () => {
    const parsed = parseTrades(readSheet1(readFileSync(WORKBOOK)));
    const tampered = {
      ...parsed,
      accepted: parsed.accepted.map((r: any) =>
        r.code === 'VAS' && r.date === '2021-09-28'
          ? { ...r, quantity: r.quantity - 1 }
          : r,
      ),
    };
    const failed = audit(tampered).filter((c) => !c.ok);
    expect(failed.map((c) => c.code)).toContain('VAS.units');
  });

  it('drops non-held codes without complaint', () => {
    const rows = [
      {
        Code: 'VAS',
        Date: '2026-01-01',
        Type: 'Buy',
        Qty: '1',
        Price: '1',
        Brokerage: '0',
      },
      {
        Code: 'TLS',
        Date: '2026-01-03',
        Type: 'Buy',
        Qty: '1',
        Price: '1',
        Brokerage: '0',
      },
      {
        Code: 'IVV',
        Date: '2026-01-04',
        Type: 'Buy',
        Qty: '1',
        Price: '1',
        Brokerage: '0',
      },
    ];
    const { accepted, rejected } = parseTrades(rows);
    expect(accepted.map((r: any) => r.code)).toEqual(['VAS']);
    expect(rejected).toEqual([]);
  });

  it('refuses a type it does not recognise rather than dropping it', () => {
    const rows = [
      {
        Code: 'VAS',
        Date: '2026-01-01',
        Type: 'Buy',
        Qty: '1',
        Price: '1',
        Brokerage: '0',
      },
      {
        Code: 'VAS',
        Date: '2026-01-02',
        Type: 'Split',
        Qty: '2',
        Price: '0',
        Brokerage: '0',
      },
    ];
    const { accepted, rejected } = parseTrades(rows);
    expect(accepted.map((r: any) => r.code)).toEqual(['VAS']);
    expect(rejected).toEqual([
      { row: 2, code: 'VAS', reason: 'unsupported type Split' },
    ]);
  });

  it('rejects a Sell on a held code by name, since Phase 1 cannot allocate it', () => {
    const rows = [
      {
        Code: 'VHY',
        Date: '2026-01-02',
        Type: 'Sell',
        Qty: '5',
        Price: '70',
        Brokerage: '3',
      },
    ];
    const { accepted, rejected } = parseTrades(rows);
    expect(accepted).toEqual([]);
    expect(rejected[0].reason).toMatch(/unsupported type Sell/);
  });

  it('flags a zero-quantity DRP instead of importing a zero-cost parcel', () => {
    // Not the corrected row: an uncorrected zero-quantity DRP must still be
    // refused by name rather than written as a zero-cost parcel.
    const rows = [
      {
        Code: 'VHY',
        Date: '2026-10-16',
        Type: 'Reinvestment',
        Qty: '0',
        Price: '82.706',
        Brokerage: '0',
      },
    ];
    const { accepted, rejected } = parseTrades(rows);
    expect(accepted).toEqual([]);
    expect(rejected[0].reason).toMatch(/quantity 0 is not a positive number/);
  });

  it('maps Buy and Reinvestment onto the trade side and source', () => {
    const rows = [
      {
        Code: 'VAS',
        Date: '2026-09-10',
        Type: 'Buy',
        Qty: '7',
        Price: '110',
        Brokerage: '3',
      },
      {
        Code: 'VAS',
        Date: '2026-07-16',
        Type: 'Reinvestment',
        Qty: '1',
        Price: '108.7983',
        Brokerage: '0',
      },
    ];
    const { accepted } = parseTrades(rows);
    expect(accepted.map((r: any) => r.source).sort()).toEqual([
      'drp',
      'import',
    ]);
    expect(accepted.every((r: any) => r.side === 'buy')).toBe(true);
  });
});
