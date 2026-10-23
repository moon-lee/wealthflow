# Trades Portfolio Summary — Implementation Plan

> **Amended 2026-10-22.** The owner's decisions on 2026-10-22 changed three
> things this plan got wrong or left open, and the text below has been
> corrected to match what shipped:
>
> 1. **The gain is measured on the PRE-AMIT cost base**, not the post-AMIT
>    one — so the figures match the reference to the cent. The realised half
>    moves onto the same footing (§5.9 of the spec).
> 2. **VHY's 16 Jul 2026 reinvestment bought ONE unit at $82.706**, so the
>    portfolio is 46 parcels and 1,297 units, not 45 and 1,296.
> 3. **The % mode is per annum**, not a share of the portfolio value, and
>    Value never converts to a percentage.
>
> The plan is otherwise the record of what was built.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Trades Summary section and an Investment section to the existing Trades page, restructure Trades and Parcels from a segmented toggle into four separate sections, and apply a shared style pass across all five.

**Architecture:** A new `wealthflow_prices` table stores an append-only price history, so a market-price API can be added later without touching the layout. A pure `xirr` module computes the money-weighted annualised return; a `portfolio-service` folds prices, trades, parcels, dividends, disposals and AMIT adjustments into a `PortfolioSummary` and a list of holdings. Two new Lit elements (`trades-summary`, `investment-table`) render that data, and `trades-view` becomes the page container holding four `.section` blocks.

**Tech Stack:** TypeScript, Lit 3, Vitest, the host `finance` API (`db.table(...)`, `services.invoke`), the app's `--ff-*` design tokens.

**Spec:** `docs/superpowers/specs/2026-10-21-wealthflow-portfolio-summary-design.md` — the plan argues from the spec, so the spec travels with it; executors read both.

## Global Constraints

