# Trades & Parcels Implementation Plan (Phase 1 of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record buy trades, derive a parcel ledger from them, and show both — so a holding's cost base and discount position can be seen at all.

**Architecture:** `wealthflow_trades` is the single source of truth and is never derived. `wealthflow_parcels` is a rebuildable cache keyed on `(stock_id, origin_trade_id)`; nothing in the UI writes to it. `wealthflow_stocks.shares` becomes a derived total written by the rebuild. One-off import from the ShareSight workbook seeds the real history.

**Tech Stack:** TypeScript, Lit 3, vitest + happy-dom, the host `finance.db.table()` API (single-row insert/update/delete only — **no transactions, no batch**).

**Spec:** `docs/superpowers/specs/2026-10-16-wealthflow-trades-cgt-drp-design.md` — read §4, §5, §6.1, §6.3, §7.1, §7.2, §7.4, §8, §10 before starting.

**Source data:** `docs/AllTradesReport.xlsx` is authoritative. `docs/Vanguard Australian Shares Index Etf.md`, `docs/Vanguard Australian Shares High Yield Etf.md` and `docs/Future Gen Aust.md` hold the reconciled per-holding figures this plan is verified against.

## Phasing

This is **Plan 1 of 5**, matching spec §4. Out of scope here, deliberately:

| Deferred | Lands in |
| --- | --- |
| Sells, FIFO allocation preview, edit-replay-and-refuse | Plan 2 |
| `wealthflow_disposals`, `wealthflow_capital_losses`, CGT service, Overview's Capital gains section | Plan 2 |
| DRP fields on the dividend form, coupled write | Plan 3 |
| `wealthflow_cost_base_adjustments`, pro-rata application | Plan 4 |
| `getCapitalGainsSummary` consumer (Tax extension) | Plan 5 |

**Phase 1 ships a Buy-only form.** Do not add a Buy/Sell toggle. A sell recorded without the allocation machinery would leave `shares` derived from an un-reduced parcel total, which is wrong — so the Sell side waits for Plan 2.

## Global Constraints

- Table names start `wealthflow_` and match `^[a-z][a-z0-9_]*$` (`manifest-schema.ts:177`).
- **`CREATE TABLE IF NOT EXISTS` never migrates an existing table** (`docs/seed-import.md`). Declare every column the whole feature will ever need, now — including `wealthflow_trades.dividend_id`, which Plan 3 uses and Phase 1 does not.
- `import type { FinanceApi } from 'finance'` — type-only, never bundled.
- Bundle under 200KB (`sdk-build.test.ts` enforces this).
- Bump `version` and `financeExtension.version` by `+0.0.1` in both fields before every `build`. Never reset.
- Every command in `contributions.commands[]` must also be in `allowedCommands[]`; every `CustomEvent` name dispatched must be in `allowedUiEvents[]` — an unlisted one is **silently dropped**.
- Service params cross the RPC boundary as an **array** — the host spreads them positionally, so a bare string arrives one character per argument.
- Service methods are **named closures**, never `this.`-bound: cross-extension `invoke` dispatches unbound.
- Run prettier before every commit:
  `npx prettier --check --single-quote "src/main.ts" "src/dao/**/*.ts" "src/services/**/*.ts" "src/ui/**/*.ts" "src/utils/**/*.ts" "src/mock/**/*.ts" "src/shared/**/*.ts" "scripts/**/*.mjs" "vite.config.ts" "index.html"`
- Never edit `src/finance.d.ts`, `src/vite-env.d.ts`, `src/vendor/**`, `src/styles/**` — `refresh` overwrites them.
- **Never assert on the return value of `db.table().update()` or `.delete()`.** `src/mock/finance-mock.ts:40` returns `{ affected: n }`; `src/dao/stocks.ts:81` declares `Promise<number>`. Asserting there tests the mock, not the code.

## Testing the UI — happy-dom's limits

DOM tests run on happy-dom via a `// @vitest-environment happy-dom` docblock on **line 1** of the test file. Without it there is no `document`, and the file fails for a reason unrelated to the feature. This project has already been bitten by the following, so the workarounds below are mandatory:

| happy-dom drops / does not do | Assert on this instead |
| --- | --- |
| `thead`, `tfoot` and `tbody` from a shadow root | the element's own ordered-rows property — see `dividend-log.sortedEntries` |
| conditional `tbody` branches | the same |
| a submit button's `form=""` association | call `onSubmit(new Event('submit'))` (`overview.test.ts:1324`), or dispatch `submit` on the `<form>` element (`forms-fy.test.ts:35`) |
| two-way binding on a bare `.value =` | set `.value`, then `dispatchEvent(new Event('input', { bubbles: true }))`, then `await el.updateComplete` |

Two more conventions, both from the existing suite: import the element for its **side effect** (`import '../src/ui/trade-log.js'`) rather than importing a class, and **`document.body.appendChild(el)` before `await el.updateComplete`**, with `el.remove()` at the end of the test.

Consequence for this plan: every new log or ledger element **must expose its ordered rows as a public property**, because the DOM cannot be relied on to render them. `trade-log` exposes `sortedTrades`; `parcel-ledger` exposes `groups` and `expandedParcels`.

## Review Focus

Four conditions a reasonable person would expect to work, which no task's tests exercise on its own. Each has its test pinned to the owning task below.

1. **A holding with no trades shows "not yet tracked", not `0` units.** After this ships, every existing holding derives to zero until the import runs. A bare `0` reads as data loss. → Task 6.
2. **Two buys on the same date produce two parcels, never one.** Same-day aggregation is legal but is not this system's job; silent merging would lose a distinct cost basis. → Task 3.
3. **A fractional quantity survives into the ledger.** VHY's 16 Jul 2026 DRP bought *0 units* for $12.44 — the true figure is ≈0.1504. `quantity` is `REAL` and the ledger must format 0.1504 without rounding it to 0. → Task 6.
4. **A rebuild is idempotent and discards hand-edited parcels.** Running it twice yields byte-identical rows. → Task 3.

---

### Task 1: Manifest — tables, command, navigation, events

**Files:**
- Modify: `package.json` (add two tables, one command, one nav item, four events; bump version to `0.3.0` in both fields)
- Modify: `tests/manifest.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `wealthflow_trades` and `wealthflow_parcels` tables exist; `wealthflow.show-trades` is a registered command id; nav label `Trades` in group `Wealth`; events `trade-create`, `trade-edit`, `trade-delete`, `trade-edit-request` are allowlisted.

- [ ] **Step 1: Write the failing manifest tests**

In `tests/manifest.test.ts`, replace the hard-coded 6-command / 5-table assertions:

```ts
it('declares single view, 7 commands, 7 tables', () => {
  expect(fe.contributions.commands.map((c: any) => c.id).sort()).toEqual(
    ['wealthflow.add-dividend','wealthflow.add-interest','wealthflow.refresh',
     'wealthflow.show-banks','wealthflow.show-overview','wealthflow.show-stocks',
     'wealthflow.show-trades'].sort());
  expect(fe.tables.map((t: any) => t.name).sort()).toEqual(
    ['wealthflow_banks','wealthflow_dividends','wealthflow_interest_entries',
     'wealthflow_parcels','wealthflow_stocks','wealthflow_super_entries',
     'wealthflow_trades'].sort());
});

