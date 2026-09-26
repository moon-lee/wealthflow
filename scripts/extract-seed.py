"""One-shot extractor: reads the household 'Other Income' sheet and emits the
gitignored personal seed module `src/seed/wealth-seed.ts`.

Source:  D:/finance_flow_ai/docs/Tax Brackets_2026_2027.xlsx  (sheet 'Other Income')
Output:  src/seed/wealth-seed.ts  (gitignored — real amounts, never commit)

Layout (0-based cols):
  left  (dividends): A date | B type | C gross | D franking | E stock | F broker
  right (interest):  G-H empty | I date (text) | J Macquarie | K BOQ | L ANZ | M UBank | N total

Rules:
  - dividend rows: A is a date, E non-empty, C numeric.
  - interest rows: G is a date; months where all of H..K are None/0 are
    placeholders and skipped; per bank, None means "no record", numbers
    (including explicit 0.00) are seeded.
  - dates stay as the sheet wrote them (month-starts); monthKey drives the
    once-per-month rule, so the grid matches regardless.

Run:  python3 scripts/extract-seed.py
"""

import datetime
import pathlib
import re

import openpyxl

XLSX = pathlib.Path('D:/finance_flow_ai/docs/Tax Brackets_2026_2027.xlsx')
OUT = pathlib.Path('src/seed/wealth-seed.ts')

TYPE_MAP = {'Non Trust': 'non_trust', 'Trust(ETFs)': 'trust'}

STOCK_NAMES = {
    'VAS': 'Vanguard Australian Shares Index ETF',
    'VHY': 'Vanguard Australian Shares High Yield ETF',
    'FGX': 'Future Generation Global Investment Company',
    'NAB': 'National Australia Bank',
}

BANKS = ['Macquarie', 'BOQ', 'ANZ', 'UBank']


def iso(v):
    if isinstance(v, datetime.datetime):
        v = v.date()
    if isinstance(v, datetime.date):
        return v.isoformat()
    if isinstance(v, str):
        m = re.match(r'\s*(\d{4}-\d{2}-\d{2})', v)
        if m:
            return m.group(1)
    return None


def num(v):
    return round(float(v), 2) if isinstance(v, (int, float)) else None