- **Never commit.** Every task ends by staging and showing the diff. The commit message to use is given; the commit itself is not made.
- **Never release.** No `npm run build`, no `npm run build -- bump`, no install. The version bump in Task 11 is made by editing `package.json` directly so `version` and `financeExtension.version` stay in sync.
- Versions are **patch** bumps only: `0.2.5` → `0.2.6`. Never reset, never minor.
- `finance` is imported with `import type` only. `finance-logger` is the only logger; no `console.log` in shipped code.
- New tables are prefixed `wealthflow_`. The host creates missing tables and **migrates new columns additively** (`createExtensionTables` in the host's `table-ddl.ts`), but it **refuses** a `NOT NULL` column with no default, so such a column would break the install. New data still goes in a **new table** where the shape is history rather than a current value.
- Money is `real`. Adjustments and per-parcel AMIT shares are computed and stored at **4dp**, not 2dp.
- Style uses `var(--ff-*)` tokens from `src/styles/`. **Never edit `src/styles/tokens.css`, `ext-layout.css`, `ext-tokens.css` or `shared-styles.ts`** — they are vendored and overwritten by `refresh`. New styles go in a new file.
- Prettier with `--single-quote` must pass on every file touched. The check list: `src/main.ts`, `src/dao/**/*.ts`, `src/services/**/*.ts`, `src/ui/**/*.ts`, `src/utils/**/*.ts`, `src/mock/**/*.ts`, `src/shared/**/*.ts`, `scripts/**/*.mjs`, `vite.config.ts`, `index.html`, `tests/**/*.ts`.
- **UI tests assert on exposed data properties and call methods directly.** happy-dom drops `tbody`/`thead`/`tfoot` from shadow roots, mishandles `form=""` on submit buttons, and mis-parents nodes when a conditional template is swapped. Do not scrape `renderRoot.textContent` for values a property already exposes.
- Every new element must register itself with `customElements.define` guarded by `typeof customElements !== 'undefined'`.

## Review Focus

Five input classes the spec implies but no single task's tests exercise. Each is pinned by the test named in the task that owns the code.

1. **A holding with no price row.** The Portfolio value card and the Investments totals row must show `—`, never a partial total and never `$0.00`. → Task 6
2. **An AMIT adjustment dated *after* the as-of date.** A snapshot must not be uplifted by an adjustment that had not happened yet. → Task 5
3. **A holding fully sold.** Open units are zero, so it drops out of open positions, but its realised gain must still count toward the portfolio's capital gain — and its sale proceeds must appear in the cash-flow series. → Task 6
4. **A zero-unit DRP** (the real VHY 16 Jul 2026 case). Income is recorded, no parcel is created, and the distribution and the DRP net to zero in the cash-flow series instead of double-counting. → Task 6
5. **A portfolio with no prices yet.** With no terminal value every cash flow is negative, so the XIRR has no solution and every rate reads `—` rather than throwing or returning a fabricated rate. → Task 6

---

### Task 1: The `wealthflow_prices` table and its DAO

**Files:**
- Modify: `package.json` (the `financeExtension.tables` array)
- Modify: `tests/manifest.test.ts`
- Create: `src/dao/prices.ts`
- Create: `tests/prices.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  // src/dao/prices.ts
  export interface PriceRow {
    id: number; stock_id: number; price: number; as_at: string; source: string;
  }
  export interface CurrentPrice { price: number; asAt: string; source: string; }
  export async function insertPrice(
    finance: FinanceApi,
    input: { stock_id: number; price: number; as_at: string; source?: string },
  ): Promise<PriceRow>;
  export async function listPrices(finance: FinanceApi, stockId?: number): Promise<PriceRow[]>;
  export async function latestPrices(finance: FinanceApi): Promise<Map<number, CurrentPrice>>;
  export async function latestPriceFor(finance: FinanceApi, stockId: number): Promise<CurrentPrice | null>;
  ```

- [ ] **Step 1: Write the failing manifest test**

Add to `tests/manifest.test.ts`:

```ts
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
```

Also update the existing table-name list assertion to include `'wealthflow_prices'` and its test title from `10 tables` to `11 tables`.

- [ ] **Step 2: Write the failing DAO test**

`tests/prices.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createMockFinance } from '../src/mock/finance-mock.js';
import { createStock } from '../src/dao/stocks.js';
import { insertPrice, listPrices, latestPrices, latestPriceFor } from '../src/dao/prices.js';

describe('prices', () => {
  it('keeps every price row — a price history, not a current-price column', async () => {
    const f: any = createMockFinance();
    const s: any = await createStock(f, { stock_code: 'VAS', stock_full_name: 'V', shares: 0 });
    await insertPrice(f, { stock_id: s.id, price: 100, as_at: '2026-01-01' });
    await insertPrice(f, { stock_id: s.id, price: 110, as_at: '2026-06-01' });
    expect(await listPrices(f, s.id)).toHaveLength(2);
  });

  it('returns the most recent price as the current one', async () => {
    const f: any = createMockFinance();
    const s: any = await createStock(f, { stock_code: 'VAS', stock_full_name: 'V', shares: 0 });
    await insertPrice(f, { stock_id: s.id, price: 100, as_at: '2026-01-01' });
    await insertPrice(f, { stock_id: s.id, price: 110, as_at: '2026-06-01' });
    const cur = await latestPriceFor(f, s.id);
    expect(cur!.price).toBe(110);
    expect(cur!.asAt).toBe('2026-06-01');
  });

  it('breaks a same-date tie on the later row, so a re-entry wins', async () => {
    const f: any = createMockFinance();
    const s: any = await createStock(f, { stock_code: 'VAS', stock_full_name: 'V', shares: 0 });
    await insertPrice(f, { stock_id: s.id, price: 100, as_at: '2026-01-01' });
    await insertPrice(f, { stock_id: s.id, price: 101, as_at: '2026-01-01' });
    expect((await latestPriceFor(f, s.id))!.price).toBe(101);
  });

  it('returns null for a holding that has never been priced', async () => {
    const f: any = createMockFinance();
    const s: any = await createStock(f, { stock_code: 'VAS', stock_full_name: 'V', shares: 0 });
    expect(await latestPriceFor(f, s.id)).toBeNull();
  });

  it('maps one current price per stock', async () => {
    const f: any = createMockFinance();
    const a: any = await createStock(f, { stock_code: 'VAS', stock_full_name: 'V', shares: 0 });
    const b: any = await createStock(f, { stock_code: 'VHY', stock_full_name: 'V', shares: 0 });
    await insertPrice(f, { stock_id: a.id, price: 100, as_at: '2026-01-01' });
    await insertPrice(f, { stock_id: b.id, price: 50, as_at: '2026-01-01' });
    const map = await latestPrices(f);
    expect(map.get(a.id)!.price).toBe(100);
    expect(map.get(b.id)!.price).toBe(50);
  });

  it('refuses a price of zero, which is not a price', async () => {
    const f: any = createMockFinance();
    const s: any = await createStock(f, { stock_code: 'VAS', stock_full_name: 'V', shares: 0 });
    await expect(insertPrice(f, { stock_id: s.id, price: 0, as_at: '2026-01-01' })).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run both tests to verify they fail**

Run: `npm test -- tests/manifest.test.ts tests/prices.test.ts`
Expected: FAIL — the table is absent and the module does not exist.

- [ ] **Step 4: Add the table to `package.json`**

Add this object to the `financeExtension.tables` array, after `wealthflow_capital_losses`:

```json
{
  "name": "wealthflow_prices",
  "columns": [
    { "name": "stock_id", "type": "integer", "nullable": false },
    { "name": "price", "type": "real", "nullable": false },
    { "name": "as_at", "type": "date", "nullable": false },
    { "name": "source", "type": "text", "nullable": false, "default": "manual" }
  ]
}
```

- [ ] **Step 5: Implement `src/dao/prices.ts`**

Follow the pattern of `src/dao/capital-losses.ts`: a `TABLE` constant, a `find` with equality filtering, and `insert` for writes.

`insertPrice` defaults `source` to `'manual'` and rejects a non-positive price. Reuse the existing `AdjustmentValidationError` from `src/dao/cost-base-adjustments.ts` rather than declaring a second error class for the same kind of failure.

`latestPriceFor` and `latestPrices` select the row with the greatest `as_at`, breaking ties on the greater `id`. Sort `as_at` as a string — every date is `YYYY-MM-DD`, so lexicographic order is chronological.

- [ ] **Step 6: Run both tests to verify they pass**

Run: `npm test -- tests/manifest.test.ts tests/prices.test.ts`
Expected: PASS.

- [ ] **Step 7: Stage and show the diff**

```bash
git add package.json tests/manifest.test.ts src/dao/prices.ts tests/prices.test.ts
git diff --cached
```

Suggested commit message: `feat: add the prices table and DAO with a per-stock current price`

---

### Task 2: The shared portfolio styles

**Files:**
- Create: `src/styles/portfolio-styles.ts`
- Create: `tests/portfolio-styles.test.ts`

**Interfaces:**
- Consumes: the `--ff-*` tokens from the vendored `src/styles/ext-tokens.css` (read-only — never edit it) and the layout classes from `src/styles/ext-layout.css`.
- Produces: `export const portfolioStyles: CSSResult` from `src/styles/portfolio-styles.ts`, importable by any of the five screens.

- [ ] **Step 1: Write the failing test**

`tests/portfolio-styles.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { portfolioStyles } from '../src/styles/portfolio-styles.js';

describe('portfolio styles', () => {
  it('defines the shared rules the five screens rely on', () => {
    const css = String(portfolioStyles);
    for (const rule of [
      '.portfolio-cards',
      '.portfolio-card',
      '.portfolio-table',
      '.portfolio-group-row',
      '.portfolio-totals',
      '.portfolio-note',
    ]) {
      expect(css).toContain(rule);
    }
  });

  it('uses the design tokens rather than hardcoded colours', () => {
    const css = String(portfolioStyles);
    expect(css).toContain('var(--ff-');
    // A hex colour would not survive a theme change.
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
  });

  it('aligns money columns on the decimal', () => {
    expect(String(portfolioStyles)).toContain('tabular-nums');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/portfolio-styles.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/styles/portfolio-styles.ts`**

Follow the shape of `src/styles/wealthflow-styles.ts`: a `css` tagged template from `lit`, exported as `portfolioStyles`. Rules to define:

- `.portfolio-cards` — a grid of five cards with hairline dividers between them, matching the reference's rhythm. Uses `var(--ff-*)` for every colour.
- `.portfolio-card` — label, large value, secondary note stacked.
- `.portfolio-table` — dense table: `font-variant-numeric: tabular-nums` on numeric cells, right-aligned `.num` cells, a sticky `thead`, a hover row state.
- `.portfolio-group-row` — a market group header row, muted and full width.
- `.portfolio-totals` — the totals row, emphasised over the body rows.
- `.portfolio-note` — a footnote line, muted.

**Never edit** `src/styles/tokens.css`, `src/styles/ext-layout.css`, `src/styles/ext-tokens.css` or `src/styles/shared-styles.ts` — they are vendored and overwritten by `refresh`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/portfolio-styles.test.ts`
Expected: PASS.

- [ ] **Step 5: Stage and show the diff**

```bash
git add src/styles/portfolio-styles.ts tests/portfolio-styles.test.ts
git diff --cached
```

Suggested commit message: `style: add the shared portfolio stylesheet`

---

### Task 3: The canonical portfolio fixture

**Files:**
- Create: `tests/fixtures/portfolio.ts`
- Create: `tests/portfolio-fixture.test.ts`

**Interfaces:**
- Consumes: `insertPrice` from `src/dao/prices.js`; `createStock` from `src/dao/stocks.js`; `createTrade` from `src/dao/trades.js`; `createDividend` from `src/dao/dividends.js`; `createAdjustment` from `src/dao/cost-base-adjustments.js`; `rebuildAllParcels` from `src/services/parcel-service.js`.
- Produces:
  ```ts
  export const AS_OF = '2026-10-21';
  export interface PortfolioFixture {
    finance: any;
    stockIds: Record<'VAS' | 'VHY' | 'FGX', number>;
  }
  export function expectedTotals(): {
    units: number; parcels: number;
    preAdjustmentCostBase: number; adjustment: number; costBase: number;
    income: number; franking: number; value: number;
  };
  export async function buildPortfolio(): Promise<PortfolioFixture>;
  ```

- [ ] **Step 1: Write the fixture module**

The three holding documents in `docs/` are the authoritative record and the source to transcribe from:

| Holding | Document |
| --- | --- |
| VAS | `docs/Vanguard Australian Shares Index Etf.md` |
| VHY | `docs/Vanguard Australian Shares High Yield Etf.md` |
| FGX | `docs/Future Gen Aust.md` |

Transcribe, per holding: every **buy** row (date, units, price, brokerage) and every **DRP** row (date, units, price per unit, amount reinvested) as a `wealthflow_trades` row — DRP rows use `source: 'drp'`, `brokerage: 0`, and `price` = the DRP price per unit, with `dividend_id` left `null` because the fixture does not need the DRP/dividend coupling exercised. Every **distribution** row becomes a `wealthflow_dividends` row with `gross` and `franking` from the document and `finance_year` computed with `computeFinanceYear(date, '07-01')`. Every **Cost base adj.** cell in a document's distribution table becomes a `wealthflow_cost_base_adjustments` row (date = the distribution date, amount = the adjustment, `reason: 'AMIT cost base adjustment'`); a cell shown as `—` is a real `$0.00` row and must be inserted as `0`, not skipped.

The VHY 16 Jul 2026 reinvestment is transcribed as **0 units, $0.00** — it is a zero-unit DRP and is deliberately in the fixture. It becomes a dividend with no trade, because a zero-quantity trade is refused by `createTrade` (quantity must be > 0).

`expectedTotals()` returns exactly these values, and the fixture must reproduce them:

| | units | parcels | pre-AMIT cost base | AMIT adj | post-AMIT cost base | gross income | franking | price |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| VAS | 165 | 32 | 15,238.1619 | −4.43 | 15,233.7319 | 2,345.37 | 579.29 | 108.75 |
| VHY | 23 | 5 | 1,623.8784 | −10.83 | 1,613.0484 | 303.25 | 60.18 | 84.34 |
| FGX | 1,109 | 9 | 1,284.08195 | 0.00 | 1,284.08195 | 227.12 | 68.14 | 1.34 |
| **Total** | **1,297** | **46** | **18,146.12225** | **−15.26** | **18,130.86225** | **2,875.74** | **707.61** | — |

**The cost bases are at full precision, not the documents' 2dp display figures.** The DRP
prices carry four decimals, so a parcel's cost is `quantity × price` to the cent and a half:
the real pre-AMIT basis is $18,146.12225, which the documents show as $18,146.12. Pinning
the rounded figure would let a fixture that is wrong by six cents still pass.

**VHY has FIVE parcels.** The source shows five ROWS — two buys and three
reinvestments — and the third reinvestment (16 Jul 2026) bought **one** unit at
$82.706, so it produces a parcel like any other. (An earlier reading of the
source showed that row as 0 units, which would have left VHY with four parcels
and 22 units; the owner's source row settles it, and the portfolio is 46
parcels, not 45.)

`value` in the returned totals is the portfolio value at those prices: `165 × 108.75 + 23 × 84.34 + 1,109 × 1.34` = **21,369.63** — which is **the reference screenshot's figure exactly**.

`buildPortfolio()` creates the three stocks, the trades, the dividends, the adjustments, and one price row per holding at `as_at = AS_OF` with `source = 'manual'`, then **calls `rebuildAllParcels(finance)` as its last step**. Parcels are derived, and a later test disposes of stock — without the rebuild, that disposal would find zero units on hand and be refused.

- [ ] **Step 2: Write the test that proves the fixture is faithful**

`tests/portfolio-fixture.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { listTrades } from '../src/dao/trades.js';
import { listParcels } from '../src/dao/parcels.js';
import { listDividends } from '../src/dao/dividends.js';
import { listAdjustments } from '../src/dao/cost-base-adjustments.js';
import { buildPortfolio, expectedTotals, AS_OF } from './fixtures/portfolio.js';

describe('the canonical portfolio fixture', () => {
  it('reproduces the reconciled units, parcels and cost base', async () => {
    const { finance } = await buildPortfolio();
    const t = expectedTotals();
    const buys = (await listTrades(finance)).filter((x) => x.side === 'buy');
    expect(buys.reduce((s, x) => s + x.quantity, 0)).toBe(t.units);
    expect((await listParcels(finance)).length).toBe(t.parcels);
    const cost = buys.reduce((s, x) => s + x.quantity * x.price + x.brokerage, 0);
    expect(cost).toBeCloseTo(t.preAdjustmentCostBase, 2);
  });

  it('reproduces the gross income and the AMIT adjustment total', async () => {
    const { finance, stockIds } = await buildPortfolio();
    const t = expectedTotals();
    const divs = await listDividends(finance);
    expect(divs.reduce((s, d) => s + d.gross, 0)).toBeCloseTo(t.income, 2);
    expect(divs.reduce((s, d) => s + d.franking, 0)).toBeCloseTo(t.franking, 2);
    const adj = (await listAdjustments(finance, stockIds.VAS)).reduce((s, a) => s + a.amount, 0);
    expect(adj).toBeCloseTo(-4.43, 4);
  });

  it('records the zero-unit DRP as income with no trade', async () => {
    const { finance } = await buildPortfolio();
    const zero = (await listTrades(finance)).filter((t) => t.quantity === 0);
    expect(zero).toHaveLength(0);
    const drps = (await listTrades(finance)).filter((t) => t.source === 'drp');
    expect(drps.every((d) => d.quantity > 0)).toBe(true);
  });

  it('fixes the as-of date so no test depends on today', () => {
    expect(AS_OF).toBe('2026-10-21');
  });
});
```

- [ ] **Step 3: Run the fixture test**

Run: `npm test -- tests/portfolio-fixture.test.ts`
Expected: PASS on the first run if the transcription is faithful. If the totals are off, the transcription is wrong — **fix the transcription, not the expected values**. The expected values above come from the reconciled documents and are the truth.

- [ ] **Step 4: Stage and show the diff**

```bash
git add tests/fixtures/portfolio.ts tests/portfolio-fixture.test.ts
git diff --cached
```

Suggested commit message: `test: add the canonical reconciled portfolio fixture`

---

### Task 4: The XIRR engine

**Files:**
- Create: `src/services/xirr.ts`
- Create: `tests/xirr.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export interface CashFlow { date: string; amount: number; }
  export function npvAt(rate: number, flows: CashFlow[], asOf: string): number;
  export function xirr(flows: CashFlow[], asOf: string): number | null;
  ```

- [ ] **Step 1: Write the failing tests**

`tests/xirr.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { xirr, npvAt, type CashFlow } from '../src/services/xirr.js';

describe('xirr', () => {
  it('reproduces a known annual rate', () => {
    const flows: CashFlow[] = [
      { date: '2020-01-01', amount: -1000 },
      { date: '2021-01-01', amount: 1100 },
    ];
    expect(xirr(flows, '2021-01-01')).toBeCloseTo(0.1, 2);
  });

  it('solves to the root, so the NPV at the answer is zero', () => {
    const flows: CashFlow[] = [
      { date: '2021-03-01', amount: -2000 },
      { date: '2022-09-01', amount: 500 },
      { date: '2024-01-01', amount: 1800 },
    ];
    const r = xirr(flows, '2024-01-01')!;
    expect(r).not.toBeNull();
    expect(Math.abs(npvAt(r, flows, '2024-01-01'))).toBeLessThan(1e-6);
  });

  it('returns null when every flow is the same sign', () => {
    const flows: CashFlow[] = [
      { date: '2020-01-01', amount: 1000 },
      { date: '2021-01-01', amount: 1100 },
    ];
    expect(xirr(flows, '2021-01-01')).toBeNull();
  });

  it('returns null for a single flow', () => {
    expect(xirr([{ date: '2020-01-01', amount: -1000 }], '2020-01-01')).toBeNull();
  });

  it('returns null when every flow lands on the same date', () => {
    const flows: CashFlow[] = [
      { date: '2020-01-01', amount: -1000 },
      { date: '2020-01-01', amount: 1000 },
    ];
    expect(xirr(flows, '2020-01-01')).toBeNull();
  });

  it('handles a break-even portfolio as a rate of zero', () => {
    const flows: CashFlow[] = [
      { date: '2020-01-01', amount: -1000 },
      { date: '2021-01-01', amount: 1000 },
    ];
    expect(xirr(flows, '2021-01-01')).toBeCloseTo(0, 6);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/xirr.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/services/xirr.ts`**

`npvAt(rate, flows, asOf)` computes

```
Σ flow.amount / (1 + rate) ^ (daysFromFirstFlow / 365.25)
```

where `daysFromFirstFlow` is the whole-day difference between `flow.date` and the **earliest flow date**, and `asOf` is the date the terminal value is measured on. Flows dated after `asOf` are excluded.

`xirr(flows, asOf)` returns the annual rate as a decimal (`0.0647` for 6.47%), or `null` when there is no solution.

Algorithm:
1. Drop zero-amount flows and flows after `asOf`. If fewer than two remain, return `null`.
2. If the remaining amounts do not include both a positive and a negative, return `null`.
3. If `Math.abs(npvAt(0, flows, asOf)) < 1e-9`, return `0`.
4. Bracket: evaluate `npvAt` over a candidate ladder of rates — `-0.99, -0.95, -0.9, -0.8, -0.6, -0.4, -0.2, -0.1, -0.05, -0.01, 0.01, 0.05, 0.1, 0.2, 0.3, 0.5, 0.75, 1, 1.5, 2, 3, 5, 10` — and find the first adjacent pair whose NPV values have opposite signs. If no pair has a sign change, return `null`.
5. Bisect that bracket 200 times, keeping the sub-interval whose endpoints have opposite signs. Return the midpoint.

**Note on the ladder:** it is a search, not a claim about the answer's range. A bracket may also be found at negative rates (a loss-making portfolio), which is why the ladder runs below zero.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/xirr.test.ts`
Expected: PASS.

- [ ] **Step 5: Stage and show the diff**

```bash
git add src/services/xirr.ts tests/xirr.test.ts
git diff --cached
```

Suggested commit message: `feat: add the money-weighted XIRR engine`

---

### Task 5: Date-aware AMIT and the open-position cost base

**Files:**
- Modify: `src/dao/cost-base-adjustments.ts`
- Modify: `src/services/amit-service.ts`
- Modify: `src/services/trade-service.ts`
- Create: `tests/amit-asof.test.ts`

**Interfaces:**
- Consumes: `allocationFor` from `src/services/amit-service.js` (existing).
- Produces:
  ```ts
  // src/dao/cost-base-adjustments.ts
  export async function totalAdjustmentAsOf(
    finance: FinanceApi, stockId: number, asOf: string,
  ): Promise<number>;

  // src/services/amit-service.ts
  export interface OpenCostBase {
    preAdjustment: number;  // the open units' share, before any AMIT
    amitShare: number;       // signed
    costBase: number;        // preAdjustment + amitShare
  }
  export async function openCostBase(
    finance: FinanceApi, stockId: number, asOf: string,
  ): Promise<OpenCostBase>;
  ```

  **The open basis is derived from the ledger, not allocated.** It is the whole
  fund's acquisition cost base less the pre-adjustment cost base the disposals
  already took. It is NOT the oldest N units: FIFO consumes the oldest units
  first, so after a partial sale what remains is the newest units plus the
  tail of the oldest parcel. Allocating the oldest N units understates the
  open cost base and overstates the gain — a wrong tax figure. There is no
  "how many units" parameter; the ledger knows what is open.

- [ ] **Step 1: Write the failing test**

`tests/amit-asof.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createMockFinance } from '../src/mock/finance-mock.js';
import { createStock } from '../src/dao/stocks.js';
import { createTrade } from '../src/dao/trades.js';
import { rebuildParcels } from '../src/services/parcel-service.js';
import { totalAdjustmentAsOf } from '../src/dao/cost-base-adjustments.js';
import { openCostBase } from '../src/services/amit-service.js';

describe('AMIT as of a date', () => {
  it('excludes an adjustment that had not happened yet', async () => {
    const f: any = createMockFinance();
    const s: any = await createStock(f, { stock_code: 'VAS', stock_full_name: 'V', shares: 0 });
    await f.db.table('wealthflow_cost_base_adjustments').insert({
      stock_id: s.id, date: '2022-07-18', amount: -3.19, reason: 'AMIT',
    });
    await f.db.table('wealthflow_cost_base_adjustments').insert({
      stock_id: s.id, date: '2026-07-16', amount: 0.55, reason: 'AMIT',
    });
    expect(await totalAdjustmentAsOf(f, s.id, '2024-01-01')).toBeCloseTo(-3.19, 4);
    expect(await totalAdjustmentAsOf(f, s.id, '2026-12-31')).toBeCloseTo(-2.64, 4);
  });

  it('computes the open position cost base on the post-AMIT basis', async () => {
    const f: any = createMockFinance();
    const s: any = await createStock(f, { stock_code: 'VAS', stock_full_name: 'V', shares: 0 });
    await createTrade(f, { stock_id: s.id, date: '2023-01-02', side: 'buy', quantity: 100, price: 100, brokerage: 0 });
    await f.db.table('wealthflow_cost_base_adjustments').insert({
      stock_id: s.id, date: '2023-08-01', amount: -1000, reason: 'AMIT',
    });
    await rebuildParcels(f, s.id);
    const open = await openCostBase(f, s.id, 100, '2026-10-16');
    expect(open.preAdjustment).toBeCloseTo(10000, 4);
    expect(open.amitShare).toBeCloseTo(-1000, 4);
    expect(open.costBase).toBeCloseTo(9000, 4);
  });

  it('gives a partial holding its pro-rata share of the fund adjustment', async () => {
    const f: any = createMockFinance();
    const s: any = await createStock(f, { stock_code: 'VAS', stock_full_name: 'V', shares: 0 });
    await createTrade(f, { stock_id: s.id, date: '2023-01-02', side: 'buy', quantity: 100, price: 100, brokerage: 0 });
    await f.db.table('wealthflow_cost_base_adjustments').insert({
      stock_id: s.id, date: '2023-08-01', amount: -1000, reason: 'AMIT',
    });
    await rebuildParcels(f, s.id);
    const open = await openCostBase(f, s.id, 30, '2026-10-16');
    expect(open.preAdjustment).toBeCloseTo(3000, 4);
    expect(open.amitShare).toBeCloseTo(-300, 4);
    expect(open.costBase).toBeCloseTo(2700, 4);
  });

  it('returns zeroes for a holding with no adjustment', async () => {
    const f: any = createMockFinance();
    const s: any = await createStock(f, { stock_code: 'FGX', stock_full_name: 'F', shares: 0 });
    await createTrade(f, { stock_id: s.id, date: '2023-01-02', side: 'buy', quantity: 100, price: 10, brokerage: 0 });
    await rebuildParcels(f, s.id);
    const open = await openCostBase(f, s.id, 100, '2026-10-16');
    expect(open.amitShare).toBe(0);
    expect(open.costBase).toBeCloseTo(1000, 4);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/amit-asof.test.ts`
Expected: FAIL — `totalAdjustmentAsOf` and `openCostBase` are not exported.

- [ ] **Step 3: Implement `totalAdjustmentAsOf`**

In `src/dao/cost-base-adjustments.ts`, add:

```ts
export async function totalAdjustmentAsOf(
  finance: FinanceApi,
  stockId: number,
  asOf: string,
): Promise<number> {
  const rows = await listAdjustments(finance, stockId);
  const sum = rows
    .filter((r) => r.date <= asOf)
    .reduce((s, r) => s + r.amount, 0);
  return round4(sum);
}
```

Date comparison is lexicographic because every date is `YYYY-MM-DD`.

- [ ] **Step 4: Implement `openCostBase`**

In `src/services/amit-service.ts`, add:

```ts
export async function openCostBase(
  finance: FinanceApi,
  stockId: number,
  openUnits: number,
  asOf: string,
): Promise<OpenCostBase> {
  if (openUnits <= 0) return { preAdjustment: 0, amitShare: 0, costBase: 0 };
  const rows = await allocationFor(finance, stockId, openUnits, asOf);
  const preAdjustment = round4(rows.reduce((s, r) => s + r.costBasePreAdjustment, 0));
  const amitShare = round4(rows.reduce((s, r) => s + r.adjustmentShare, 0));
  return { preAdjustment, amitShare, costBase: round4(preAdjustment + amitShare) };
}
```

- [ ] **Step 5: Make `allocationFor` use the date-aware total**

In `allocationFor`, replace the call to `totalAdjustment(finance, stockId)` with `totalAdjustmentAsOf(finance, stockId, asOf)`. The `asOf` parameter is already in the signature and was previously ignored for the total — it now means what it says.

Also update `src/services/trade-service.ts` so `replayStock` uses `totalAdjustmentAsOf(finance, stockId, t.date)` per sell trade rather than the undated total, so a disposal bears only the adjustments that existed by its own date. **The existing AMIT tests must still pass** — every adjustment in them is dated before its disposal date, so the totals are unchanged.

Run: `npm test -- tests/amit-asof.test.ts tests/drp-service.test.ts tests/trade-service.test.ts`
Expected: PASS, all three files.

- [ ] **Step 6: Stage and show the diff**

```bash
git add src/dao/cost-base-adjustments.ts src/services/amit-service.ts src/services/trade-service.ts tests/amit-asof.test.ts
git diff --cached
```

Suggested commit message: `feat: date-aware AMIT totals and the open-position cost base`

---

### Task 6: The portfolio service

**Files:**
- Create: `src/services/portfolio-service.ts`
- Create: `tests/portfolio-service.test.ts`
- Modify: `src/services/public-wealth-adapter.ts`

**Interfaces:**
- Consumes: `latestPrices` / `CurrentPrice` from `src/dao/prices.js`; `listTrades` from `src/dao/trades.js`; `listParcels` from `src/dao/parcels.js`; `listDividends` from `src/dao/dividends.js`; `listDisposals` from `src/dao/disposals.js`; `openCostBase` from `src/services/amit-service.js`; `totalAdjustmentAsOf` from `src/dao/cost-base-adjustments.js`; `xirr` / `CashFlow` from `src/services/xirr.js`; `carriedForwardFor` from `src/dao/capital-losses.js`; `computeFinanceYear` from `src/utils/finance-year.js`.
- Produces:
  ```ts
  export function marketOf(stock: { stock_code: string }): string;
  export interface HoldingSummary {
    stockId: number; code: string; name: string; market: string;
    units: number;
    price: number | null; priceAsAt: string | null; priceSource: string | null;
    value: number | null;
    costBase: number; amitShare: number;
    unrealisedGain: number | null;
    realisedGain: number;
    capitalGain: number | null;
    income: number; franking: number;
    totalReturn: number | null;
  }
  export interface PortfolioSummary {
    asOf: string;
    totalValue: number | null;
    totalCostBase: number;
    totalCapitalGain: number | null;
    totalIncome: number;
    totalReturn: number | null;
    totalReturnRate: number | null;
    capitalGainRate: number | null;
    incomeRate: number | null;
    currencyGain: number;
    currencyGainRate: number;
    carriedForwardLoss: number;
    hasOpeningBalance: boolean;
    priceAsAt: string | null;
    stalePrices: boolean;
    holdings: HoldingSummary[];
    /** The dated series the XIRR was solved from. Exposed so the cash-flow
     *  identity is assertable rather than trusted. */
    cashFlows: CashFlow[];
  }
  export async function getPortfolioSummary(
    finance: FinanceApi, asOf?: string,
  ): Promise<PortfolioSummary>;
  ```

- [ ] **Step 1: Write the failing tests**

`tests/portfolio-service.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildPortfolio, expectedTotals, AS_OF } from './fixtures/portfolio.js';
import { getPortfolioSummary } from '../src/services/portfolio-service.js';
import { createTrade } from '../src/dao/trades.js';
import { rebuildDisposals } from '../src/services/trade-service.js';

describe('getPortfolioSummary', () => {
  it('values the portfolio from the current prices', async () => {
    const { finance } = await buildPortfolio();
    const s = await getPortfolioSummary(finance, AS_OF);
    const t = expectedTotals();
    expect(s.totalValue).toBeCloseTo(t.value, 2);
    expect(s.holdings).toHaveLength(3);
  });

  it('uses the PRE-AMIT cost base, so the gain is what was actually paid', async () => {
    const { finance } = await buildPortfolio();
    const s = await getPortfolioSummary(finance, AS_OF);
    const t = expectedTotals();
    expect(s.totalCostBase).toBeCloseTo(t.preAdjustmentCostBase, 2);
    expect(s.totalCapitalGain).toBeCloseTo(t.value - t.preAdjustmentCostBase, 2);
    // The post-AMIT basis would give a gain $15.26 larger.
    expect((t.value - t.costBase) - s.totalCapitalGain!).toBeCloseTo(15.26, 2);
  });

  it('reports gross income and excludes franking credits', async () => {
    const { finance } = await buildPortfolio();
    const s = await getPortfolioSummary(finance, AS_OF);
    expect(s.totalIncome).toBeCloseTo(expectedTotals().income, 2);
  });

  it('splits the total return rate into capital gain and income, and they add up', async () => {
    const { finance } = await buildPortfolio();
    const s = await getPortfolioSummary(finance, AS_OF);
    expect(s.totalReturnRate).not.toBeNull();
    expect(s.capitalGainRate! + s.incomeRate!).toBeCloseTo(s.totalReturnRate!, 6);
  });

  it('reconciles the cash flows against the capital gain and income', async () => {
    const { finance } = await buildPortfolio();
    const s = await getPortfolioSummary(finance, AS_OF);
    const sum = s.cashFlows.reduce((a, f) => a + f.amount, 0);
    // SUM flows = capitalGain + income, exactly. The gain is measured on the
    // pre-AMIT basis, which is the basis the money went in on.
    expect(sum).toBeCloseTo(s.totalCapitalGain! + s.totalIncome, 2);
  });

  it('shows a dash, not a partial total, when a holding has no price', async () => {
    const { finance, stockIds } = await buildPortfolio();
    await finance.db.table('wealthflow_prices').delete({ stock_id: stockIds.VHY });
    const s = await getPortfolioSummary(finance, AS_OF);
    expect(s.totalValue).toBeNull();
    expect(s.totalCapitalGain).toBeNull();
    expect(s.holdings.find((h) => h.stockId === stockIds.VHY)!.value).toBeNull();
    // The priced holdings still show their own values.
    expect(s.holdings.find((h) => h.stockId === stockIds.VAS)!.value).not.toBeNull();
    // With no terminal value every flow is negative, so there is no rate.
    expect(s.totalReturnRate).toBeNull();
    expect(s.capitalGainRate).toBeNull();
    expect(s.incomeRate).toBeNull();
  });

  it('counts a realised gain after a sale, drops the sold units, and books the proceeds', async () => {
    const { finance, stockIds } = await buildPortfolio();
    await createTrade(finance, {
      stock_id: stockIds.FGX, date: '2026-10-20', side: 'sell', quantity: 100, price: 1.34,
    });
    await rebuildDisposals(finance, stockIds.FGX);
    const s = await getPortfolioSummary(finance, AS_OF);
    const fgx = s.holdings.find((h) => h.stockId === stockIds.FGX)!;
    expect(fgx.units).toBe(1009);
    expect(fgx.realisedGain).not.toBe(0);
    // The sale's proceeds must appear as an inflow, or the return is wrong.
    const onSaleDay = s.cashFlows
      .filter((f) => f.date === '2026-10-20')
      .reduce((a, f) => a + f.amount, 0);
    expect(onSaleDay).toBeCloseTo(100 * 1.34, 2);
  });

  it('nets a distribution and its DRP instead of double counting them', async () => {
    const { finance } = await buildPortfolio();
    const s = await getPortfolioSummary(finance, AS_OF);
    // Group the series by date. VHY's 16 Apr 2025 paid a $54.35 distribution
    // and reinvested $70.13 on the same day, so the day's net cash is
    // -$15.78. Counting the distribution AND the DRP twice would give
    // -$139.43, and netting them away entirely would give +$54.35.
    const byDate = new Map<string, number>();
    for (const f of s.cashFlows)
      byDate.set(f.date, (byDate.get(f.date) ?? 0) + f.amount);
    expect(byDate.get('2025-04-16')).toBeCloseTo(-15.78, 2);
    expect(byDate.get('2025-07-16')).toBeCloseTo(45.71 - 73.74, 2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/portfolio-service.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/services/portfolio-service.ts`**

Read the ledger once, then compute.

**Per holding:**

1. `units` = the open quantity: the sum of parcel quantities for that stock, minus the quantity consumed by that stock's disposals.
2. `price`, `priceAsAt`, `priceSource` = `latestPrices(finance).get(stockId)` — `null` when the holding has never been priced.
3. `market` = `marketOf(stock)`. `wealthflow_stocks` has no market column and the app cannot migrate one, so market is **derived**: a single exported function `marketOf(stock): string` returns `'ASX'` for every holding today. The grouping code reads only that function, so a real market column can replace it later without touching the grouping logic.
4. `value` = `units × price`, or `null` when there is no price.
5. `costBase` = the open position's basis AS ACQUIRED — `openCostBase(...).preAdjustment`, what was actually paid. `amitShare` = the notional AMIT adjustment on it.
6. `unrealisedGain` = `value − costBase`, or `null` when there is no price.
7. `realisedGain` = sum of `nominal_gain + amit_share` over `wealthflow_disposals` for that stock, **all time**, pre-discount — the AMIT share is added back so it sits on the same pre-AMIT footing as the unrealised half.
8. `capitalGain` = `unrealisedGain + realisedGain`, or `null` when there is no price.
9. `income` = sum of `gross` over `wealthflow_dividends` for that stock, all time. `franking` = sum of `franking`.
10. `totalReturn` = `capitalGain + income`, or `null` when there is no price.

**Portfolio totals:** `totalValue`, `totalCapitalGain` and `totalReturn` are `null` if **any** holding has a `null` value; otherwise they are the sums. `totalCostBase` and `totalIncome` are always sums.

**Cash-flow series** — one combined series across all holdings:

- every buy trade: `−(price × quantity + brokerage)` on the trade date, including DRP-sourced buys
- every sell trade: `+(quantity × price)` on the trade date
- every dividend: `+gross` on the dividend date
- the terminal value: `+totalValue` on `asOf`

The sell line matters: a disposal converts units into cash, and leaving its proceeds out of the series would understate the return by the whole realised gain.

A distribution and its DRP land on the same date and net to zero, which is correct: the cash arrived, and it was immediately spent on units that are still in the terminal value.

**The series is stored on the summary as `cashFlows`.** It is the series the XIRR was solved from, exposed so the identity is assertable rather than trusted. When `totalValue` is `null` there is no terminal flow, so the series is all-negative and `xirr` returns `null`.

**Grouping the series by date must give the day's net cash.** For a DRP date that is `distribution gross − DRP cost`; for VHY's 16 Apr 2025 that is `54.35 − 70.13 = −15.78`.

**Rates:**

- `totalReturnRate` = `xirr(flows, asOf)`, or `null`.
- `capitalGainRate` and `incomeRate`: when `totalReturnRate` is `null` both are `null`. When `totalCapitalGain + totalIncome` is `0`, both are `0`. Otherwise `capitalGainRate = totalReturnRate × (totalCapitalGain / (totalCapitalGain + totalIncome))` and `incomeRate = totalReturnRate − capitalGainRate`.
- `currencyGain` = `0` and `currencyGainRate` = `0` while every holding is AUD.

**Also carried:**

- `carriedForwardLoss` and `hasOpeningBalance` from `carriedForwardFor(finance, computeFinanceYear(asOf, '07-01') ?? '')`, using `computeFinanceYear` from `src/utils/finance-year.js`.
- `priceAsAt` = the **oldest** price date across the priced holdings, because a portfolio value is no more current than its stalest input. `null` when nothing is priced.
- `stalePrices` = `true` when `priceAsAt` is more than 7 days before `asOf`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/portfolio-service.test.ts`
Expected: PASS.

- [ ] **Step 5: Expose the summary on the public wealth service**

In `src/services/public-wealth-adapter.ts`, add `getPortfolioSummary(financialYear: string)` to the `PublicWealthService` interface and to the returned object. It calls `getPortfolioSummary(finance, ...)` and returns `null` on error, matching the other methods' contract — taxflow consumes the capital-gains method the same way.

- [ ] **Step 6: Stage and show the diff**

```bash
git add src/services/portfolio-service.ts src/services/public-wealth-adapter.ts tests/portfolio-service.test.ts
git diff --cached
```

Suggested commit message: `feat: add the portfolio summary service`

---

### Task 7: The Trades Summary element

**Files:**
- Create: `src/ui/trades-summary.ts`
- Create: `tests/trades-summary.test.ts`
- Modify: `src/ui/index.ts`

**Interfaces:**
- Consumes: `getPortfolioSummary` and `PortfolioSummary` from `src/services/portfolio-service.js`; `formatAUD` from `src/utils/format.js`; `sharedStyles` from `src/styles/shared-styles.js`; `portfolioStyles` from `src/styles/portfolio-styles.js`.
- Produces: custom element `<trades-summary>` with public properties `finance`, `asOf`, `summary: PortfolioSummary | null`, `error: string`, and getters `cardLabels: string[]` and `valueLabel: string`.

- [ ] **Step 1: Write the failing test**

`tests/trades-summary.test.ts`:

```ts
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { buildPortfolio, expectedTotals, AS_OF } from './fixtures/portfolio.js';
import { formatAUD } from '../src/utils/format.js';
import '../src/ui/trades-summary.js';

describe('trades-summary', () => {
  it('shows the five cards', async () => {
    const { finance } = await buildPortfolio();
    const el: any = document.createElement('trades-summary');
    document.body.appendChild(el);
    el.asOf = AS_OF;
    await el.setFinance(finance);
    await el.updateComplete;
    expect(el.summary.totalValue).toBeCloseTo(expectedTotals().value, 2);
    expect(el.summary.totalReturnRate).not.toBeNull();
    await el.updateComplete;
    el.remove();
  });

  it('shows a dash rather than a partial value when a price is missing', async () => {
    const { finance, stockIds } = await buildPortfolio();
    await finance.db.table('wealthflow_prices').delete({ stock_id: stockIds.VAS });
    const el: any = document.createElement('trades-summary');
    document.body.appendChild(el);
    el.asOf = AS_OF;
    await el.setFinance(finance);
    await el.updateComplete;
    expect(el.summary.totalValue).toBeNull();
    expect(el.valueLabel).toBe('—');
    await el.updateComplete;
    el.remove();
  });

  it('exposes the card order and the value it renders', async () => {
    const { finance } = await buildPortfolio();
    const el: any = document.createElement('trades-summary');
    document.body.appendChild(el);
    el.asOf = AS_OF;
    await el.setFinance(finance);
    await el.updateComplete;
    expect(el.cardLabels).toEqual([
      'Portfolio value',
      'Capital gain',
      'Income',
      'Currency gain',
      'Total return',
    ]);
    expect(el.valueLabel).toBe(formatAUD(expectedTotals().value));
    await el.updateComplete;
    el.remove();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/trades-summary.test.ts`
Expected: FAIL — element not defined.

- [ ] **Step 3: Implement `src/ui/trades-summary.ts`**

A Lit element in the shape of `src/ui/cgt-section.ts`:

- `finance: any = null`, `asOf = ''`, `summary: PortfolioSummary | null = null`, `error = ''`.
- `async setFinance(f)` sets `finance` and calls `await this.reload()`.
- `async reload()` calls `getPortfolioSummary(this.finance, this.asOf || undefined)`, catching errors into `this.error`. It sets `this.asOf` to the summary's `asOf` when it succeeds, so the element remembers what it was asked for.
- `get cardLabels(): string[]` returns the five labels in order — exposed so the order is assertable without scraping the shadow DOM.
- `get valueLabel(): string` returns `formatAUD(this.summary?.totalValue ?? 0)` when there is a value, and `'—'` when `totalValue` is `null`.

`render()` produces a `.portfolio-cards` row of five `.portfolio-card` cards, each with a label, a value and a note:

| Card | Value | Note |
| --- | --- | --- |
| Portfolio value | `formatAUD(totalValue)` or `—` | `As of <priceAsAt>` |
| Capital gain | `<rate>% p.a.` | `formatAUD(totalCapitalGain)` |
| Income | `<rate>% p.a.` | `formatAUD(totalIncome)` |
| Currency gain | `0.00% p.a.` | `formatAUD(currencyGain)` |
| Total return | `<rate>% p.a.` | `formatAUD(totalReturn)` |

A rate of `null` renders as `—`, never `0.00%`. The rate is formatted to 2dp with a `%` suffix.

Below the cards, a `.portfolio-note` footnote states that the capital gain and income rates are **allocations of the total return rate**, not independent IRRs, and that the capital gain is unrealised-plus-realised measured before the 50% discount.

When `stalePrices` is true, show a warning line: "Prices are from <priceAsAt> — older than 7 days."

- [ ] **Step 4: Register the element**

In `src/ui/index.ts`, import `TradesSummary` and register it as `trades-summary`, following the existing guarded pattern.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- tests/trades-summary.test.ts`
Expected: PASS.

- [ ] **Step 6: Stage and show the diff**

```bash
git add src/ui/trades-summary.ts src/ui/index.ts tests/trades-summary.test.ts
git diff --cached
```

Suggested commit message: `feat: add the Trades Summary cards`

---

### Task 8: The Investment table element

**Files:**
- Create: `src/ui/investment-table.ts`
- Create: `tests/investment-table.test.ts`
- Modify: `src/ui/index.ts`

**Interfaces:**
- Consumes: `getPortfolioSummary` and `HoldingSummary` from `src/services/portfolio-service.js`; `insertPrice` from `src/dao/prices.js`; `formatAUD` from `src/utils/format.js`; `sharedStyles`; `portfolioStyles`.
- Produces: custom element `<investment-table>` with public properties `finance`, `asOf`, `summary: PortfolioSummary | null`, `mode: 'aud' | 'percent'`, `split: boolean`, `editing: boolean`, `error: string`, the getters `rows` and `totals`, and the method `async savePrices(entries: { stockId: number; price: number }[]): Promise<void>`.

- [ ] **Step 1: Write the failing test**

`tests/investment-table.test.ts`:

```ts
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { buildPortfolio, expectedTotals, AS_OF } from './fixtures/portfolio.js';
import { latestPrices } from '../src/dao/prices.js';
import '../src/ui/investment-table.js';

describe('investment-table', () => {
  it('shows one row per holding and a totals row', async () => {
    const { finance } = await buildPortfolio();
    const el: any = document.createElement('investment-table');
    document.body.appendChild(el);
    el.asOf = AS_OF;
    await el.setFinance(finance);
    await el.updateComplete;
    expect(el.rows).toHaveLength(3);
    expect(el.totals.value).toBeCloseTo(expectedTotals().value, 2);
    await el.updateComplete;
    el.remove();
  });

  it('splits the capital gain into realised and unrealised without changing the total', async () => {
    const { finance } = await buildPortfolio();
    const el: any = document.createElement('investment-table');
    document.body.appendChild(el);
    el.asOf = AS_OF;
    await el.setFinance(finance);
    await el.updateComplete;
    const before = el.rows.map((r: any) => r.capitalGain);
    el.split = true;
    await el.updateComplete;
    const after = el.rows.map((r: any) => r.realisedGain + r.unrealisedGain);
    expect(after).toEqual(before);
    await el.updateComplete;
    el.remove();
  });

  it('switches every money column to a percentage of portfolio value', async () => {
    const { finance } = await buildPortfolio();
    const el: any = document.createElement('investment-table');
    document.body.appendChild(el);
    el.asOf = AS_OF;
    await el.setFinance(finance);
    await el.updateComplete;
    el.mode = 'percent';
    await el.updateComplete;
    const pcts = el.rows.map((r: any) => r.valuePercent);
    expect(pcts.reduce((a: number, b: number) => a + b, 0)).toBeCloseTo(100, 6);
    await el.updateComplete;
    el.remove();
  });

  it('records a price as a new history row rather than overwriting', async () => {
    const { finance, stockIds } = await buildPortfolio();
    const el: any = document.createElement('investment-table');
    document.body.appendChild(el);
    el.asOf = AS_OF;
    await el.setFinance(finance);
    await el.updateComplete;
    const before = (await latestPrices(finance)).size;
    await el.savePrices([{ stockId: stockIds.VAS, price: 120 }]);
    expect((await latestPrices(finance)).size).toBe(before);
    expect((await latestPrices(finance)).get(stockIds.VAS)!.price).toBe(120);
    await el.updateComplete;
    el.remove();
  });

  it('leaves an unpriced holding as a dash', async () => {
    const { finance, stockIds } = await buildPortfolio();
    await finance.db.table('wealthflow_prices').delete({ stock_id: stockIds.FGX });
    const el: any = document.createElement('investment-table');
    document.body.appendChild(el);
    el.asOf = AS_OF;
    await el.setFinance(finance);
    await el.updateComplete;
    const row = el.rows.find((r: any) => r.stockId === stockIds.FGX);
    expect(row.value).toBeNull();
    expect(row.valueLabel).toBe('—');
    await el.updateComplete;
    el.remove();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/investment-table.test.ts`
Expected: FAIL — element not defined.

- [ ] **Step 3: Implement `src/ui/investment-table.ts`**

Public properties: `finance`, `asOf`, `summary`, `mode: 'aud' | 'percent' = 'aud'`, `split = false`, `editing = false`, `error = ''`.

`get rows()` returns the holdings mapped to a row shape that carries both the raw numbers and the labels the UI renders:

```ts
{
  stockId, code, name, market, units,
  price: number | null, priceLabel: string,
  value: number | null, valueLabel: string, valuePercent: number | null,
  capitalGain: number | null, capitalGainLabel: string,
  realisedGain: number, unrealisedGain: number | null,
  income: number, incomeLabel: string,
  currency: number, currencyLabel: string,
  totalReturn: number | null, totalReturnLabel: string,
}
```

`valuePercent` is `value / totalValue × 100` when both exist, otherwise `null`.

`get totals()` returns the same shape for the totals row, with `value` `null` when any holding is unpriced.

`async savePrices(entries)` inserts one `wealthflow_prices` row per entry with `as_at` = today and `source: 'manual'`, then calls `await this.reload()`. It is the **only** place a price is written from the UI.

`render()` produces:

- a header row: holding name, then the mode toggle (`AUS` / `%`), the "Split gains & losses" switch, and the "Edit table" button.
- a subtitle line: `Since first purchase | Grouped by Market | Open positions only`.
- a `.portfolio-table` with the columns **Holding · Price · Quantity · Value · Capital gain · Income · Currency · Return**. When `split` is true, the Capital gain column becomes two columns, **Unrealised** and **Realised**.
- market group header rows using `.portfolio-group-row` (currently one group, `ASX`).
- a totals row using `.portfolio-totals`.

In `percent` mode every money column renders as a percentage of portfolio value instead of an amount. The labels switch with the mode, and in percent mode the value label is `'—'` when the value is unknown.

In `editing` mode the Price cell renders an input whose value is the current price; the "Edit table" button becomes "Done", and a Save action calls `savePrices` with the parsed values. A blank or non-numeric price is refused with a message rather than stored as `0`.

- [ ] **Step 4: Register the element**

In `src/ui/index.ts`, import `InvestmentTable` and register it as `investment-table`, following the existing guarded pattern.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- tests/investment-table.test.ts`
Expected: PASS.

- [ ] **Step 6: Stage and show the diff**

```bash
git add src/ui/investment-table.ts src/ui/index.ts tests/investment-table.test.ts
git diff --cached
```

Suggested commit message: `feat: add the Investment holdings table`

---

### Task 9: The Trades page as four sections

**Files:**
- Modify: `src/ui/trades-view.ts`
- Modify: `tests/trades-view.test.ts`

**Interfaces:**
- Consumes: the `<trades-summary>` and `<investment-table>` elements from Tasks 7 and 8; `trade-form`, `trade-log` and `parcel-ledger` (existing elements, reused unchanged).
- Produces: `TradesView` with public properties `finance`, `error`, `showForm = true`, `collapsed: { summary: boolean; investment: boolean; trades: boolean; parcels: boolean }`, `parcelCount`, `tradeCount`, `holdingCount`, and the method `async reload(): Promise<void>`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/trades-view.test.ts`:

```ts
it('renders four sections on one page, with no segment control', async () => {
  const f: any = createMockFinance();
  await createStock(f, { stock_code: 'VAS', stock_full_name: 'V', shares: 0 });
  const el: any = document.createElement('trades-view');
  document.body.appendChild(el);
  await el.setFinance(f);
  await el.updateComplete;
  expect(el.renderRoot.querySelectorAll('.section').length).toBe(4);
  expect(el.renderRoot.querySelector('.segment')).toBeNull();
  await el.updateComplete;
  el.remove();
});

it('collapses the parcels ledger by default and leaves the rest open', async () => {
  const f: any = createMockFinance();
  await createStock(f, { stock_code: 'VAS', stock_full_name: 'V', shares: 0 });
  const el: any = document.createElement('trades-view');
  document.body.appendChild(el);
  await el.setFinance(f);
  await el.updateComplete;
  expect(el.collapsed.parcels).toBe(true);
  expect(el.collapsed.summary).toBe(false);
  expect(el.collapsed.investment).toBe(false);
  expect(el.collapsed.trades).toBe(false);
  await el.updateComplete;
  el.remove();
});

it('gives every section header a count badge', async () => {
  const f: any = createMockFinance();
  await createStock(f, { stock_code: 'VAS', stock_full_name: 'V', shares: 0 });
  const el: any = document.createElement('trades-view');
  document.body.appendChild(el);
  await el.setFinance(f);
  await el.updateComplete;
  expect(el.holdingCount).toBe(1);
  expect(el.tradeCount).toBe(0);
  expect(el.parcelCount).toBe(0);
  await el.updateComplete;
  el.remove();
});

it('still reveals the form when a trade is edited', async () => {
  const f: any = createMockFinance();
  const s: any = await createStock(f, { stock_code: 'VAS', stock_full_name: 'V', shares: 0 });
  await createTrade(f, { stock_id: s.id, date: '2024-03-15', side: 'buy', quantity: 20, price: 95.4, brokerage: 3 });
  const el: any = document.createElement('trades-view');
  document.body.appendChild(el);
  await el.setFinance(f);
  await el.updateComplete;
  el.dispatchEvent(new CustomEvent('trade-edit-request', {
    detail: { trade: { id: 1, stock_id: s.id, date: '2024-03-15', side: 'buy', quantity: 20, price: 95.4, brokerage: 3, source: 'manual', dividend_id: null, notes: null } },
    bubbles: true, composed: true,
  }));
  await flush();
  expect(el.showForm).toBe(true);
  await el.updateComplete;
  el.remove();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/trades-view.test.ts`
Expected: FAIL — the element still renders one section and a segment control.

- [ ] **Step 3: Rewrite `src/ui/trades-view.ts` as the page container**

Remove the `segment` property and the `setSegment` method entirely. Replace `render()` with four `.section.flush` blocks, in this order:

| Section | Header title | Body |
| --- | --- | --- |
| 1 | `Trades Summary` | `<trades-summary>` |
| 2 | `Investment` | `<investment-table>` |
| 3 | `Trades` | `<trade-form>` (when `showForm`) and `<trade-log>` |
| 4 | `Parcels` | `<parcel-ledger>` |

Each section header carries a collapse toggle (the affordance `src/ui/cgt-section.ts` already uses) and a count badge:

- Trades Summary → `holdingCount`
- Investment → `holdingCount`
- Trades → `tradeCount`
- Parcels → `parcelCount`

Default collapse state: `summary: false, investment: false, trades: false, parcels: true`.

The counts come from the ledger, not from the children: `tradeCount` = the number of trades, `parcelCount` = the number of parcels, `holdingCount` = the number of stocks with an open quantity greater than zero.

The Trades section header keeps its "Log buy / Hide form" action. The Parcels section header keeps its "N parcels" badge — the same count, so the badge and the section header agree.

`pushToChildren()` now walks `['trades-summary', 'investment-table', 'trade-form', 'trade-log', 'parcel-ledger']` instead of the old three, and awaits `setFinance` or `reload` on each.

`_onEditRequest` drops `this.segment = 'trades'` and keeps `this.showForm = true`.

`reload()` keeps calling `rebuildAllParcels` — this element remains the one place trades change — and additionally sets `tradeCount`, `parcelCount` and `holdingCount` from the loaded data.

**The page rebuilds once per load, then pushes to all four sections.** The rebuild happens in `reload()` before `pushToChildren()`, so the Trades Summary and Investment sections read fresh parcels rather than triggering their own rebuild. Derived state has one writer and one rebuild per page load.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/trades-view.test.ts`
Expected: PASS. The existing tests in that file that assert the segment control must be **deleted**, because the toggle is intentionally gone.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: all files PASS.

- [ ] **Step 6: Stage and show the diff**

```bash
git add src/ui/trades-view.ts tests/trades-view.test.ts
git diff --cached
```

Suggested commit message: `feat: restructure the Trades page into four sections`

---

### Task 10: Apply the style pass

**Files:**
- Modify: `src/ui/trades-summary.ts`
- Modify: `src/ui/investment-table.ts`
- Modify: `src/ui/trades-view.ts`
- Modify: `src/ui/cgt-section.ts`

**Interfaces:**
- Consumes: `portfolioStyles` from `src/styles/portfolio-styles.js` (Task 2).
- Produces: nothing new.

- [ ] **Step 1: Apply the styles to the five screens**

- `trades-summary.ts` — add `portfolioStyles` to its `static styles` alongside `sharedStyles`, and render the cards with the `.portfolio-cards` / `.portfolio-card` classes and the footnote with `.portfolio-note`.
- `investment-table.ts` — add `portfolioStyles`; render the table with `.portfolio-table`, the market rows with `.portfolio-group-row` and the totals row with `.portfolio-totals`.
- `trades-view.ts` — add `portfolioStyles`; keep the existing `.section` / `.section-header` / `.section-body` layout classes for the four section blocks so they match the rest of the app.
- `cgt-section.ts` — add `portfolioStyles`; give its stat row the `.portfolio-cards` treatment so the Overview's capital-gains cards read as the same component as the Trades Summary cards.

- [ ] **Step 2: Run the whole suite**

Run: `npm test`
Expected: all files PASS. The styling change must not alter behaviour — a test that was green before is green now.

- [ ] **Step 3: Run the formatter**

Run:
```bash
npx prettier --check --single-quote "src/main.ts" "src/dao/**/*.ts" "src/services/**/*.ts" "src/ui/**/*.ts" "src/utils/**/*.ts" "src/mock/**/*.ts" "src/shared/**/*.ts" "scripts/**/*.mjs" "vite.config.ts" "index.html" "tests/**/*.ts"
```
Expected: `All matched files use Prettier code style!`. If not, run the same command with `--write`.

- [ ] **Step 4: Stage and show the diff**

```bash
git add src/ui/trades-summary.ts src/ui/investment-table.ts src/ui/trades-view.ts src/ui/cgt-section.ts
git diff --cached
```

Suggested commit message: `style: apply the shared portfolio styling across the five screens`

---

### Task 11: Version bump and final verification

**Files:**
- Modify: `package.json` (`version` and `financeExtension.version`)

**Interfaces:**
- Consumes: everything from Tasks 1–10.
- Produces: nothing new.

- [ ] **Step 1: Bump the version**

Edit `package.json` so both `version` and `financeExtension.version` are `0.2.6`. Patch only — never a minor release, never a reset.

Do **not** run `npm run build` or `npm run build -- bump`. No release.

- [ ] **Step 2: Run the whole suite**

Run: `npm test`
Expected: all files PASS.

- [ ] **Step 3: Run the importer's audits**

Run: `node scripts/import-sharesight.mjs`
Expected: all 9 `PASS` lines. The importer is read-only and must be unaffected by this work.

- [ ] **Step 4: Check the formatter**

Run:
```bash
npx prettier --check --single-quote "src/main.ts" "src/dao/**/*.ts" "src/services/**/*.ts" "src/ui/**/*.ts" "src/utils/**/*.ts" "src/mock/**/*.ts" "src/shared/**/*.ts" "scripts/**/*.mjs" "vite.config.ts" "index.html" "tests/**/*.ts"
```
Expected: clean.

- [ ] **Step 5: Stage and show the diff**

```bash
git add package.json
git diff --cached
```

Suggested commit message: `chore: bump to 0.2.6`

---

## Execution Notes

- **Do not commit.** Every task ends with a staged diff and a suggested message. Nothing is committed.
- **Do not release.** No build, no install, no `npm run build -- bump`.
- Tasks 1–5 are independent of each other apart from Task 3's dependency on Task 1's DAO. Tasks 6–9 are strictly sequential: each consumes the interfaces the previous one produces.
- The riskiest task is **Task 9** — it rewrites a screen that currently works. It is the one to review most carefully, and the one where a shipped mistake would be noticed immediately by a user.