it('declares wealthflow_trades with the full Phase 1-3 column set', () => {
  const fe: any = (pkg as any).financeExtension;
  const t = fe.tables.find((x: any) => x.name === 'wealthflow_trades');
  expect(t.columns.map((c: any) => c.name).sort()).toEqual(
    ['brokerage','date','dividend_id','notes','price','quantity','side','source','stock_id'].sort());
  expect(t.columns.find((c: any) => c.name === 'quantity').type).toBe('real');
  expect(t.columns.find((c: any) => c.name === 'price').type).toBe('real');
});

it('declares wealthflow_parcels keyed on origin_trade_id with no eligibility column', () => {
  const fe: any = (pkg as any).financeExtension;
  const t = fe.tables.find((x: any) => x.name === 'wealthflow_parcels');
  expect(t.columns.map((c: any) => c.name).sort()).toEqual(
    ['acquired_date','brokerage','origin_trade_id','price','quantity','stock_id'].sort());
  expect(t.columns.find((c: any) => c.name === 'quantity').type).toBe('real');
});
```

Add to the navigation test: `Trades` / `wealthflow.show-trades` after `Stocks`, and nav id `wealthflow-trades`. Add an events assertion covering all four `trade-*` names.

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tests/manifest.test.ts`
Expected: FAIL — 7 tables expected, 5 present.

- [ ] **Step 3: Add the two tables to `package.json`**

Append to `financeExtension.tables`:

```json
{ "name": "wealthflow_trades", "columns": [
  { "name": "stock_id", "type": "integer", "nullable": false },
  { "name": "date", "type": "date", "nullable": false },
  { "name": "side", "type": "text", "nullable": false, "enumOptions": ["buy","sell"] },
  { "name": "quantity", "type": "real", "nullable": false, "min": 0 },
  { "name": "price", "type": "real", "nullable": false, "min": 0 },
  { "name": "brokerage", "type": "real", "nullable": false, "default": 0, "min": 0 },
  { "name": "source", "type": "text", "nullable": false, "default": "manual",
    "enumOptions": ["manual","drp","import"] },
  { "name": "dividend_id", "type": "integer", "nullable": true },
  { "name": "notes", "type": "text", "nullable": true } ] },
{ "name": "wealthflow_parcels", "columns": [
  { "name": "stock_id", "type": "integer", "nullable": false },
  { "name": "origin_trade_id", "type": "integer", "nullable": false },
  { "name": "acquired_date", "type": "date", "nullable": false },
  { "name": "quantity", "type": "real", "nullable": false, "min": 0 },
  { "name": "price", "type": "real", "nullable": false, "min": 0 },
  { "name": "brokerage", "type": "real", "nullable": false, "default": 0, "min": 0 } ] }
```

`dividend_id` is unused until Plan 3 and is declared now because the app cannot migrate a table later.

- [ ] **Step 4: Add the command, nav item, and events**

Command `{ "id": "wealthflow.show-trades", "title": "Wealth Flow: Show Trades" }`; add to `allowedCommands`. Navigation `{ "id": "wealthflow-trades", "label": "Trades", "command": "wealthflow.show-trades", "group": "Wealth" }` inserted **after** the Stocks item. Append `trade-create`, `trade-edit`, `trade-delete`, `trade-edit-request` to `allowedUiEvents`.

- [ ] **Step 5: Bump the version**

Set both `version` and `financeExtension.version` to **`0.2.4`** — a patch bump, per the Global Constraints and `AGENTS.md` §9. Not `0.3.0`: a new table is not a minor release here, and the installer's downgrade check compares these fields.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json tests/manifest.test.ts
git commit -m "feat: declare trades and parcels tables with the show-trades command"
```

---

### Task 2: Trade DAO

**Files:**
- Create: `src/dao/trades.ts`
- Test: `tests/trades.test.ts`

**Interfaces:**
- Consumes: the `wealthflow_trades` table from Task 1.
- Produces:
  ```ts
  export interface Trade {
    readonly id: number; readonly stock_id: number; readonly date: string;
    readonly side: 'buy' | 'sell'; readonly quantity: number; readonly price: number;
    readonly brokerage: number; readonly source: 'manual' | 'drp' | 'import';
    readonly dividend_id: number | null; readonly notes: string | null;
  }
  export type TradeInput = {
    stock_id: number; date: string; side: 'buy' | 'sell';
    quantity: number; price: number; brokerage?: number;
    source?: 'manual' | 'drp' | 'import'; dividend_id?: number | null; notes?: string | null;
  };
  export class TradeValidationError extends Error { readonly code = -32015 }
  export function createTrade(f: FinanceApi, i: TradeInput): Promise<Trade>;
  export function listTrades(f: FinanceApi, o?: { stockId?: number; from?: string; to?: string }): Promise<Trade[]>;
  export function updateTrade(f: FinanceApi, id: number, patch: Partial<TradeInput>): Promise<void>;
  export function deleteTrade(f: FinanceApi, id: number): Promise<void>;
  ```
  `listTrades` returns **date DESC** — newest first, because that is the order a log is read in and because a newly saved trade must land at the top.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { createMockFinance } from '../src/mock/finance-mock.js';
import { createTrade, listTrades, deleteTrade, updateTrade } from '../src/dao/trades.js';

const buy = (over: any = {}) => ({
  stock_id: 1, date: '2025-10-16', side: 'buy' as const,
  quantity: 2, price: 108.8611, ...over,
});

describe('trades dao', () => {
  it('stores 4dp prices and fractional quantities without rounding', async () => {
    const f: any = createMockFinance();
    const t: any = await createTrade(f, buy({ quantity: 0.1504, price: 82.7065 }));
    expect(t.price).toBe(82.7065);
    expect(t.quantity).toBe(0.1504);
  });

  it('defaults brokerage to 0 and source to manual', async () => {
    const f: any = createMockFinance();
    const t: any = await createTrade(f, buy());
    expect(t.brokerage).toBe(0);
    expect(t.source).toBe('manual');
    expect(t.dividend_id).toBeNull();
  });

  it('rejects a zero or negative quantity', async () => {
    const f: any = createMockFinance();
    await expect(createTrade(f, buy({ quantity: 0 }))).rejects.toThrow(/quantity/i);
    await expect(createTrade(f, buy({ quantity: -1 }))).rejects.toThrow(/quantity/i);
  });

  it('rejects a malformed date and a negative price', async () => {
    const f: any = createMockFinance();
    await expect(createTrade(f, buy({ date: '16/10/2025' }))).rejects.toThrow(/date/i);
    await expect(createTrade(f, buy({ price: -1 }))).rejects.toThrow(/price/i);
  });

  it('filters by stockId and date range, newest first', async () => {
    const f: any = createMockFinance();
    await createTrade(f, buy({ date: '2023-09-22', quantity: 10, price: 87.48 }));
    await createTrade(f, buy({ date: '2026-09-10', quantity: 7, price: 110 }));
    await createTrade(f, buy({ stock_id: 2, date: '2025-01-01', quantity: 1, price: 5 }));
    expect((await listTrades(f)).map((t: any) => t.date))
      .toEqual(['2026-09-10', '2025-01-01', '2023-09-22']);
    expect((await listTrades(f, { stockId: 2 }))).toHaveLength(1);
    expect((await listTrades(f, { from: '2024-01-01' }))).toHaveLength(2);
  });

  it('updates and deletes by id', async () => {
    const f: any = createMockFinance();
    const t: any = await createTrade(f, buy());
    await updateTrade(f, t.id, { price: 120 });
    expect((await listTrades(f))[0]!.price).toBe(120);
    await deleteTrade(f, t.id);
    expect(await listTrades(f)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tests/trades.test.ts`