def main():
    wb = openpyxl.load_workbook(XLSX, data_only=True)
    ws = wb['Other Income']

    dividends = []  # (date, type, gross, franking, code, broker)
    interest = []  # (date, bank, amount)
    seen_stocks = []
    for row in ws.iter_rows(values_only=True):
        d, typ, gross, frank, code, broker = row[0], row[1], row[2], row[3], row[4], row[5]
        day = iso(d)
        if (
            day is not None
            and isinstance(code, str)
            and code.strip()
            and isinstance(gross, (int, float))
        ):
            t = TYPE_MAP.get(str(typ).strip(), 'foreign')
            fr = num(frank) if isinstance(frank, (int, float)) else 0.0
            dividends.append((day, t, num(gross), fr, code.strip().upper(), str(broker).strip() if broker else ''))
            if code.strip().upper() not in seen_stocks:
                seen_stocks.append(code.strip().upper())
        g, vals = iso(row[8]), [num(row[i]) for i in (9, 10, 11, 12)]
        if g is not None and any(v is not None and v != 0 for v in vals):
            for bank, v in zip(BANKS, vals):
                if v is not None:
                    interest.append((g, bank, v))

    lines = []
    w = lines.append
    w('// PERSONAL DATA — gitignored (see .gitignore `src/seed/`). Never commit this file.')
    w('// Extracted from docs/Tax Brackets_2026_2027.xlsx sheet `Other Income` via scripts/extract-seed.py.')
    w('// Fill the TODO placeholders (account numbers, BSBs, share counts), then run in dev console:')
    w("//   const m = await import('/src/seed/wealth-seed.ts');")
    w('//   await m.seedWealthflow((window as any).__finance);')
    w("// Seeding is idempotent — re-running skips existing banks / stocks / bank-months / receipts.")
    w("import type { FinanceApi } from 'finance';")
    w("import { createBank, listBanks } from '../dao/banks.js';")
    w("import { createStock, listStocks } from '../dao/stocks.js';")
    w("import { createInterestEntry, listInterestEntries } from '../dao/interest-entries.js';")
    w("import { createDividend, listDividends } from '../dao/dividends.js';")
    w("import { monthKey } from '../utils/finance-year.js';")
    w('')
    w('export interface SeedBank { name: string; bsb: string | null; account_number: string; notes: string | null }')
    w('export const SEED_BANKS: SeedBank[] = [')
    for b in BANKS:
        w(f"  {{ name: '{b}', bsb: null, account_number: '00000000', notes: 'TODO: real BSB + account number' }},")
    w('];')
    w('')
    w('export interface SeedStock { code: string; name: string; shares: number; notes: string | null }')
    w('export const SEED_STOCKS: SeedStock[] = [')
    for code in seen_stocks:
        w(f"  {{ code: '{code}', name: '{STOCK_NAMES.get(code, code)}', shares: 0, notes: 'TODO: current share count' }},")
    w('];')
    w('')
    w('export interface SeedInterest { bank: string; date: string; amount: number }')
    w('export const SEED_INTEREST: SeedInterest[] = [')
    for d, b, v in interest:
        w(f"  {{ bank: '{b}', date: '{d}', amount: {v} }},")
    w('];')
    w('')
    w('export interface SeedDividend { code: string; date: string; type: string; gross: number; franking: number; notes: string | null }')
    w('export const SEED_DIVIDENDS: SeedDividend[] = [')
    for d, t, g, fr, code, broker in dividends:
        notes = f"'Broker: {broker}'" if broker and broker.upper() != 'NONE' else 'null'
        notes = notes.replace('MACQURIE', 'Macquarie')
        w(f"  {{ code: '{code}', date: '{d}', type: '{t}', gross: {g}, franking: {fr}, notes: {notes} }},")
    w('];')
    w('')
    w('export async function seedWealthflow(finance: FinanceApi): Promise<Record<string, number>> {')
    w('  const done: Record<string, number> = { banks: 0, stocks: 0, interest: 0, dividends: 0, skipped: 0 };')
    w('  const skip = () => { done.skipped += 1; };')
    w('  for (const b of SEED_BANKS) {')
    w('    const existing = await listBanks(finance, { status: \'all\' });')
    w('    if (existing.some((r) => r.name.toLowerCase() === b.name.toLowerCase())) { skip(); continue; }')
    w('    await createBank(finance, b);')
    w('    done.banks += 1;')
    w('  }')
    w('  for (const s of SEED_STOCKS) {')
    w('    const existing = await listStocks(finance, { status: \'all\' });')
    w('    if (existing.some((r) => r.code.toUpperCase() === s.code.toUpperCase())) { skip(); continue; }')
    w('    await createStock(finance, s);')
    w('    done.stocks += 1;')
    w('  }')
    w('  const banks = await listBanks(finance, { status: \'all\' });')
    w('  const stocks = await listStocks(finance, { status: \'all\' });')
    w('  const bankId = (name: string) => banks.find((b) => b.name === name)!.id;')
    w('  const stockId = (code: string) => stocks.find((s) => s.code === code)!.id;')
    w('  for (const e of SEED_INTEREST) {')
    w('    const rows = await listInterestEntries(finance, { bankId: bankId(e.bank) });')
    w('    if (rows.some((r) => monthKey(r.date) === monthKey(e.date))) { skip(); continue; }')
    w('    await createInterestEntry(finance, { bank_id: bankId(e.bank), date: e.date, amount: e.amount }, \'07-01\');')
    w('    done.interest += 1;')
    w('  }')
    w('  for (const e of SEED_DIVIDENDS) {')
    w('    const rows = await listDividends(finance, { stockId: stockId(e.code) });')
    w('    if (rows.some((r) => r.date === e.date && Number(r.gross) === e.gross)) { skip(); continue; }')
    w('    await createDividend(finance, { stock_id: stockId(e.code), date: e.date, type: e.type, gross: e.gross, franking: e.franking, notes: e.notes }, \'07-01\');')
    w('    done.dividends += 1;')
    w('  }')
    w("  console.log('[wealthflow seed]', done);")
    w('  return done;')
    w('}')
    w('')
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text('\n'.join(lines), encoding='utf-8')
    print(f'wrote {OUT}: {len(BANKS)} banks, {len(seen_stocks)} stocks, {len(interest)} interest, {len(dividends)} dividends')


if __name__ == '__main__':
    main()