Expected: FAIL — cannot resolve `../src/dao/trades.js`.

- [ ] **Step 3: Implement `src/dao/trades.ts`**

Follow `src/dao/stocks.ts` exactly: `TABLE` const, `createX`/`listX`/`updateX`/`setXActive` naming, `finance.db.table(TABLE).find(q)` cast `as unknown as Trade[]`, `code = -32015` on the error class.

Validation, in order, first failure thrown: `stock_id` finite positive; `date` matches `isValidIsoDate` from `../utils/finance-year.js`; `side` is `buy` or `sell`; `quantity` finite and `> 0`; `price` finite and `> 0`; `brokerage` finite and `>= 0` when supplied.

`listTrades` filters in memory after `find({})` — the mock's `find` does strict equality only, so range filtering cannot be pushed down. Sort by `date` descending, then `id` descending as the tiebreak.

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- tests/trades.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/dao/trades.ts tests/trades.test.ts
git commit -m "feat: trades dao with 4dp prices and fractional quantities"
```

---

### Task 3: Parcel rebuild, derived shares, discount eligibility

**Files:**
- Create: `src/utils/dates.ts`
- Create: `src/dao/parcels.ts`
- Create: `src/services/parcel-service.ts`
- Test: `tests/parcel-service.test.ts`

**Interfaces:**
- Consumes: `listTrades`, `createStock`, `listStocks`, `updateStock` from Tasks 1–2.
- Produces:
  ```ts
  // src/utils/dates.ts
  export function addMonths(iso: string, months: number): string;

  // src/dao/parcels.ts
  export interface Parcel {
    readonly id: number; readonly stock_id: number; readonly origin_trade_id: number;
    readonly acquired_date: string; readonly quantity: number;
    readonly price: number; readonly brokerage: number;
  }
  export function listParcels(f: FinanceApi, o?: { stockId?: number }): Promise<Parcel[]>;
  export function replaceParcels(f: FinanceApi, stockId: number, rows: ParcelSeed[]): Promise<void>;
  export type ParcelSeed = Omit<Parcel, 'id'>;

  // src/services/parcel-service.ts
  export function parcelCostBase(t: { quantity: number; price: number; brokerage: number }): number;
  export function isDiscountEligible(acquiredDate: string, asOf: string): boolean;
  export function monthsHeld(acquiredDate: string, asOf: string): number;
  export function rebuildParcels(f: FinanceApi, stockId: number): Promise<Parcel[]>;
  export function rebuildAllParcels(f: FinanceApi): Promise<void>;
  export function derivedShares(f: FinanceApi): Promise<Map<number, number>>;
  export interface ParcelGroup {
    stockId: number; stockCode: string; stockName: string;
    units: number; parcelCount: number; avgCost: number;
    eligibleUnits: number; notTracked: boolean;
  }
  export function groupParcels(
    stocks: { id: number; stock_code: string; stock_full_name: string }[],
    parcels: Parcel[], asOf: string,
  ): ParcelGroup[];
  ```

- [ ] **Step 1: Write the failing tests**

Pin the real VAS fixture — these are the numbers that prove the calendar-month rule, not an approximation of it.

```ts
describe('addMonths', () => {
  it('adds calendar months and clamps to the target month length', () => {
    expect(addMonths('2025-10-16', 12)).toBe('2026-10-16');
    expect(addMonths('2024-08-31', 12)).toBe('2025-08-31');
    expect(addMonths('2024-02-29', 12)).toBe('2025-02-28');   // 2025 is not a leap year
    expect(addMonths('2024-02-29', 48)).toBe('2028-02-29');
  });
});

describe('isDiscountEligible', () => {
  const ASOF = '2026-10-16';
  it('is true on the 12-month anniversary itself', () => {
    expect(isDiscountEligible('2025-10-16', ASOF)).toBe(true);
  });
  it('is false one day short and true one day over', () => {
    expect(isDiscountEligible('2025-10-17', ASOF)).toBe(false);
    expect(isDiscountEligible('2025-10-15', ASOF)).toBe(true);
  });
  it('matches the reconciled VAS position: 154 of 165 units eligible', () => {
    const notYet = ['2026-01-19','2026-04-20','2026-07-16','2026-09-10','2026-10-16'];
    expect(notYet.every((d) => !isDiscountEligible(d, ASOF))).toBe(true);
    expect(isDiscountEligible('2026-09-09', ASOF)).toBe(true);
  });
});

describe('parcelCostBase', () => {
  it('is quantity x price + brokerage, spread across the parcel', () => {
    expect(parcelCostBase({ quantity: 7, price: 110, brokerage: 3 })).toBe(773);
    expect(parcelCostBase({ quantity: 1, price: 108.8611, brokerage: 0 })).toBe(108.8611);
  });
});

describe('rebuildParcels', () => {
  it('derives exactly one parcel per buy trade and writes derived shares', async () => {
    const f: any = createMockFinance();
    const vas: any = await createStock(f, { stock_code: 'VAS', stock_full_name: 'Vanguard', shares: 164 });
    await createTrade(f, { stock_id: vas.id, date: '2021-09-28', side: 'buy', quantity: 11, price: 94.93, brokerage: 9.5 });
    await createTrade(f, { stock_id: vas.id, date: '2026-09-10', side: 'buy', quantity: 7, price: 110, brokerage: 3 });
    const parcels = await rebuildParcels(f, vas.id);
    expect(parcels).toHaveLength(2);
    expect(await derivedShares(f)).toEqual(new Map([[vas.id, 18]]));
    const s: any = (await listStocks(f, { status: 'all' }))[0];
    expect(s.shares).toBe(18);
  });

  it('keeps two buys on the same date as two distinct parcels', async () => {
    const f: any = createMockFinance();
    const vas: any = await createStock(f, { stock_code: 'VAS', stock_full_name: 'V', shares: 0 });
    await createTrade(f, { stock_id: vas.id, date: '2022-09-23', side: 'buy', quantity: 5, price: 83.3, brokerage: 3 });
    await createTrade(f, { stock_id: vas.id, date: '2022-09-23', side: 'buy', quantity: 4, price: 84.8, brokerage: 3 });
    const parcels = await rebuildParcels(f, vas.id);
    expect(parcels).toHaveLength(2);
    expect(new Set(parcels.map((p) => p.id)).size).toBe(2);
    expect(new Set(parcels.map((p) => p.origin_trade_id)).size).toBe(2);
  });

  it('is idempotent: a second rebuild yields identical rows', async () => {
    const f: any = createMockFinance();
    const vas: any = await createStock(f, { stock_code: 'VAS', stock_full_name: 'V', shares: 0 });
    await createTrade(f, { stock_id: vas.id, date: '2025-01-17', side: 'buy', quantity: 2, price: 100.7245, source: 'drp' });
    await rebuildParcels(f, vas.id);
    const first = await listParcels(f, { stockId: vas.id });
    await rebuildParcels(f, vas.id);
    expect(await listParcels(f, { stockId: vas.id })).toEqual(first);
  });

  it('discards hand-edited parcels on rebuild', async () => {
    const f: any = createMockFinance();
    const vas: any = await createStock(f, { stock_code: 'VAS', stock_full_name: 'V', shares: 0 });
    await createTrade(f, { stock_id: vas.id, date: '2025-01-17', side: 'buy', quantity: 2, price: 100.72 });
    await rebuildParcels(f, vas.id);
    await replaceParcels(f, vas.id, [{ stock_id: vas.id, origin_trade_id: 999, acquired_date: '2020-01-01', quantity: 9, price: 1, brokerage: 0 }]);
    await rebuildParcels(f, vas.id);
    expect((await listParcels(f, { stockId: vas.id }))[0]!.acquired_date).toBe('2025-01-17');
  });

  it('reports 0 units and notTracked for a holding with no trades', async () => {
    const f: any = createMockFinance();
    const vhy: any = await createStock(f, { stock_code: 'VHY', stock_full_name: 'V', shares: 22 });
    await rebuildParcels(f, vhy.id);
    const [g] = groupParcels(await listStocks(f, { status: 'all' }), await listParcels(f), '2026-10-16');
    expect(g.notTracked).toBe(true);
    expect(g.units).toBe(0);
  });

  it('groups VAS to 165 units, 32 parcels, 154 eligible at 2026-10-16', async () => {
    // Seeded from the reconciled fixture in the source docs, not invented here.
    const f: any = createMockFinance();
    const vas: any = await createStock(f, { stock_code: 'VAS', stock_full_name: 'V', shares: 165 });
    for (const [q, p] of VAS_FIXTURE) await createTrade(f, { stock_id: vas.id, date: p.date, side: 'buy', quantity: q, price: p.price, brokerage: p.brokerage });
    const [g] = groupParcels(await listStocks(f, { status: 'all' }), await listParcels(f), '2026-10-16');
    expect(g.units).toBe(165);
    expect(g.parcelCount).toBe(32);
    expect(g.eligibleUnits).toBe(154);
    expect(g.notTracked).toBe(false);
  });
});
```

Define `VAS_FIXTURE` in the test file as the 32 `[quantity, { date, price, brokerage }]` rows transcribed from the Buys and Reinvestments tables in `docs/Vanguard Australian Shares Index Etf.md`. Assert the transcription itself before asserting anything computed from it:

```ts
it('transcribes the VAS fixture without a typo', () => {
  expect(VAS_FIXTURE).toHaveLength(32);
  expect(VAS_FIXTURE.reduce((s, [q]) => s + q, 0)).toBe(165);
  const cb = VAS_FIXTURE.reduce((s, [q, p]) => s + q * p.price + p.brokerage, 0);
  expect(Math.round(cb * 100) / 100).toBe(15238.16);
});
```

A mistyped price in the fixture must fail here, not silently weaken the group assertion below.

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tests/parcel-service.test.ts`
Expected: FAIL — cannot resolve `../src/services/parcel-service.js`.

- [ ] **Step 3: Implement `src/utils/dates.ts`**

`addMonths(iso, months)`: parse `YYYY-MM-DD`, add `months` to the month index, clamp the day to that month's length with `Date.UTC(y, m, 0).getUTCDate()` — the same technique `monthEnd` in `src/utils/finance-year.ts:55` already uses. Return zero-padded `YYYY-MM-DD`.

- [ ] **Step 4: Implement `src/dao/parcels.ts`**

`listParcels` sorts `acquired_date` **ascending** — FIFO consumes oldest first, so the ledger's order is the allocation order.

`replaceParcels` deletes every row for `stockId` then inserts each seed in turn. The host API has no batch insert and no transaction, so this is a loop; it is not atomic, which is why `rebuildParcels` recomputes from trades rather than trusting the table.

- [ ] **Step 5: Implement `src/services/parcel-service.ts`**

`parcelCostBase` rounds to 4dp: `Math.round(n * 10000) / 10000`.

`isDiscountEligible(acquired, asOf)` is `asOf >= addMonths(acquired, 12)`, string comparison valid for ISO dates. **Never a stored column** — spec §4 requires it computed on read, because a parcel crosses its own line without any write.

`rebuildParcels(f, stockId)` selects that stock's `buy` trades, maps each to a seed `{ stock_id, origin_trade_id: trade.id, acquired_date: trade.date, quantity, price, brokerage }`, calls `replaceParcels`, then writes the summed quantity back to `wealthflow_stocks.shares` via `updateStock`. `side: 'sell'` trades are ignored in Phase 1 — Plan 2 reduces parcel quantities instead.

`derivedShares` returns `Map<stockId, units>` from `listParcels`.

`groupParcels` returns one group per stock, including stocks with no parcels (`units: 0, parcelCount: 0, notTracked: true`). `avgCost` is `totalCostBase / units`, or `0` when `units` is `0` — never `NaN`. `eligibleUnits` sums quantities where `isDiscountEligible`.

- [ ] **Step 6: Run to verify it passes**

Run: `npm test -- tests/parcel-service.test.ts`
Expected: PASS.

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: PASS. `stocks.test.ts` must still pass — it asserts `createStock` rejects negative shares, and `shares` is still writable at create time.

- [ ] **Step 8: Commit**

```bash
git add src/utils/dates.ts src/dao/parcels.ts src/services/parcel-service.ts tests/parcel-service.test.ts
git commit -m "feat: parcel rebuild, derived shares, and calendar-month discount eligibility"
```

---

### Task 4: ShareSight importer

**Files:**
- Create: `scripts/xlsx-read.mjs`
- Create: `scripts/import-sharesight.mjs`
- Test: `tests/import-sharesight.test.ts`

**Interfaces:**
- Consumes: `docs/AllTradesReport.xlsx`; `wealthflow_stocks`, `wealthflow_trades`, `wealthflow_parcels` from Tasks 1–3.
- Produces:
  ```js
  // scripts/xlsx-read.mjs
  export function readSheet1(buffer: Buffer): { rows: Array<Record<string,string>> };
  // scripts/import-sharesight.mjs
  export const HELD_CODES = ['VAS', 'VHY', 'FGX'];
  export const EXPECTED = {
    VAS: { rows: 32, units: 165, costBase: 15238.16 },
    VHY: { rows:  5, units:  22, costBase:  1541.17 },
    FGX: { rows:  9, units: 1109, costBase: 1284.08 },
  };
  export function parseTrades(rows: Array<Record<string,string>>): {
    accepted: TradeRow[]; rejected: Array<{ row: number; reason: string }>;
  };
  export function audit(parsed): Array<{ code: string; detail: string; ok: boolean }>;
  ```

- [ ] **Step 1: Write the failing tests**

```ts
describe('import-sharesight', () => {
  it('parses every held holding and matches the reconciled figures', () => {
    const rows = readSheet1(readFileSync('docs/AllTradesReport.xlsx'));
    const { accepted, rejected } = parseTrades(rows);
    expect(rejected).toEqual([]);
    for (const code of HELD_CODES) {
      const mine = accepted.filter((r) => r.code === code);
      expect(mine.length, code).toBe(EXPECTED[code].rows);
      expect(mine.reduce((s, r) => s + r.quantity, 0), code).toBe(EXPECTED[code].units);
      const cb = mine.reduce((s, r) => s + r.quantity * r.price + r.brokerage, 0);
      expect(Math.round(cb * 100) / 100, code).toBe(EXPECTED[code].costBase);
    }
  });

  it('keeps 4dp prices and never rounds quantity', () => {
    const { accepted } = parseTrades(readSheet1(readFileSync('docs/AllTradesReport.xlsx')));
    const drp = accepted.find((r) => r.date === '2026-10-16' && r.code === 'VAS');
    expect(drp.price).toBe(108.8611);
  });

  it('refuses a Buy and Sell row it does not recognise rather than dropping it', () => {
    const rows = [
      { Code: 'VAS', Date: '2026-01-01', Type: 'Buy', Qty: '1', Price: '1', Brokerage: '0' },
      { Code: 'VAS', Date: '2026-01-02', Type: 'Split', Qty: '2', Price: '0', Brokerage: '0' },
      { Code: 'TLS',  Date: '2026-01-03', Type: 'Buy', Qty: '1', Price: '1', Brokerage: '0' },
    ];
    const { accepted, rejected } = parseTrades(rows);
    expect(accepted.map((r) => r.code)).toEqual(['VAS']);
    expect(rejected).toEqual([{ row: 2, reason: /unsupported type Split/i }]);
  });

  it('fails the audit when the figures do not match, so it cannot write a wrong ledger', () => {
    const bad = { VAS: { rows: 32, units: 164, costBase: 15238.16 }, VHY: EXPECTED.VHY, FGX: EXPECTED.FGX };
    expect(audit({ VAS: { rows: 32, units: 164, costBase: 15238.16 } }).some((a) => !a.ok)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tests/import-sharesight.test.ts`
Expected: FAIL — cannot resolve the script modules.

- [ ] **Step 3: Implement `scripts/xlsx-read.mjs`**

Zero dependencies. An xlsx is a ZIP: parse the End Of Central Directory record, walk the central directory to `xl/sharedStrings.xml` and `xl/worksheets/sheet1.xml`, `inflateRawSync` each (`node:zlib`), then extract `<si>` text and `<c>` cells by `r` attribute.

**Do not use regex over raw XML for the shared strings alone** — a string may be split across multiple `<r><t>` runs and must have its runs concatenated in order. Resolve `<v>` indices through the string table only where `t="s"`.

- [ ] **Step 4: Implement `scripts/import-sharesight.mjs`**

`parseTrades` keeps a row only when `Code` is in `HELD_CODES` **and** `Type` is `Buy` or `Reinvestment`. Every other held row goes to `rejected` with its spreadsheet row number and the reason — spec §8 requires refusing by name, never skipping silently. Non-held codes are dropped without complaint.

`Reinvestment` maps to `side: 'buy'`, `source: 'drp'`, `brokerage: 0`. `Buy` maps to `side: 'buy'`, `source: 'import'`.

`audit` compares per-holding row count, unit total and cost base against `EXPECTED`, each rounded to 2dp. **Any failed audit must abort before the first write.** Re-run safety: every insert is guarded by a `NOT EXISTS`-equivalent check on `(stock_id, date, side, quantity)`, so a second run inserts nothing and reports zero.

Follow `scripts/apply-seed.mjs` for the run harness: resolve the database with `scripts/db-target.mjs`, refuse to guess when more than one candidate exists, print row counts and audit results, exit non-zero on failure.

- [ ] **Step 5: Run to verify it passes**

Run: `npm test -- tests/import-sharesight.test.ts`
Expected: PASS, 4 tests. The `Split` rejection is the path that proves the importer never silently drops a row.

- [ ] **Step 6: Commit**

```bash
git add scripts/xlsx-read.mjs scripts/import-sharesight.mjs tests/import-sharesight.test.ts
git commit -m "feat: ShareSight workbook importer with refusing-by-name audits"
```

---

### Task 5: Trades UI — segment host, buy form, log

**Files:**
- Create: `src/ui/trades-view.ts`
- Create: `src/ui/trade-form.ts`
- Create: `src/ui/trade-log.ts`
- Test: `tests/trades-view.test.ts`

**Interfaces:**
- Consumes: `createTrade`, `listTrades`, `deleteTrade`, `createStock`, `listStocks` from Tasks 2–3; `formatAUD` from `../utils/format.js`.
- Produces:
  ```ts
  // all three elements
  finance: any; fy: string; error: string;
  setFinance(f: any): Promise<void>;   // loads then renders
  // trades-view
  segment: 'trades' | 'parcels';
  // trade-form
  stocks: { id: number; stock_code: string; stock_full_name: string }[];
  editTrade(t: Trade | null): void;
  // trade-log
  rowCount: number;
  sortedTrades: Trade[];      // date DESC, then id DESC — happy-dom drops tbody
  sortDesc: boolean;
  sortByDate(): void;
  reload(): Promise<void>;
  ```
  Both elements are registered as `trades-view`, `trade-form`, `trade-log` in `src/ui/index.ts`, each guarded by `customElements.get(...)` as the existing entries are.

- [ ] **Step 1: Write the failing tests**

```ts
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { createMockFinance } from '../src/mock/finance-mock.js';
import { createStock } from '../src/dao/stocks.js';
import { createTrade } from '../src/dao/trades.js';
import '../src/ui/trade-log.js';
import '../src/ui/trade-form.js';

describe('trades ui', () => {
  it('orders trades newest first and exposes them for assertion', async () => {
    const f: any = createMockFinance();
    const s: any = await createStock(f, { stock_code: 'VAS', stock_full_name: 'V', shares: 0 });
    await createTrade(f, { stock_id: s.id, date: '2023-09-22', side: 'buy', quantity: 10, price: 87.48, brokerage: 3 });
    await createTrade(f, { stock_id: s.id, date: '2026-09-10', side: 'buy', quantity: 7, price: 110, brokerage: 3 });
    const log = document.createElement('trade-log') as any;
    document.body.appendChild(log);
    await log.setFinance(f);
    await log.updateComplete;
    // happy-dom drops tbody, so the order is asserted where it is decided.
    expect(log.sortedTrades.map((t: any) => t.date)).toEqual(['2026-09-10', '2023-09-22']);
    expect(log.rowCount).toBe(2);
    log.remove();
  });

  it('offers no Buy/Sell toggle in Phase 1', async () => {
    const f: any = createMockFinance();
    await createStock(f, { stock_code: 'VAS', stock_full_name: 'V', shares: 0 });
    const form = document.createElement('trade-form') as any;
    document.body.appendChild(form);
    await form.setFinance(f);
    await form.updateComplete;
    expect(form.renderRoot.textContent).not.toMatch(/sell/i);
    form.remove();
  });

  it('writes a buy on submit', async () => {
    const f: any = createMockFinance();
    const s: any = await createStock(f, { stock_code: 'VAS', stock_full_name: 'V', shares: 0 });
    const form = document.createElement('trade-form') as any;
    document.body.appendChild(form);
    await form.setFinance(f);
    form.editTrade(null);
    form.stockId = s.id;
    form.date = '2026-09-10';
    form.quantity = '7';
    form.price = '110';
    form.brokerage = '3';
    form.requestUpdate?.();
    await form.updateComplete;
    await form.onSubmit(new Event('submit'));
    await new Promise((r) => setTimeout(r, 0));
    const rows = await f.db.table('wealthflow_trades').find({});
    expect(rows).toHaveLength(1);
    expect(rows[0].quantity).toBe(7);
    form.remove();
  });

  it('surfaces a validation failure rather than swallowing it', async () => {
    const f: any = createMockFinance();
    await createStock(f, { stock_code: 'VAS', stock_full_name: 'V', shares: 0 });
    const form = document.createElement('trade-form') as any;
    document.body.appendChild(form);
    await form.setFinance(f);
    form.editTrade(null);
    form.stockId = 1;
    form.date = '2026-09-10';
    form.quantity = '0';
    form.price = '110';
    form.requestUpdate?.();
    await form.updateComplete;
    await form.onSubmit(new Event('submit'));
    await new Promise((r) => setTimeout(r, 0));
    expect(form.renderRoot.textContent).toMatch(/quantity/i);
    expect(await f.db.table('wealthflow_trades').find({})).toHaveLength(0);
    form.remove();
  });

  it('keeps a 4dp price and a fractional quantity visible', async () => {
    const f: any = createMockFinance();
    const s: any = await createStock(f, { stock_code: 'VHY', stock_full_name: 'V', shares: 0 });
    await createTrade(f, { stock_id: s.id, date: '2026-07-16', side: 'buy', quantity: 0.1504, price: 82.7065, source: 'drp' });
    const log = document.createElement('trade-log') as any;
    document.body.appendChild(log);
    await log.setFinance(f);
    await log.updateComplete;
    expect(log.sortedTrades[0].quantity).toBe(0.1504);
    expect(log.renderRoot.textContent).toContain('82.7065');
    log.remove();
  });
});
```

`trade-form` exposes `stockId`, `date`, `quantity`, `price` and `brokerage` as public properties, matching how `dividend-form` holds `stockId`, `date`, `gross` and `franking` (`overview.test.ts:1335`). That is what makes the submit path testable without driving inputs.

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tests/trades-view.test.ts`
Expected: FAIL — `trade-log` is not a registered element.

- [ ] **Step 3: Implement `trades-view.ts`**

Copy `src/ui/overview-view.ts`'s section idiom: `section flush`, `section-header is-toggle`, `header-actions`, `btn btn-secondary btn-small`. Render the **segment control above the body**, `Trades` active or `Parcels` active, switching `this.segment` and re-rendering. Render `<trade-log>` under `Trades`.

Listen for `trade-create`, `trade-edit` and `trade-delete` on `this` and, in that order, **`await rebuildAllParcels(this.finance)` then `reload()`** — these names are allowlisted by Task 1.

The rebuild lives here and nowhere else. Nothing else may call it: `parcel-ledger` reads `wealthflow_parcels`, it never recomputes. One caller, one place to look, and a buy typed in the form is reflected in `shares` and the ledger on the same tick.

- [ ] **Step 4: Implement `trade-log.ts`**

Table: Date (sortable via the existing `dateSortHeader` from `./sort-header.js`, default DESC), Stock, Qty, Price, Brokerage, Cost, Actions. `Price` renders at **4dp**, not 2dp — that is what makes a DRP price of `108.8611` legible. Edit dispatches `trade-edit-request`; Delete confirms then calls `deleteTrade` and dispatches `trade-delete`.

- [ ] **Step 5: Implement `trade-form.ts`**

Fields: date, stock `<select>` from `listStocks`, quantity, price, brokerage, notes. **No Buy/Sell toggle** — Phase 1 is buy-only by design (see Phasing). `editTrade(null)` blanks the form; `editTrade(t)` fills it and sets the submit target to that id.

On submit: call `createTrade` or `updateTrade`, dispatch `trade-create` / `trade-edit`, blank the form, and close. On failure set `this.error` and render it — the same red `field-error` paragraph `overview-view.ts:200` uses. **Never swallow the error.**

Wrap `await createTrade(...)` in `try/catch` so a `ValidationFailed` or `ValidationFailed`-shaped rejection shows its message.

- [ ] **Step 6: Register the three elements in `src/ui/index.ts`**

Add imports and `customElements.define` calls for `trades-view`, `trade-form`, `trade-log`, each behind the existing `if (!customElements.get(...))` guard.

- [ ] **Step 7: Run to verify it passes**

Run: `npm test -- tests/trades-view.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 8: Commit**

```bash
git add src/ui/trades-view.ts src/ui/trade-form.ts src/ui/trade-log.ts src/ui/index.ts tests/trades-view.test.ts
git commit -m "feat: trades view with a buy form above a newest-first log"
```

---

### Task 6: Parcel ledger and the untracked-holding marker

**Files:**
- Create: `src/ui/parcel-ledger.ts`
- Modify: `src/ui/stock-list.ts`, `src/ui/stock-form.ts`
- Test: `tests/parcel-ledger.test.ts`

**Interfaces:**
- Consumes: `groupParcels`, `isDiscountEligible`, `monthsHeld` from Task 3; `listStocks`, `listParcels` from Tasks 2–3.
- Produces:
  ```ts
  // src/ui/parcel-ledger.ts
  export interface ParcelRow extends Parcel {
    costBase: number; perUnit: number; heldLabel: string; discountLabel: string;
  }
  export class ParcelLedger extends Base {
    finance: any; asOf: string; rowCount: number;
    groups: ParcelGroup[];                       // one per stock, untracked included
    toggleGroup(stockId: number): void;
    expandedParcels(stockId: number): ParcelRow[];   // oldest first
    setFinance(f: any): Promise<void>;
    reload(): Promise<void>;
  }
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { createMockFinance } from '../src/mock/finance-mock.js';
import { createStock } from '../src/dao/stocks.js';
import { createTrade } from '../src/dao/trades.js';
import { rebuildParcels, rebuildAllParcels } from '../src/services/parcel-service.js';
import '../src/ui/parcel-ledger.js';

const ASOF = '2026-10-16';

async function mount(f: any) {
  const el = document.createElement('parcel-ledger') as any;
  document.body.appendChild(el);
  await el.setFinance(f);
  el.asOf = ASOF;
  await el.reload();
  await el.updateComplete;
  return el;
}

describe('parcel ledger', () => {
  it('groups by holding and counts units and parcels', async () => {
    const f: any = createMockFinance();
    const vas: any = await createStock(f, { stock_code: 'VAS', stock_full_name: 'V', shares: 0 });
    await createTrade(f, { stock_id: vas.id, date: '2021-09-28', side: 'buy', quantity: 11, price: 94.93, brokerage: 9.5 });
    await createTrade(f, { stock_id: vas.id, date: '2026-10-16', side: 'buy', quantity: 1, price: 108.8611 });
    await rebuildParcels(f, vas.id);
    const el = await mount(f);
    const g = el.groups.find((x: any) => x.stockCode === 'VAS');
    expect(g.units).toBe(12);
    expect(g.parcelCount).toBe(2);
    expect(g.notTracked).toBe(false);
    el.remove();
  });

  it('marks a holding with no trades as notTracked, never as zero units', async () => {
    const f: any = createMockFinance();
    await createStock(f, { stock_code: 'VHY', stock_full_name: 'V', shares: 22 });
    await rebuildAllParcels(f);
    const el = await mount(f);
    const g = el.groups.find((x: any) => x.stockCode === 'VHY');
    expect(g.notTracked).toBe(true);
    expect(el.renderRoot.textContent).toMatch(/not yet tracked/i);
    el.remove();
  });

  it('lists a group oldest first, because that is FIFO order', async () => {
    const f: any = createMockFinance();
    const v: any = await createStock(f, { stock_code: 'VAS', stock_full_name: 'V', shares: 0 });
    await createTrade(f, { stock_id: v.id, date: '2026-09-10', side: 'buy', quantity: 7, price: 110, brokerage: 3 });
    await createTrade(f, { stock_id: v.id, date: '2021-09-28', side: 'buy', quantity: 11, price: 94.93, brokerage: 9.5 });
    await rebuildParcels(f, v.id);
    const el = await mount(f);
    el.toggleGroup(v.id);
    await el.updateComplete;
    expect(el.expandedParcels(v.id).map((p: any) => p.acquired_date))
      .toEqual(['2021-09-28', '2026-09-10']);
    el.remove();
  });

  it('reports a live countdown rather than a bare date', async () => {
    const f: any = createMockFinance();
    const v: any = await createStock(f, { stock_code: 'VAS', stock_full_name: 'V', shares: 0 });
    await createTrade(f, { stock_id: v.id, date: '2026-09-10', side: 'buy', quantity: 7, price: 110, brokerage: 3 });
    await rebuildParcels(f, v.id);
    const el = await mount(f);
    el.toggleGroup(v.id);
    await el.updateComplete;
    expect(el.expandedParcels(v.id)[0].discountLabel).toBe('In 11 months');
    el.remove();
  });

  it('says "Eligible today" for a parcel that crosses its line on this date', async () => {
    const f: any = createMockFinance();
    const v: any = await createStock(f, { stock_code: 'VAS', stock_full_name: 'V', shares: 0 });
    await createTrade(f, { stock_id: v.id, date: '2025-10-16', side: 'buy', quantity: 2, price: 109.8171 });
    await rebuildParcels(f, v.id);
    const el = await mount(f);
    el.toggleGroup(v.id);
    await el.updateComplete;
    expect(el.expandedParcels(v.id)[0].discountLabel).toBe('Eligible today');
    el.remove();
  });

  it('carries a 0.1504-unit parcel through without rounding it away', async () => {
    const f: any = createMockFinance();
    const v: any = await createStock(f, { stock_code: 'VHY', stock_full_name: 'V', shares: 0 });
    await createTrade(f, { stock_id: v.id, date: '2026-07-16', side: 'buy', quantity: 0.1504, price: 82.7065, source: 'drp' });
    await rebuildParcels(f, v.id);
    const el = await mount(f);
    el.toggleGroup(v.id);
    await el.updateComplete;
    expect(el.expandedParcels(v.id)[0].quantity).toBe(0.1504);
    expect(el.renderRoot.textContent).toContain('0.1504');
    expect(el.renderRoot.textContent).toContain('82.7065');
    el.remove();
  });
});
```

`parcel-ledger` therefore exposes `groups: ParcelGroup[]`, `toggleGroup(stockId): void` and `expandedParcels(stockId): ParcelRow[]`, where `ParcelRow` is a `Parcel` plus `costBase`, `perUnit`, `heldLabel` and `discountLabel`. **`discountLabel` is decided in the element from `isDiscountEligible` and `addMonths` — never re-derived by a second rule in the template**, so the label and the eligibility cannot disagree.

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tests/parcel-ledger.test.ts`
Expected: FAIL — `parcel-ledger` is not a registered element.

- [ ] **Step 3: Implement `parcel-ledger.ts`**

A header line stating the position is **derived and never hand-edited** — spec §7.2 requires this, because a ledger the user believes they can edit is a ledger they will break.

One collapsed group row per holding: code, name, units, parcel count, average cost per unit, `eligibleUnits / units`. Untracked holdings render **"not yet tracked"** in place of the units figure; never a bare `0`.

Expanding a group shows its parcels **oldest first** — that is FIFO's order, so the first row is the next one a sale would consume. Columns: parcel number, units, acquired date, source, cost base, per-unit cost, held duration, and discount status.

`discountLabel` is computed by one function, and the template never re-derives it:

```ts
function discountLabel(acquired: string, asOf: string): string {
  const eligibleOn = addMonths(acquired, 12);
  if (asOf === eligibleOn) return 'Eligible today';
  if (asOf > eligibleOn) return 'Eligible';
  const months = (Number(eligibleOn.slice(0,4)) * 12 + Number(eligibleOn.slice(5,7)))
               - (Number(asOf.slice(0,4))    * 12 + Number(asOf.slice(5,7)));
  return months <= 1 ? 'In under a month' : `In ${months} months`;
}
```

`months` is a **month-index difference, not elapsed whole months** — a parcel qualifying 2027-09-10 seen from 2026-10-16 is 10 months and 25 days away, and its label is **`In 11 months`**, because that is the month it lands in. Rounding is not left to the implementer.

`asOf` defaults to today via `new Date()` and is a public property so tests can pin it.

`asOf` defaults to today via `new Date()` and is a property so tests can pin it.

- [ ] **Step 4: Make the Stocks view honest about derived shares**

In `src/ui/stock-form.ts`, make the Shares field read-only with a note that it is derived from trades, and drop it from the submitted payload so a stale typed value cannot overwrite the rebuild's. In `src/ui/stock-list.ts`, render a holding with no parcels as **"not yet tracked"** rather than `0`.

- [ ] **Step 5: Register `parcel-ledger` in `src/ui/index.ts`**

- [ ] **Step 6: Run to verify it passes**

Run: `npm test -- tests/parcel-ledger.test.ts tests/stocks.test.ts tests/stock-ui.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/ui/parcel-ledger.ts src/ui/index.ts src/ui/stock-list.ts src/ui/stock-form.ts tests/parcel-ledger.test.ts
git commit -m "feat: grouped parcel ledger with a live discount countdown"
```

---

### Task 7: Wire the Trades tab into the orchestrator and the host

**Files:**
- Modify: `src/ui/wealthflow-orchestrator.ts`
- Modify: `src/ui/trades-view.ts` (render the Parcels segment)
- Modify: `src/main.ts`
- Test: `tests/orchestrator.test.ts`, `tests/navigation.test.ts`, `tests/global-fy.test.ts`

**Interfaces:**
- Consumes: `trades-view`, `parcel-ledger` from Tasks 5–6; the `wealthflow.show-trades` command from Task 1.
- Produces: `WealthTab` gains `'trades'`; `viewForMount` maps `trades` / `trade-list` to it; `TAB_LABELS` gains `'Trades'`.

- [ ] **Step 1: Write the failing tests**

```ts
it('maps trades and trade-list to the Trades tab', () => {
  expect(viewForMount({ view: 'trades' })).toBe('trades');
  expect(viewForMount({ view: 'trade-list' })).toBe('trades');
});

it('still defaults to overview for an unknown view', () => {
  expect(viewForMount({})).toBe('overview');
});

it('renders trades-view when the tab is trades', async () => {
  const o = document.createElement('wealthflow-orchestrator') as any;
  o.finance = createMockFinance();
  o.navigate('trades');
  await o.updateComplete;
  expect(o.renderRoot.querySelector('#child')?.tagName.toLowerCase()).toBe('trades-view');
});

it('labels the crumb Trades', async () => {
  const o = document.createElement('wealthflow-orchestrator') as any;
  o.finance = createMockFinance();
  o.navigate('trades');
  await o.updateComplete;
  expect(o.renderRoot.querySelector('.crumb-current')?.textContent).toMatch(/Trades/);
});
```

Add to `tests/navigation.test.ts`: `wealthflow.show-trades` is registered by `activate` and calls `requestMount('wealthflow', { view: 'trades' })`.

Also add a segment-switch test to `tests/orchestrator.test.ts` — no earlier task covers it:

```ts
it('switches between the Trades log and the parcel ledger', async () => {
  const v = document.createElement('trades-view') as any;
  document.body.appendChild(v);
  v.finance = createMockFinance();
  await v.setFinance(v.finance);
  await v.updateComplete;
  expect(v.renderRoot.querySelector('trade-log')).toBeTruthy();
  expect(v.renderRoot.querySelector('parcel-ledger')).toBeFalsy();
  v.segment = 'parcels';
  v.requestUpdate?.();
  await v.updateComplete;
  expect(v.renderRoot.querySelector('parcel-ledger')).toBeTruthy();
  expect(v.renderRoot.querySelector('trade-log')).toBeFalsy();
  v.remove();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tests/orchestrator.test.ts tests/navigation.test.ts`
Expected: FAIL — `viewForMount({view:'trades'})` returns `'overview'`.

- [ ] **Step 3: Extend the orchestrator**

Add `'trades'` to `WealthTab` and `TAB_LABELS`. In `viewForMount`, return `'trades'` for `trades` or `trade-list`, and keep `'overview'` as the fallback so an unknown view still lands somewhere. In `render`, add the `trades` branch rendering `<trades-view id="child">`.

`pushFinance()` already forwards `finance`, then `fy`, then `setFinance` or `reload` — `trades-view` implements `setFinance`, so no change is needed there. **Phase 1 keeps Trades FY-scoped**; the "All years" sentinel and its scoping rules belong to the branch that carries disposals, because until then a year filter is the only thing a position ledger has to get wrong.

- [ ] **Step 4: Render the Parcels segment inside `trades-view`**

When `segment === 'parcels'`, render `<parcel-ledger>` in place of `<trade-log>`.

- [ ] **Step 5: Register the command in `src/main.ts`**

```ts
finance.commands.registerCommand(
  'wealthflow.show-trades',
  'Wealth Flow: Show Trades',
  openView('trades'),
);
```

`openView` already exists at `src/main.ts:30`.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS. `tests/global-fy.test.ts` and `tests/forms-fy.test.ts` must still pass unchanged — no FY semantics were altered.

- [ ] **Step 7: Verify the build**

Run: `npm run build`
Expected: `build/extension/wealthflow.js` under 200KB.

- [ ] **Step 8: Run prettier, then commit**

```bash
npx prettier --write --single-quote "src/main.ts" "src/dao/**/*.ts" "src/services/**/*.ts" "src/ui/**/*.ts" "src/utils/**/*.ts" "scripts/**/*.mjs"
git add src/ui/wealthflow-orchestrator.ts src/ui/trades-view.ts src/main.ts tests/orchestrator.test.ts tests/navigation.test.ts
git commit -m "feat: Trades tab in the orchestrator, with the parcel ledger behind it"
```

---

## Done means

- `npm test` passes.
- `node scripts/import-sharesight.mjs` writes **VAS 165 units / 32 parcels / $15,238.16**, **VHY 22 / 5 / $1,541.17**, **FGX 1,109 / 9 / $1,284.08**, and aborts if any of those do not match.
- Re-running the importer inserts nothing.
- The Trades tab lists buys and shows the parcel ledger; a holding with no trades says "not yet tracked".
- `wealthflow_stocks.shares` equals the summed parcel quantities and cannot be typed over.
- `npm run build` succeeds under 200KB.

**Not done here, by design:** no sells, no allocation preview, no CGT figures, no DRP fields, no AMIT adjustments. Those are Plans 2–5.