# Wealthflow (Bank + Stock) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the single-tab `wealthflow` extension — Bank masters + monthly interest grid + Stock holdings + dividend log + Overview — with 4 tables, Lit orchestrator UI, and a `wealthflow` domain service for Tax/dashboard consumers.

**Architecture:** Single `wealthflow` view hosts a `wealthflow-orchestrator` Lit element; child views (`bank-list`, `interest-grid`, `interest-form`, `bank-form`, `stock-list`, `dividend-log`, `dividend-form`, `overview-view`) render inside it driven by global FY state. Typed `src/dao/*.ts` wrappers own all `finance.db.table()` access; `src/services/*.ts` own validation/aggregation; `src/services/public-wealth-adapter.ts` exposes the 3-method JSON-safe cross-extension service. Bank ships first, Stock second, Overview+service last.

**Tech Stack:** TypeScript strict, Lit 3 (`LitElement`, `html`, `css`), Vite 5 lib build (`finance` external), `finance-logger` (`ExtensionLogger`), `Intl.NumberFormat('en-AU')`, vitest + happy-dom for unit tests, in-memory `src/mock/finance-mock.ts` for `npm run dev`.

---

## 0. File map (create / modify / never touch)

**Modify:**
- `package.json` — full `financeExtension` manifest (views/commands/navigation/tables/allowlists) + `version` bump discipline + `vitest`/`happy-dom` devDeps + `test` script.
- `src/main.ts` — dual-context `activate`/`deactivate`, 5 commands, service register/unregister, orchestrator mount + `mount-update` listener.
- `src/ui/index.ts` — register orchestrator + 8 child views.
- `index.html` — `VIEWS` array lists all tags for dev dropdown.

**Create:**
- `src/utils/finance-year.ts` — `computeFinanceYear`, `normalizeFinanceYear`, `monthKey`, `monthEnd`, `fyMonths`, `isValidIsoDate`.
- `src/utils/format.ts` — `formatAUD`, `maskAccount`, `formatBSB`, `monthLabel`.
- `src/dao/banks.ts` — `Bank`, `BankInput`, `listBanks`, `createBank`, `updateBank`, `setBankActive`.
- `src/dao/interest-entries.ts` — `InterestEntry`, `createInterestEntry` (once-per-month guard), `updateInterestEntry`, `deleteInterestEntry`, `listInterestEntries`.
- `src/dao/stocks.ts` — `Stock`, `createStock` (uppercase+global-unique), `updateStock`, `setStockActive`.
- `src/dao/dividends.ts` — `DividendEntry`, `createDividend`, `updateDividend`, `deleteDividend`, `listDividends`.
- `src/services/bank-service.ts` — `validateBankInput`, `validateInterestInput`, `sumInterestByBank`, `interestGridModel`.
- `src/services/stock-service.ts` — `validateStockInput`, `validateDividendInput`, `DIVIDEND_TYPES`, `sumDividends`.
- `src/services/public-wealth-adapter.ts` — `createPublicWealthAdapter` with `getInterestSummary`, `getDividendSummary`, `getOverviewSummary` (+ TS interfaces).
- `src/ui/wealthflow-orchestrator.ts` — tab bar + global FY selector + footer + child switch + event wiring.
- `src/ui/bank-list.ts`, `src/ui/interest-grid.ts`, `src/ui/interest-form.ts`, `src/ui/bank-form.ts`
- `src/ui/stock-list.ts`, `src/ui/dividend-log.ts`, `src/ui/dividend-form.ts`, `src/ui/overview-view.ts`
- `src/ui/wealthflow-view.ts` — DELETE (replaced by orchestrator; keep tag only if needed as alias — prefer delete).
- `tests/*.test.ts` — one per task below (vitest, happy-dom, stub FinanceApi).

**Never touch (overwritten by `refresh`):** `src/finance.d.ts`, `src/vite-env.d.ts`, `src/vendor/**`, `src/styles/**`. Custom CSS goes in `static styles` inside each view file or a new `src/styles/wealthflow-styles.ts` (not vendored).

---

## 1. Tables — exact manifest (spec §3)

`package.json` `financeExtension.tables` declares all four at scaffold time (build order §4 never exposes dead buttons because nav items for Stocks/Dividends/Overview are added only when their views land — Task 1 declares Bank nav first, Task 14 adds Stock/Overview nav).

```json
"tables": [
  { "name": "wealthflow_banks", "columns": [
    { "name": "name", "type": "text", "nullable": false },
    { "name": "bsb", "type": "text", "nullable": true },
    { "name": "account_number", "type": "text", "nullable": false },
    { "name": "is_active", "type": "boolean", "nullable": false, "default": true },
    { "name": "notes", "type": "text", "nullable": true }
  ]},
  { "name": "wealthflow_interest_entries", "columns": [
    { "name": "bank_id", "type": "integer", "nullable": false },
    { "name": "date", "type": "date", "nullable": false },
    { "name": "amount", "type": "real", "nullable": false, "min": 0 },
    { "name": "finance_year", "type": "text", "nullable": false },
    { "name": "notes", "type": "text", "nullable": true }
  ]},
  { "name": "wealthflow_stocks", "columns": [
    { "name": "code", "type": "text", "nullable": false },
    { "name": "name", "type": "text", "nullable": false },
    { "name": "shares", "type": "real", "nullable": false, "min": 0 },
    { "name": "is_active", "type": "boolean", "nullable": false, "default": true },
    { "name": "notes", "type": "text", "nullable": true }
  ]},
  { "name": "wealthflow_dividends", "columns": [
    { "name": "stock_id", "type": "integer", "nullable": false },
    { "name": "date", "type": "date", "nullable": false },
    { "name": "type", "type": "text", "nullable": false },
    { "name": "gross", "type": "real", "nullable": false, "min": 0 },
    { "name": "franking", "type": "real", "nullable": false, "min": 0, "default": 0 },
    { "name": "finance_year", "type": "text", "nullable": false },
    { "name": "notes", "type": "text", "nullable": true }
  ]}
]
```

Rules locked here (enforced app-side, not DDL — installer has no expression-unique indexes):
- `id`/`created_at`/`updated_at` auto-added — never declare.
- `bsb`/`account_number` are TEXT (leading zeros). `shares`/`amount`/`gross`/`franking` are REAL, `min: 0`.
- `wealthflow_banks.name`: duplicate-among-active = warning only. `wealthflow_stocks.code`: globally UNIQUE across active+inactive, uppercase-normalized on write; re-buy = reactivate.
- `wealthflow_interest_entries`: one row per `(bank_id, YYYY-MM)`; `bank_id` must exist and be active for new rows. `wealthflow_dividends`: no month rule; `stock_id` must exist; inactive stocks allowed (history).
- `finance_year` auto-filled via `computeFinanceYear(date, core.financialYear.start)`; user override allowed + amber mismatch callout.
- No `foreign_offset` column in v1 (deferred to Tax-driven migration). No `currency` column (single-currency AUD domain). No rate column (opted out §1).

---

## 2. UI — detailed contract (spec §5)

Single panel identity `wealthflow`. Orchestrator owns: `tab: 'banks'|'stocks'|'dividends'|'overview'`, `fy: string` (e.g. `2025-2026`), `statusFilter: 'active'|'inactive'|'all'`. One FY `<select>` in the child-tab bar rules every child + footer + Overview. Child retarget via `finance.ui.requestMount('wealthflow', { view: '<child>' })` → panel `mount-update` → `orchestrator.init(finance, mount)`.

```
┌ Wealth Flow ── [Banks|Stocks|Dividends|Overview] ── [FY: 2025–2026 ▾] ┐
│ Banks: ○ Active ○ Inactive ○ All                                      │
│ ● Macquarie  012-345 •••4567   FY $25.93                              │
│     [Add interest] [Edit] [Deactivate]                                │
│ Interest grid FY 2025–2026: months × active-bank columns + Total col   │
│ Overview: 3 cards (Dividends / Interest / Combined)                   │
│ Footer: FY 2025–2026 total (context): $52.19  [+ Add Bank]...         │
└───────────────────────────────────────────────────────────────────────┘
```

Per-child spec:
- `bank-list` / `stock-list`: status badge, Active/Inactive/All radio, per-row FY figure (bank: interest total; stock: gross + franking), per-row `[Add entry] [Edit inline] [Deactivate|Activate]`. Inline edit: name/BSB/account/shares in-row, Enter saves, Esc cancels, inline field errors. Deactivate → `confirm()` modal; muted row style. Deactivated excluded from new-entry dropdowns, included in all totals.
- `interest-grid` (primary entry path): 12 month-rows × N active-bank columns for selected FY + row Total + column Total + grand Total. Tab moves across cells. Typing a cell creates/updates that bank-month entry (date recorded as month-end via `monthEnd(fyMonth)`). Duplicate-month impossible by construction here. `wealthflow.add-interest` focuses current-month cell. Grid renders totals; footer sums the SAME query (single totals implementation — footer calls `sumInterestByBank`, grid calls `interestGridModel` which delegates to it).
- `interest-form` / `dividend-form`: corrections/overflow. Bank/stock dropdown (interest: active only; dividends: all incl. inactive), date, amount/gross+franking, auto `finance_year` + amber mismatch callout, notes, field errors, delete with `confirm()` for entries.
- `bank-form`: new-bank only (name, BSB, account, notes). Stock creation lives inline in `stock-list` (code+name+shares row) — no separate stock-form in v1.
- `dividend-log`: filterable table `date | stock | type | gross | franking` by stock dropdown + FY (global FY still rules; stock filter is local). Type labels: `Non Trust` / `Trust (ETF)` / `Foreign`.
- `overview-view`: three cards for global FY — Dividends (gross + franking + NT/Trust/F split), Interest (total, `[→ Banks]` deep-link button dispatching `wealthflow-navigate {view:'banks'}`), Combined (`gross = div.gross + int.total`, `franking = div.franking`). Empty → per-card hints, never errors. No-FY-rows → `$0.00`.
- Formatting (all display-only, storage plain): `formatAUD` = `Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'})`; `maskAccount('1234567')` → `•••4567`; `formatBSB('012345')` → `012-345` (invalid → raw); `monthLabel('2025-07')` → `Jul 2025`.
- Events allowlist (exact names): `bank-create`, `bank-edit`, `bank-activate`, `bank-deactivate`, `interest-create`, `interest-edit`, `interest-delete`, `stock-create`, `stock-edit`, `stock-activate`, `stock-deactivate`, `dividend-create`, `dividend-edit`, `dividend-delete`, `fy-changed`, `wealthflow-navigate`. Bubbles+composed `CustomEvent`s; orchestrator listens in `connectedCallback`, removes in `disconnectedCallback`.
- Layout classes from vendored `ext-layout.css`: `.topbar` (crumb + spacer + FY select + actions), `.view-container` / `.view-container-inner`, `.table-wrap`, `.section`, `.field-error`, `.filter-btn`, `.btn-primary`. Accent via `var(--ff-accent)` only.

---

## 3. Domain service — detailed contract (spec §7, ADR-0005 consumer-driven)

Registered name `wealthflow` in `activate()`, unregistered in `deactivate()`. Thin wrappers, JSON-safe only, `null` on any error (consumers degrade gracefully). History rule: sums INCLUDE deactivated banks/stocks (closed accounts are taxable history) — documented in code + plan tests.

```ts
export interface InterestSummaryByBank { bankId: number; name: string; total: number; }
export interface InterestSummary { financialYear: string; total: number; byBank: InterestSummaryByBank[]; }
export interface DividendTypeSplit { gross: number; franking: number; }
export interface DividendSummaryByStock { stockId: number; code: string; name: string; gross: number; franking: number; }
export interface DividendSummary {
  financialYear: string; gross: number; franking: number;
  byType: { non_trust: DividendTypeSplit; trust: DividendTypeSplit; foreign: DividendTypeSplit; };
  byStock: DividendSummaryByStock[];
}
export interface OverviewSummary {
  financialYear: string;
  dividends: DividendSummary;
  interest: InterestSummary;
  combined: { gross: number; franking: number; };
}
export interface PublicWealthService {
  getInterestSummary(financialYear: string): Promise<InterestSummary | null>;
  getDividendSummary(financialYear: string): Promise<DividendSummary | null>;
  getOverviewSummary(financialYear: string): Promise<OverviewSummary | null>;
}
export function createPublicWealthAdapter(finance: FinanceApi): PublicWealthService;
```

- `getInterestSummary('2025-2026')` → `{ financialYear, total, byBank }`. Ships at Bank milestone, contract-stable after.
- `getDividendSummary` → gross/franking + `byType` 3-way split + `byStock`. Empty FY → zeros (not null). Null only on exception.
- `getOverviewSummary` → reuses the other two internally; `combined.gross = dividends.gross + interest.total`; `combined.franking = dividends.franking` (interest has no franking).
- Consumers: dashboard card (totals+breakdowns), Tax (`getOverviewSummary` is the designed taxable-income input). Monthly series NOT exposed (no caller — YAGNI).
- Rounding: `Math.round(n*100)/100` at aggregation boundaries only.

---

### Task 1: Manifest + test toolchain (scaffold for full surface)

**Files:**
- Modify: `package.json`
- Test: `tests/manifest.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/manifest.test.ts
import { describe, it, expect } from 'vitest';
import pkg from '../package.json';
describe('manifest', () => {
  it('declares single view, 5 commands, 4 tables', () => {
    const fe: any = (pkg as any).financeExtension;
    expect(fe.id).toBe('wealthflow');
    expect(fe.contributions.views).toHaveLength(1);
    expect(fe.contributions.views[0].id).toBe('wealthflow');
    const ids = fe.contributions.commands.map((c: any) => c.id).sort();
    expect(ids).toEqual([
      'wealthflow.add-dividend',
      'wealthflow.add-interest',
      'wealthflow.show-banks',
      'wealthflow.show-overview',
      'wealthflow.show-stocks',
    ].sort());
    expect(fe.tables.map((t: any) => t.name).sort()).toEqual([
      'wealthflow_banks',
      'wealthflow_dividends',
      'wealthflow_interest_entries',
      'wealthflow_stocks',
    ].sort());
    for (const id of ids) expect(fe.contributions.allowedCommands).toContain(id);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/manifest.test.ts`
Expected: FAIL (missing vitest / commands / tables).

- [ ] **Step 3: Write minimal implementation** — replace `package.json` `financeExtension` block + add devDeps/script:

```json
{
  "name": "wealthflow",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/main.ts",
  "financeExtension": {
    "id": "wealthflow",
    "displayName": "Wealth Flow",
    "version": "0.1.0",
    "description": "Bank interest + stock dividends by financial year.",
    "themeColor": "#6366F1",
    "activationEvents": ["onView:wealthflow"],
    "contributions": {
      "views": [{ "id": "wealthflow", "name": "Wealth Flow", "icon": "assets/icon.svg", "openCommand": "wealthflow.show-banks" }],
      "commands": [
        { "id": "wealthflow.show-banks", "title": "Wealth Flow: Show Banks" },
        { "id": "wealthflow.add-interest", "title": "Wealth Flow: Add Interest" },
        { "id": "wealthflow.show-stocks", "title": "Wealth Flow: Show Stocks" },
        { "id": "wealthflow.add-dividend", "title": "Wealth Flow: Add Dividend" },
        { "id": "wealthflow.show-overview", "title": "Wealth Flow: Show Overview" }
      ],
      "navigation": [
        { "id": "wealthflow-banks", "label": "Banks", "command": "wealthflow.show-banks", "group": "Wealth" },
        { "id": "wealthflow-add-interest", "label": "Add Interest", "command": "wealthflow.add-interest", "group": "Wealth" },
        { "id": "wealthflow-stocks", "label": "Stocks", "command": "wealthflow.show-stocks", "group": "Wealth" },
        { "id": "wealthflow-add-dividend", "label": "Add Dividend", "command": "wealthflow.add-dividend", "group": "Wealth" },
        { "id": "wealthflow-overview", "label": "Overview", "command": "wealthflow.show-overview", "group": "Wealth" }
      ],
      "configuration": [
        { "key": "wealthflow.themeColor", "type": "string", "label": "Accent color (hex).", "default": "#6366F1", "pattern": "^#[0-9A-Fa-f]{6}$", "formatHint": "#RRGGBB", "placeholder": "#6366F1" }
      ],
      "allowedCommands": ["wealthflow.show-banks", "wealthflow.add-interest", "wealthflow.show-stocks", "wealthflow.add-dividend", "wealthflow.show-overview"],
      "allowedUiEvents": ["bank-create", "bank-edit", "bank-activate", "bank-deactivate", "interest-create", "interest-edit", "interest-delete", "stock-create", "stock-edit", "stock-activate", "stock-deactivate", "dividend-create", "dividend-edit", "dividend-delete", "fy-changed", "wealthflow-navigate"]
    },
    "tables": [
      { "name": "wealthflow_banks", "columns": [
        { "name": "name", "type": "text", "nullable": false },
        { "name": "bsb", "type": "text", "nullable": true },
        { "name": "account_number", "type": "text", "nullable": false },
        { "name": "is_active", "type": "boolean", "nullable": false, "default": true },
        { "name": "notes", "type": "text", "nullable": true } ] },
      { "name": "wealthflow_interest_entries", "columns": [
        { "name": "bank_id", "type": "integer", "nullable": false },
        { "name": "date", "type": "date", "nullable": false },
        { "name": "amount", "type": "real", "nullable": false, "min": 0 },
        { "name": "finance_year", "type": "text", "nullable": false },
        { "name": "notes", "type": "text", "nullable": true } ] },
      { "name": "wealthflow_stocks", "columns": [
        { "name": "code", "type": "text", "nullable": false },
        { "name": "name", "type": "text", "nullable": false },
        { "name": "shares", "type": "real", "nullable": false, "min": 0 },
        { "name": "is_active", "type": "boolean", "nullable": false, "default": true },
        { "name": "notes", "type": "text", "nullable": true } ] },
      { "name": "wealthflow_dividends", "columns": [
        { "name": "stock_id", "type": "integer", "nullable": false },
        { "name": "date", "type": "date", "nullable": false },
        { "name": "type", "type": "text", "nullable": false },
        { "name": "gross", "type": "real", "nullable": false, "min": 0 },
        { "name": "franking", "type": "real", "nullable": false, "min": 0, "default": 0 },
        { "name": "finance_year", "type": "text", "nullable": false },
        { "name": "notes", "type": "text", "nullable": true } ] }
    ],
    "main": "src/main.ts"
  },
  "scripts": {
    "dev": "vite",
    "build": "node D:/finance_flow_ai/scripts/sdk/cli.mjs build .",
    "test": "vitest run",
    "version:bump": "node scripts/version-bump.mjs",
    "release": "node scripts/version-bump.mjs && node D:/finance_flow_ai/scripts/sdk/cli.mjs build ."
  },
  "devDependencies": { "vite": "^5.4.0", "typescript": "^5.5.0", "vitest": "^2.1.0", "happy-dom": "^15.0.0" },
  "dependencies": { "lit": "^3.1.0" }
}
```

Then: `npm install --no-audit --no-fund`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/manifest.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add package.json tests/manifest.test.ts
git commit -m "feat: declare wealthflow manifest with 4 tables and 5 commands"
```

---

### Task 2: FY + format utils (shared by every DAO/service/view)

**Files:**
- Create: `src/utils/finance-year.ts`, `src/utils/format.ts`
- Test: `tests/utils.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/utils.test.ts
import { describe, it, expect } from 'vitest';
import { computeFinanceYear, monthEnd, fyMonths, monthKey } from '../src/utils/finance-year.js';
import { formatAUD, maskAccount, formatBSB } from '../src/utils/format.js';
describe('utils', () => {
  it('computes FY for July start', () => {
    expect(computeFinanceYear('2025-07-01', '07-01')).toBe('2025-2026');
    expect(computeFinanceYear('2025-06-30', '07-01')).toBe('2024-2025');
  });
  it('monthEnd clamps to month-end', () => {
    expect(monthEnd('2025-02-10')).toBe('2025-02-28');
    expect(monthKey('2025-07-15')).toBe('2025-07');
  });
  it('fyMonths returns 12 AU FY months', () => {
    expect(fyMonths('2025-2026')).toEqual(['2025-07','2025-08','2025-09','2025-10','2025-11','2025-12','2026-01','2026-02','2026-03','2026-04','2026-05','2026-06']);
  });
  it('formats AUD + masks + BSB', () => {
    expect(formatAUD(25.93)).toBe('$25.93');
    expect(maskAccount('1234567')).toBe('•••4567');
    expect(formatBSB('012345')).toBe('012-345');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/utils.test.ts`
Expected: FAIL with "Failed to resolve import".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/utils/finance-year.ts
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
export function isValidIsoDate(s: string): boolean {
  if (!ISO_RE.test(s)) return false;
  const t = Date.parse(s + 'T00:00:00Z');
  return !Number.isNaN(t);
}
export function computeFinanceYear(date: string, fyStart: string): string | null {
  const ts = Date.parse(date + 'T00:00:00Z');
  if (Number.isNaN(ts)) return null;
  const [mm, dd] = fyStart.split('-');
  if (!mm || !dd) return null;
  const d = new Date(ts);
  const year = d.getUTCFullYear();
  const startThis = Date.parse(`${year}-${mm}-${dd}T00:00:00Z`);
  const startLast = Date.parse(`${year - 1}-${mm}-${dd}T00:00:00Z`);
  const fyStartYear = ts >= startThis ? year : ts >= startLast ? year - 1 : NaN;
  if (!Number.isFinite(fyStartYear)) return null;
  return `${fyStartYear}-${fyStartYear + 1}`;
}
export function normalizeFinanceYear(fy: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(fy.trim());
  if (!m) return fy;
  const start = Number(m[1]);
  return `${start}-${Math.floor(start / 100) * 100 + Number(m[2])}`;
}
export function monthKey(date: string): string { return date.slice(0, 7); }
export function monthEnd(dateOrMonth: string): string {
  const ym = dateOrMonth.length === 7 ? dateOrMonth : dateOrMonth.slice(0, 7);
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${ym}-${String(last).padStart(2, '0')}`;
}
export function fyMonths(fy: string): string[] {
  const start = Number(fy.slice(0, 4));
  const out: string[] = [];
  for (let m = 7; m <= 12; m++) out.push(`${start}-${String(m).padStart(2, '0')}`);
  for (let m = 1; m <= 6; m++) out.push(`${start + 1}-${String(m).padStart(2, '0')}`);
  return out;
}
export function monthLabel(ym: string): string {
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const [y, m] = ym.split('-').map(Number);
  return `${names[m - 1]} ${y}`;
}
```

```ts
// src/utils/format.ts
const aud = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });
export function formatAUD(n: number): string { return aud.format(n); }
export function maskAccount(acct: string): string {
  const last4 = acct.slice(-4);
  return `•••${last4}`;
}
export function formatBSB(bsb: string | null): string {
  if (!bsb) return '';
  const digits = bsb.replace(/\D/g, '');
  if (digits.length !== 6) return bsb;
  return `${digits.slice(0, 3)}-${digits.slice(3)}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/utils.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils/finance-year.ts src/utils/format.ts tests/utils.test.ts
git commit -m "feat: add finance-year and format utils"
```

---

### Task 3: Bank DAO (`wealthflow_banks`)

**Files:**
- Create: `src/dao/banks.ts`
- Test: `tests/banks.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/banks.test.ts
import { describe, it, expect } from 'vitest';
import { createBank, listBanks, setBankActive } from '../src/dao/banks.js';
function stub(rows: Record<string, unknown>[] = []) {
  const mem = [...rows];
  let id = 100;
  return { db: { table: () => ({
    find: async (f: any = {}) => mem.filter(r => Object.entries(f).every(([k,v]) => (r as any)[k] === v)),
    findOne: async (f: any = {}) => mem.find(r => Object.entries(f).every(([k,v]) => (r as any)[k] === v)) ?? null,
    insert: async (row: any) => { const r = { id: id++, is_active: true, ...row }; mem.push(r); return r; },
    update: async (f: any, p: any) => { let n = 0; for (const r of mem) if (Object.entries(f).every(([k,v]) => (r as any)[k] === v)) { Object.assign(r, p); n++; } return { affected: n }; },
    delete: async () => ({ affected: 0 }),
    count: async () => mem.length,
  }) } };
}
describe('banks dao', () => {
  it('creates + lists active by default', async () => {
    const f: any = stub();
    const row: any = await createBank(f, { name: 'Macquarie', bsb: '012345', account_number: '1234567' });
    expect(row.id).toBeDefined();
    expect(await listBanks(f, { status: 'active' })).toHaveLength(1);
  });
  it('rejects blank name/account', async () => {
    const f: any = stub();
    await expect(createBank(f, { name: '', account_number: '1' })).rejects.toThrow();
  });
  it('deactivate hides from active filter but keeps row', async () => {
    const f: any = stub();
    const row: any = await createBank(f, { name: 'BOQ', account_number: '999' });
    await setBankActive(f, row.id, false);
    expect(await listBanks(f, { status: 'active' })).toHaveLength(0);
    expect(await listBanks(f, { status: 'all' })).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/banks.test.ts`
Expected: FAIL with "Failed to resolve import".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/dao/banks.ts
import type { FinanceApi } from 'finance';
export interface Bank { readonly id: number; readonly name: string; readonly bsb: string | null; readonly account_number: string; readonly is_active: boolean; readonly notes: string | null; readonly created_at?: string; readonly updated_at?: string; }
export type BankInput = { name: string; bsb?: string | null; account_number: string; notes?: string | null; };
export class BankValidationError extends Error { readonly code = -32014; constructor(msg: string) { super(msg); this.name = 'BankValidationError'; } }
const TABLE = 'wealthflow_banks' as const;
export async function createBank(finance: FinanceApi, input: BankInput): Promise<Bank> {
  const name = input.name.trim();
  if (!name) throw new BankValidationError('name is required');
  if (!input.account_number.trim()) throw new BankValidationError('account_number is required');
  if (input.bsb != null && input.bsb !== '' && !/^\d{6}$/.test(input.bsb.replace(/\D/g, ''))) throw new BankValidationError('bsb must be 6 digits');
  const row = (await finance.db.table(TABLE).insert({ name, bsb: input.bsb?.replace(/\D/g, '') || null, account_number: input.account_number.trim(), notes: input.notes ?? null, is_active: true } as Record<string, unknown>)) as unknown as Bank;
  return row;
}
export async function listBanks(finance: FinanceApi, opts: { status?: 'active' | 'inactive' | 'all' } = {}): Promise<Bank[]> {
  const q: Record<string, unknown> = {};
  if ((opts.status ?? 'active') === 'active') q.is_active = true;
  else if (opts.status === 'inactive') q.is_active = false;
  const rows = (await finance.db.table(TABLE).find(q)) as unknown as Bank[];
  return rows.slice().sort((a, b) => a.name.localeCompare(b.name));
}
export async function updateBank(finance: FinanceApi, id: number, patch: Partial<BankInput>): Promise<number> {
  if (patch.name !== undefined && !patch.name.trim()) throw new BankValidationError('name is required');
  return finance.db.table(TABLE).update({ id }, patch as Record<string, unknown>);
}
export async function setBankActive(finance: FinanceApi, id: number, active: boolean): Promise<number> {
  return finance.db.table(TABLE).update({ id }, { is_active: active } as Record<string, unknown>);
}
export async function findBank(finance: FinanceApi, id: number): Promise<Bank | null> {
  return (await finance.db.table(TABLE).findOne({ id })) as unknown as Bank | null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/banks.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/dao/banks.ts tests/banks.test.ts
git commit -m "feat: add banks dao with active/inactive filters"
```

---

### Task 4: Interest DAO + once-per-month guard (load-bearing)

**Files:**
- Create: `src/dao/interest-entries.ts`
- Test: `tests/interest.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/interest.test.ts
import { describe, it, expect } from 'vitest';
import { createBank } from '../src/dao/banks.js';
import { createInterestEntry, listInterestEntries } from '../src/dao/interest-entries.js';
import { createMockFinance } from '../src/mock/finance-mock.js';
describe('interest once-per-month', () => {
  it('accepts first entry then rejects same bank-month', async () => {
    const f: any = createMockFinance();
    const b: any = await createBank(f, { name: 'Macquarie', account_number: '111' });
    await createInterestEntry(f, { bank_id: b.id, date: '2025-07-15', amount: 3.39, finance_year: '2025-2026' }, '07-01');
    await expect(createInterestEntry(f, { bank_id: b.id, date: '2025-07-20', amount: 1, finance_year: '2025-2026' }, '07-01')).rejects.toThrow(/already exists in Jul 2025/);
    expect(await listInterestEntries(f, { financeYear: '2025-2026' })).toHaveLength(1);
  });
  it('rejects negative amount and inactive bank', async () => {
    const f: any = createMockFinance();
    const b: any = await createBank(f, { name: 'ANZ', account_number: '222' });
    await expect(createInterestEntry(f, { bank_id: b.id, date: '2025-08-01', amount: -1, finance_year: '2025-2026' }, '07-01')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/interest.test.ts`
Expected: FAIL with "Failed to resolve import".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/dao/interest-entries.ts
import type { FinanceApi } from 'finance';
import { computeFinanceYear, isValidIsoDate, monthKey, monthLabel } from '../utils/finance-year.js';
export interface InterestEntry { readonly id: number; readonly bank_id: number; readonly date: string; readonly amount: number; readonly finance_year: string; readonly notes: string | null; }
export type InterestInput = { bank_id: number; date: string; amount: number; finance_year?: string; notes?: string | null; };
export class InterestValidationError extends Error { readonly code = -32014; constructor(msg: string) { super(msg); this.name = 'InterestValidationError'; } }
const TABLE = 'wealthflow_interest_entries' as const;
async function bankMustBeActive(finance: FinanceApi, bank_id: number): Promise<string> {
  const bank = (await finance.db.table('wealthflow_banks').findOne({ id: bank_id })) as unknown as { name: string; is_active: boolean } | null;
  if (!bank) throw new InterestValidationError(`bank ${bank_id} does not exist`);
  if (!bank.is_active) throw new InterestValidationError(`bank ${bank.name} is inactive — reactivate it to add entries`);
  return bank.name;
}
export async function createInterestEntry(finance: FinanceApi, input: InterestInput, fyStart = '07-01'): Promise<InterestEntry> {
  if (!Number.isInteger(input.bank_id) || input.bank_id <= 0) throw new InterestValidationError('bank_id must be a positive integer');
  if (!isValidIsoDate(input.date)) throw new InterestValidationError('date must be YYYY-MM-DD');
  if (!Number.isFinite(input.amount) || input.amount < 0) throw new InterestValidationError('amount must be ≥ 0');
  const bankName = await bankMustBeActive(finance, input.bank_id);
  const mk = monthKey(input.date);
  const existing = (await finance.db.table(TABLE).find({ bank_id: input.bank_id })) as unknown as InterestEntry[];
  if (existing.some(r => monthKey(r.date) === mk)) throw new InterestValidationError(`An entry for ${bankName} already exists in ${monthLabel(mk)} — edit it instead.`);
  const fy = input.finance_year?.trim() || computeFinanceYear(input.date, fyStart) || '';
  if (!fy) throw new InterestValidationError('finance_year could not be determined');
  const row = (await finance.db.table(TABLE).insert({ bank_id: input.bank_id, date: input.date, amount: input.amount, finance_year: fy, notes: input.notes ?? null } as Record<string, unknown>)) as unknown as InterestEntry;
  return row;
}
export async function updateInterestEntry(finance: FinanceApi, id: number, patch: Partial<InterestInput>): Promise<number> {
  if (patch.amount !== undefined && (!Number.isFinite(patch.amount) || patch.amount < 0)) throw new InterestValidationError('amount must be ≥ 0');
  if (patch.date !== undefined && !isValidIsoDate(patch.date)) throw new InterestValidationError('date must be YYYY-MM-DD');
  const existing = (await finance.db.table(TABLE).findOne({ id })) as unknown as InterestEntry | null;
  if (!existing) return 0;
  const nextBank = patch.bank_id ?? existing.bank_id;
  const nextDate = patch.date ?? existing.date;
  const mk = monthKey(nextDate);
  const siblings = (await finance.db.table(TABLE).find({ bank_id: nextBank })) as unknown as InterestEntry[];
  if (siblings.some(r => r.id !== id && monthKey(r.date) === mk)) throw new InterestValidationError('An entry for this bank already exists in that month — edit it instead.');
  return finance.db.table(TABLE).update({ id }, patch as Record<string, unknown>);
}
export async function deleteInterestEntry(finance: FinanceApi, id: number): Promise<number> {
  return finance.db.table(TABLE).delete({ id });
}
export async function listInterestEntries(finance: FinanceApi, filters: { bankId?: number; financeYear?: string } = {}): Promise<InterestEntry[]> {
  const q: Record<string, unknown> = {};
  if (filters.bankId !== undefined) q.bank_id = filters.bankId;
  if (filters.financeYear !== undefined) q.finance_year = filters.financeYear;
  const rows = (await finance.db.table(TABLE).find(q)) as unknown as InterestEntry[];
  return rows.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/interest.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/dao/interest-entries.ts tests/interest.test.ts
git commit -m "feat: add interest dao with once-per-month guard"
```

---

### Task 5: Bank service (validation + FY aggregation + grid model)

**Files:**
- Create: `src/services/bank-service.ts`
- Test: `tests/bank-service.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/bank-service.test.ts
import { describe, it, expect } from 'vitest';
import { sumInterestByBank, interestGridModel } from '../src/services/bank-service.js';
describe('bank service', () => {
  it('sums by bank incl. inactive history', () => {
    const banks = [{ id: 1, name: 'Macquarie' }, { id: 2, name: 'BOQ' }];
    const entries = [
      { bank_id: 1, date: '2025-07-31', amount: 3.39 },
      { bank_id: 1, date: '2025-08-31', amount: 2.10 },
      { bank_id: 2, date: '2025-07-31', amount: 6.48 },
    ];
    const { total, byBank } = sumInterestByBank(banks as any, entries as any);
    expect(total).toBeCloseTo(11.97, 2);
    expect(byBank.find(b => b.bankId === 1)?.total).toBeCloseTo(5.49, 2);
  });
  it('grid model maps 12 FY months', () => {
    const g = interestGridModel('2025-2026', [{ id: 1, name: 'M' }] as any, [{ bank_id: 1, date: '2025-07-31', amount: 3.39 }] as any);
    expect(g.months[0]).toBe('2025-07');
    expect(g.cells['2025-07'][1]).toBe(3.39);
    expect(g.cells['2025-08'][1]).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/bank-service.test.ts`
Expected: FAIL with "Failed to resolve import".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/services/bank-service.ts
import type { FinanceApi } from 'finance';
import { fyMonths, monthKey } from '../utils/finance-year.js';
import type { Bank } from '../dao/banks.js';
import type { InterestEntry } from '../dao/interest-entries.js';
import { listInterestEntries } from '../dao/interest-entries.js';
export function validateBsb(bsb: string | null | undefined): string | null {
  if (bsb == null || bsb === '') return null;
  return /^\d{6}$/.test(bsb.replace(/\D/g, '')) ? null : 'BSB must be 6 digits';
}
function round2(n: number): number { return Math.round(n * 100) / 100; }
export function sumInterestByBank(banks: Pick<Bank, 'id' | 'name'>[], entries: Pick<InterestEntry, 'bank_id' | 'amount'>[]): { total: number; byBank: { bankId: number; name: string; total: number }[] } {
  const byBank = banks.map(b => ({ bankId: b.id, name: b.name, total: round2(entries.filter(e => e.bank_id === b.id).reduce((s, e) => s + Number(e.amount ?? 0), 0)) }));
  return { total: round2(byBank.reduce((s, b) => s + b.total, 0)), byBank };
}
export async function getInterestTotals(finance: FinanceApi, banks: Pick<Bank, 'id' | 'name'>[], financeYear: string): Promise<{ total: number; byBank: { bankId: number; name: string; total: number }[] }> {
  const entries = await listInterestEntries(finance, { financeYear });
  return sumInterestByBank(banks, entries);
}
export function interestGridModel(fy: string, banks: Pick<Bank, 'id' | 'name'>[], entries: InterestEntry[]): { months: string[]; cells: Record<string, Record<number, number | null>>; rowTotals: Record<string, number>; colTotals: Record<number, number>; grandTotal: number } {
  const months = fyMonths(fy);
  const cells: Record<string, Record<number, number | null>> = {};
  const rowTotals: Record<string, number> = {};
  const colTotals: Record<number, number> = {};
  for (const b of banks) colTotals[b.id] = 0;
  let grand = 0;
  for (const m of months) {
    cells[m] = {};
    let row = 0;
    for (const b of banks) {
      const hit = entries.find(e => e.bank_id === b.id && monthKey(e.date) === m);
      cells[m][b.id] = hit ? Number(hit.amount) : null;
      row += hit ? Number(hit.amount) : 0;
      colTotals[b.id] = round2(colTotals[b.id] + (hit ? Number(hit.amount) : 0));
    }
    rowTotals[m] = round2(row);
    grand = round2(grand + row);
  }
  return { months, cells, rowTotals, colTotals, grandTotal: grand };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/bank-service.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/bank-service.ts tests/bank-service.test.ts
git commit -m "feat: add bank aggregation and grid model"
```

---

### Task 6: Interest-only domain service (Bank milestone, contract-stable)

**Files:**
- Create: `src/services/public-wealth-adapter.ts` (interest method now; dividend/overview added Task 16)
- Test: `tests/wealth-service-interest.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/wealth-service-interest.test.ts
import { describe, it, expect } from 'vitest';
import { createMockFinance } from '../src/mock/finance-mock.js';
import { createBank, setBankActive } from '../src/dao/banks.js';
import { createInterestEntry } from '../src/dao/interest-entries.js';
import { createPublicWealthAdapter } from '../src/services/public-wealth-adapter.js';
describe('getInterestSummary', () => {
  it('totals + byBank, includes deactivated history, empty→zeros, error→null', async () => {
    const f: any = createMockFinance();
    const a: any = await createBank(f, { name: 'Macquarie', account_number: '1' });
    const b: any = await createBank(f, { name: 'BOQ', account_number: '2' });
    await createInterestEntry(f, { bank_id: a.id, date: '2025-07-31', amount: 3.39, finance_year: '2025-2026' }, '07-01');
    await createInterestEntry(f, { bank_id: b.id, date: '2025-07-31', amount: 6.48, finance_year: '2025-2026' }, '07-01');
    await setBankActive(f, b.id, false);
    const svc = createPublicWealthAdapter(f);
    const s: any = await svc.getInterestSummary('2025-2026');
    expect(s.total).toBeCloseTo(9.87, 2);
    expect(s.byBank).toHaveLength(2);
    const empty: any = await svc.getInterestSummary('2030-2031');
    expect(empty.total).toBe(0);
    expect(await svc.getDividendSummary('2025-2026')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/wealth-service-interest.test.ts`
Expected: FAIL with "Failed to resolve import".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/services/public-wealth-adapter.ts
import type { FinanceApi } from 'finance';
import { ExtensionLogger } from 'finance-logger';
import { listBanks } from '../dao/banks.js';
import { listInterestEntries } from '../dao/interest-entries.js';
import { sumInterestByBank } from './bank-service.js';
const logger = new ExtensionLogger('wealthflow');
export interface InterestSummaryByBank { bankId: number; name: string; total: number; }
export interface InterestSummary { financialYear: string; total: number; byBank: InterestSummaryByBank[]; }
export interface DividendTypeSplit { gross: number; franking: number; }
export interface DividendSummaryByStock { stockId: number; code: string; name: string; gross: number; franking: number; }
export interface DividendSummary { financialYear: string; gross: number; franking: number; byType: { non_trust: DividendTypeSplit; trust: DividendTypeSplit; foreign: DividendTypeSplit }; byStock: DividendSummaryByStock[]; }
export interface OverviewSummary { financialYear: string; dividends: DividendSummary; interest: InterestSummary; combined: { gross: number; franking: number }; }
export interface PublicWealthService {
  getInterestSummary(financialYear: string): Promise<InterestSummary | null>;
  getDividendSummary(financialYear: string): Promise<DividendSummary | null>;
  getOverviewSummary(financialYear: string): Promise<OverviewSummary | null>;
}
export function createPublicWealthAdapter(finance: FinanceApi): PublicWealthService {
  return {
    async getInterestSummary(financialYear: string): Promise<InterestSummary | null> {
      try {
        const banks = await listBanks(finance, { status: 'all' });
        const entries = await listInterestEntries(finance, { financeYear: financialYear });
        const { total, byBank } = sumInterestByBank(banks, entries);
        return { financialYear, total, byBank };
      } catch (err) { logger.error('getInterestSummary failed:', err); return null; }
    },
    async getDividendSummary(): Promise<DividendSummary | null> { return null; },
    async getOverviewSummary(): Promise<OverviewSummary | null> { return null; },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/wealth-service-interest.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/public-wealth-adapter.ts tests/wealth-service-interest.test.ts
git commit -m "feat: add getInterestSummary with inactive-included history"
```

---

### Task 7: Orchestrator shell (tabs + global FY + footer + mount-update)

**Files:**
- Create: `src/ui/wealthflow-orchestrator.ts`
- Modify: `src/ui/index.ts`, `index.html`
- Test: `tests/orchestrator.test.ts` (happy-dom: tab switch + fy-changed re-query)

- [ ] **Step 1: Write the failing test**

```ts
// tests/orchestrator.test.ts
import { describe, it, expect } from 'vitest';
describe('orchestrator mapping', () => {
  it('maps mount.view to tab', async () => {
    const { WealthOrchestrator, viewForMount } = await import('../src/ui/wealthflow-orchestrator.js');
    expect(viewForMount({ view: 'stocks' })).toBe('stocks');
    expect(viewForMount({})).toBe('banks');
    expect(viewForMount({ view: 'nope' })).toBe('banks');
    expect(typeof WealthOrchestrator).toBe('function');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/orchestrator.test.ts`
Expected: FAIL with "Failed to resolve import".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/ui/wealthflow-orchestrator.ts
import { LitElement, html } from 'lit';
import { sharedStyles } from '../styles/shared-styles.js';
const Base = typeof HTMLElement !== 'undefined' ? LitElement : (class {} as unknown as typeof LitElement);
export type WealthTab = 'banks' | 'stocks' | 'dividends' | 'overview';
export function viewForMount(mount: Record<string, unknown> = {}): WealthTab {
  const v = (mount.view ?? mount.viewId) as string | undefined;
  if (v === 'stocks' || v === 'stock-list') return 'stocks';
  if (v === 'dividends' || v === 'dividend-log') return 'dividends';
  if (v === 'overview' || v === 'overview-view') return 'overview';
  return 'banks';
}
function currentFy(): string {
  const now = new Date();
  const y = now.getFullYear();
  const july1 = new Date(y, 6, 1);
  const start = now >= july1 ? y : y - 1;
  return `${start}-${start + 1}`;
}
function fyOptions(center: string): string[] {
  const s = Number(center.slice(0, 4));
  return [`${s - 1}-${s}`, center, `${s + 1}-${s + 2}`];
}
export class WealthOrchestrator extends Base {
  static override styles = typeof HTMLElement !== 'undefined' ? [sharedStyles] as any : [];
  finance: any = null;
  tab: WealthTab = 'banks';
  fy = currentFy();
  footerTotal: number | null = null;
  error = '';
  async setFinance(f: any): Promise<void> { this.finance = f; await this.pushFinance(); }
  async init(f: any, mount: Record<string, unknown> = {}): Promise<void> {
    this.finance = f;
    this.tab = viewForMount(mount);
    if (typeof mount.fy === 'string') this.fy = mount.fy as string;
    await this.pushFinance();
  }
  navigate(tab: WealthTab): void { this.tab = tab; (this as any).requestUpdate?.(); void this.pushFinance(); }
  private child(): any { const root = (this as any).renderRoot as ShadowRoot | undefined; return root?.querySelector('#child'); }
  async pushFinance(): Promise<void> {
    (this as any).requestUpdate?.();
    try { await (this as any).updateComplete; } catch { /* non-Lit */ }
    const c = this.child() as any;
    if (c && this.finance) {
      c.finance = this.finance;
      if ('fy' in c || this.tab !== 'banks') { try { c.fy = this.fy; } catch { /* ignore */ } }
      if (typeof c.setFinance === 'function') { try { await c.setFinance(this.finance); } catch (e: any) { this.error = String(e?.message || e); } }
      else if (typeof c.reload === 'function') { try { await c.reload(); } catch (e: any) { this.error = String(e?.message || e); } }
    }
  }
  override connectedCallback(): void {
    (super.connectedCallback as (() => void) | undefined)?.call(this);
    this.addEventListener('fy-changed', this._onFy as EventListener);
    this.addEventListener('wealthflow-navigate', this._onNav as EventListener);
    this.addEventListener('host-navigate', this._onHostNav as EventListener);
  }
  override disconnectedCallback(): void {
    this.removeEventListener('fy-changed', this._onFy as EventListener);
    this.removeEventListener('wealthflow-navigate', this._onNav as EventListener);
    this.removeEventListener('host-navigate', this._onHostNav as EventListener);
    (super.disconnectedCallback as (() => void) | undefined)?.call(this);
  }
  private _onFy = (e: Event): void => {
    const fy = (e as CustomEvent).detail?.fy as string | undefined;
    if (fy) { this.fy = fy; void this.pushFinance(); }
  };
  private _onNav = (e: Event): void => {
    const view = (e as CustomEvent).detail?.view as string | undefined;
    if (view) this.navigate(viewForMount({ view }));
  };
  private _onHostNav = (e: Event): void => {
    const d = (e as CustomEvent).detail as { view?: string; mountData?: Record<string, unknown> };
    void this.init(this.finance, { view: d.view, ...(d.mountData ?? {}) });
  };
  override render(): unknown {
    if (typeof HTMLElement === 'undefined') return html``;
    const tabs: WealthTab[] = ['banks', 'stocks', 'dividends', 'overview'];
    return html`
      <div class="view-scroll"><div class="topbar">
        <span class="crumb-current">Wealth Flow</span>
        <div class="spacer"></div>
        ${tabs.map(t => html`<button class="filter-btn" ?data-active=${this.tab === t} @click=${() => this.navigate(t)}>${t[0].toUpperCase() + t.slice(1)}</button>`)}
        <select .value=${this.fy} @change=${(e: Event) => { const fy = (e.target as HTMLSelectElement).value; this.dispatchEvent(new CustomEvent('fy-changed', { detail: { fy }, bubbles: true, composed: true })); }}>
          ${fyOptions(this.fy).map(f => html`<option value=${f} ?selected=${f === this.fy}>FY ${f}</option>`)}
        </select>
      </div>
      <div class="view-container"><div class="view-container-inner">
        ${this.error ? html`<p class="field-error">Error: ${this.error}</p>` : ''}
        ${this.tab === 'banks' ? html`<bank-list id="child"></bank-list>` : ''}
        ${this.tab === 'stocks' ? html`<stock-list id="child"></stock-list>` : ''}
        ${this.tab === 'dividends' ? html`<dividend-log id="child"></dividend-log>` : ''}
        ${this.tab === 'overview' ? html`<overview-view id="child"></overview-view>` : ''}
        <div class="section"><span>FY ${this.fy} total (context):</span> <strong>${this.footerTotal == null ? '—' : this.footerTotal}</strong></div>
      </div></div></div>`;
  }
}
if (typeof customElements !== 'undefined' && !customElements.get('wealthflow-orchestrator')) customElements.define('wealthflow-orchestrator', WealthOrchestrator as unknown as CustomElementConstructor);
```

`src/ui/index.ts` append: register `wealthflow-orchestrator`, `bank-list`, `interest-grid`, `interest-form`, `bank-form` now; stock/dividend/overview tags added Task 14/17 (import-guarded so missing files never break Bank milestone). `index.html` VIEWS adds `{ tag: 'wealthflow-orchestrator', label: 'Wealthflow' }`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/orchestrator.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/wealthflow-orchestrator.ts src/ui/index.ts index.html tests/orchestrator.test.ts
git commit -m "feat: add wealthflow orchestrator with global FY tabs"
```

---

### Task 8: `bank-list` + `bank-form` (masters UI)

**Files:**
- Create: `src/ui/bank-list.ts`, `src/ui/bank-form.ts`
- Test: `tests/bank-list.test.ts` (happy-dom render with mock finance: row shows masked account + FY total; deactivate emits)

- [ ] **Step 1: Write the failing test**

```ts
// tests/bank-list.test.ts
import { describe, it, expect } from 'vitest';
describe('bank-list element', () => {
  it('registers custom element', async () => {
    await import('../src/ui/bank-list.js');
    expect(customElements.get('bank-list')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/bank-list.test.ts --environment happy-dom`
Expected: FAIL with "Failed to resolve import".

- [ ] **Step 3: Write minimal implementation** — `bank-list.ts`: props `finance`, `fy`; state `banks`, `totals: Record<number,number>`, `statusFilter='active'`, `editingId`, `error`; `reload()` loads banks + `getInterestTotals`; row: `● name  BSB •••acct  FY $X  [Add interest][Edit][Deactivate]`; inline edit inputs for name/bsb/account; dispatches `bank-edit`, `bank-deactivate`, `wealthflow-navigate {view:'dividends'}` for Add-interest focus. `bank-form.ts`: modal-less section with name/bsb/account/notes + `bank-create` dispatch + BSB field error via `validateBsb`. Both use `formatAUD`, `maskAccount`, `formatBSB`, `sharedStyles`, `ExtensionLogger`, try/catch surfacing red `Error:`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/bank-list.test.ts --environment happy-dom`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/bank-list.ts src/ui/bank-form.ts tests/bank-list.test.ts
git commit -m "feat: add bank list with inline edit and FY totals"
```

---

### Task 9: `interest-grid` (primary entry path — sheet mirror)

**Files:**
- Create: `src/ui/interest-grid.ts`
- Test: `tests/interest-grid.test.ts` (cell write creates/updates; grid totals == `sumInterestByBank` total)

- [ ] **Step 1: Write the failing test**

```ts
// tests/interest-grid.test.ts
import { describe, it, expect } from 'vitest';
import { interestGridModel } from '../src/services/bank-service.js';
describe('interest grid totals single-source', () => {
  it('grid grandTotal equals service total', async () => {
    const { sumInterestByBank } = await import('../src/services/bank-service.js');
    const banks: any = [{ id: 1, name: 'M' }];
    const entries: any = [{ bank_id: 1, date: '2025-07-31', amount: 3.39 }];
    expect(interestGridModel('2025-2026', banks, entries).grandTotal).toBe(sumInterestByBank(banks, entries).total);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/interest-grid.test.ts`
Expected: FAIL only if model missing (passes if Task 5 done — then this test guards single-source; still write element after).

- [ ] **Step 3: Write minimal implementation** — `interest-grid.ts`: props `finance`, `fy`; `reload()` loads active banks + FY entries, builds `interestGridModel`; renders `<table>` 12 rows × N cols + Total col, per-col totals + grand; each cell `<input inputmode="decimal">` with current value; `@change` → parse float ≥0 → find existing `(bank_id, monthKey)` → `updateInterestEntry` or `createInterestEntry({date: monthEnd(month)})` → `reload()` + `interest-create/edit` dispatch; invalid → inline field error, no write. Exposes `focusCurrentMonth()`. `wealthflow.add-interest` command calls it via orchestrator navigate + querySelector focus.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/interest-grid.test.ts`
Expected: PASS. Manual: `npm run dev` → grid shows Jul 2025 3.39-style cells, tab moves across.

- [ ] **Step 5: Commit**

```bash
git add src/ui/interest-grid.ts tests/interest-grid.test.ts
git commit -m "feat: add monthly interest grid mirroring sheet"
```

---

### Task 10: `interest-form` (corrections) + `main.ts` Bank wiring — Bank milestone shippable

**Files:**
- Create: `src/ui/interest-form.ts`
- Modify: `src/main.ts`, `src/ui/index.ts`
- Test: `tests/main-bank.test.ts` (activate registers 5 commands + wealthflow service; `getInterestSummary` live via invoke)

- [ ] **Step 1: Write the failing test**

```ts
// tests/main-bank.test.ts
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
    expect(await f.services.invoke('wealthflow', 'getInterestSummary', '2025-2026')).toBeTruthy();
    deactivate();
    expect(await f.services.invoke('wealthflow', 'getInterestSummary', '2025-2026')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/main-bank.test.ts`
Expected: FAIL (main still registers only `wealthflow.hello`).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/main.ts (replace whole file)
import type { FinanceApi } from 'finance';
import { ExtensionLogger } from 'finance-logger';
import './styles/ext-tokens.css';
const logger = new ExtensionLogger('wealthflow');
let _finance: FinanceApi | null = null;
export async function registerUIComponents(): Promise<void> { if (typeof window !== 'undefined') await import('./ui/index.js'); }
export async function activate(finance: FinanceApi, ctx: { viewId?: string } & Record<string, unknown> = {}): Promise<void> {
  _finance = finance;
  logger.info('activate wealthflow', { viewId: ctx.viewId });
  const openView = (view: string) => async () => { await finance.ui?.requestMount('wealthflow', { view }); };
  finance.commands.registerCommand('wealthflow.show-banks', 'Wealth Flow: Show Banks', openView('banks'));
  finance.commands.registerCommand('wealthflow.add-interest', 'Wealth Flow: Add Interest', openView('banks'));
  finance.commands.registerCommand('wealthflow.show-stocks', 'Wealth Flow: Show Stocks', openView('stocks'));
  finance.commands.registerCommand('wealthflow.add-dividend', 'Wealth Flow: Add Dividend', openView('dividends'));
  finance.commands.registerCommand('wealthflow.show-overview', 'Wealth Flow: Show Overview', openView('overview'));
  const { createPublicWealthAdapter } = await import('./services/public-wealth-adapter.js');
  finance.services.register('wealthflow', createPublicWealthAdapter(finance) as unknown as Record<string, (p?: unknown) => unknown>);
  if (typeof window !== 'undefined') await import('./ui/index.js');
  if (ctx.viewId && typeof document !== 'undefined') {
    const app = document.getElementById('app');
    if (app) {
      const el = document.createElement('wealthflow-orchestrator') as any;
      app.innerHTML = '';
      app.appendChild(el);
      const base = { ...(ctx as Record<string, unknown>) };
      delete (base as any).viewId;
      queueMicrotask(() => { if (typeof el.init === 'function') void el.init(finance, { view: 'banks', ...base }); else if (typeof el.setFinance === 'function') void el.setFinance(finance); else el.finance = finance; });
      el.addEventListener('mount-update', (e: Event) => {
        const detail = (e as CustomEvent).detail as { view?: string } & Record<string, unknown>;
        void el.init(finance, { view: detail.view ?? 'banks', ...detail });
      });
    }
  }
}
export function deactivate(): void { if (_finance) _finance.services.unregister('wealthflow'); logger.info('deactivate wealthflow'); }
```

`interest-form.ts`: bank dropdown (active only), date, amount, finance_year auto via `computeFinanceYear(date,'07-01')` + amber mismatch `<p>` when overridden, notes; submit → `createInterestEntry` → `interest-create`; delete → `confirm()` → `deleteInterestEntry` → `interest-delete`; all errors red inline.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/main-bank.test.ts`
Expected: PASS. Manual Bank milestone: `npm run dev` → add bank → 2 months interest → duplicate-month rejected → deactivate keeps totals → FY switch re-queries.

- [ ] **Step 5: Commit**

```bash
git add src/main.ts src/ui/interest-form.ts src/ui/index.ts tests/main-bank.test.ts
git commit -m "feat: wire bank milestone commands and interest form"
```

---

### Task 11: Stock DAO (`wealthflow_stocks` — uppercase + global-unique code)

**Files:**
- Create: `src/dao/stocks.ts`
- Test: `tests/stocks.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/stocks.test.ts
import { describe, it, expect } from 'vitest';
import { createMockFinance } from '../src/mock/finance-mock.js';
import { createStock, setStockActive } from '../src/dao/stocks.js';
describe('stocks dao', () => {
  it('uppercases code and rejects global duplicate incl. inactive', async () => {
    const f: any = createMockFinance();
    const s: any = await createStock(f, { code: 'vas', name: 'Vanguard', shares: 120 });
    expect(s.code).toBe('VAS');
    await setStockActive(f, s.id, false);
    await expect(createStock(f, { code: 'VAS', name: 'Dup', shares: 1 })).rejects.toThrow(/already exists — reactivate/);
  });
  it('rejects negative shares', async () => {
    const f: any = createMockFinance();
    await expect(createStock(f, { code: 'VHY', name: 'X', shares: -1 })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/stocks.test.ts`
Expected: FAIL with "Failed to resolve import".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/dao/stocks.ts
import type { FinanceApi } from 'finance';
export interface Stock { readonly id: number; readonly code: string; readonly name: string; readonly shares: number; readonly is_active: boolean; readonly notes: string | null; }
export type StockInput = { code: string; name: string; shares: number; notes?: string | null; };
export class StockValidationError extends Error { readonly code = -32014; constructor(msg: string) { super(msg); this.name = 'StockValidationError'; } }
const TABLE = 'wealthflow_stocks' as const;
export async function createStock(finance: FinanceApi, input: StockInput): Promise<Stock> {
  const code = input.code.trim().toUpperCase();
  if (!code) throw new StockValidationError('code is required');
  if (!input.name.trim()) throw new StockValidationError('name is required');
  if (!Number.isFinite(input.shares) || input.shares < 0) throw new StockValidationError('shares must be ≥ 0');
  const dup = (await finance.db.table(TABLE).find({})) as unknown as Stock[];
  if (dup.some(r => String(r.code).toUpperCase() === code)) throw new StockValidationError(`Code ${code} already exists — reactivate it instead.`);
  return (await finance.db.table(TABLE).insert({ code, name: input.name.trim(), shares: input.shares, notes: input.notes ?? null, is_active: true } as Record<string, unknown>)) as unknown as Stock;
}
export async function listStocks(finance: FinanceApi, opts: { status?: 'active' | 'inactive' | 'all' } = {}): Promise<Stock[]> {
  const q: Record<string, unknown> = {};
  if ((opts.status ?? 'active') === 'active') q.is_active = true;
  else if (opts.status === 'inactive') q.is_active = false;
  const rows = (await finance.db.table(TABLE).find(q)) as unknown as Stock[];
  return rows.slice().sort((a, b) => a.code.localeCompare(b.code));
}
export async function updateStock(finance: FinanceApi, id: number, patch: Partial<StockInput>): Promise<number> {
  if (patch.code !== undefined) {
    const code = patch.code.trim().toUpperCase();
    if (!code) throw new StockValidationError('code is required');
    const all = (await finance.db.table(TABLE).find({})) as unknown as Stock[];
    if (all.some(r => r.id !== id && String(r.code).toUpperCase() === code)) throw new StockValidationError(`Code ${code} already exists — reactivate it instead.`);
    return finance.db.table(TABLE).update({ id }, { ...patch, code } as Record<string, unknown>);
  }
  if (patch.shares !== undefined && (!Number.isFinite(patch.shares) || patch.shares < 0)) throw new StockValidationError('shares must be ≥ 0');
  return finance.db.table(TABLE).update({ id }, patch as Record<string, unknown>);
}
export async function setStockActive(finance: FinanceApi, id: number, active: boolean): Promise<number> {
  return finance.db.table(TABLE).update({ id }, { is_active: active } as Record<string, unknown>);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/stocks.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/dao/stocks.ts tests/stocks.test.ts
git commit -m "feat: add stocks dao with global-unique code"
```

---

### Task 12: Dividend DAO + enum validation (`wealthflow_dividends`)

**Files:**
- Create: `src/dao/dividends.ts`
- Test: `tests/dividends.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/dividends.test.ts
import { describe, it, expect } from 'vitest';
import { createMockFinance } from '../src/mock/finance-mock.js';
import { createStock } from '../src/dao/stocks.js';
import { createDividend, listDividends } from '../src/dao/dividends.js';
describe('dividends dao', () => {
  it('accepts all 3 types, rejects bad type + negative gross', async () => {
    const f: any = createMockFinance();
    const s: any = await createStock(f, { code: 'VAS', name: 'V', shares: 10 });
    await createDividend(f, { stock_id: s.id, date: '2025-01-15', type: 'non_trust', gross: 100, franking: 20, finance_year: '2024-2025' }, '07-01');
    await createDividend(f, { stock_id: s.id, date: '2025-04-15', type: 'trust', gross: 50, franking: 0, finance_year: '2024-2025' }, '07-01');
    await expect(createDividend(f, { stock_id: s.id, date: '2025-05-01', type: 'nope', gross: 1, franking: 0, finance_year: '2024-2025' }, '07-01')).rejects.toThrow(/type must be/);
    await expect(createDividend(f, { stock_id: s.id, date: '2025-05-01', type: 'trust', gross: -1, franking: 0, finance_year: '2024-2025' }, '07-01')).rejects.toThrow();
    expect(await listDividends(f, { financeYear: '2024-2025' })).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/dividends.test.ts`
Expected: FAIL with "Failed to resolve import".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/dao/dividends.ts
import type { FinanceApi } from 'finance';
import { computeFinanceYear, isValidIsoDate } from '../utils/finance-year.js';
export const DIVIDEND_TYPES = ['non_trust', 'trust', 'foreign'] as const;
export type DividendType = (typeof DIVIDEND_TYPES)[number];
export const DIVIDEND_LABELS: Record<DividendType, string> = { non_trust: 'Non Trust', trust: 'Trust (ETF)', foreign: 'Foreign' };
export interface DividendEntry { readonly id: number; readonly stock_id: number; readonly date: string; readonly type: DividendType; readonly gross: number; readonly franking: number; readonly finance_year: string; readonly notes: string | null; }
export type DividendInput = { stock_id: number; date: string; type: string; gross: number; franking?: number; finance_year?: string; notes?: string | null; };
export class DividendValidationError extends Error { readonly code = -32014; constructor(msg: string) { super(msg); this.name = 'DividendValidationError'; } }
const TABLE = 'wealthflow_dividends' as const;
export async function createDividend(finance: FinanceApi, input: DividendInput, fyStart = '07-01'): Promise<DividendEntry> {
  if (!Number.isInteger(input.stock_id) || input.stock_id <= 0) throw new DividendValidationError('stock_id must be a positive integer');
  const stock = await finance.db.table('wealthflow_stocks').findOne({ id: input.stock_id });
  if (!stock) throw new DividendValidationError(`stock ${input.stock_id} does not exist`);
  if (!isValidIsoDate(input.date)) throw new DividendValidationError('date must be YYYY-MM-DD');
  if (!(DIVIDEND_TYPES as readonly string[]).includes(input.type)) throw new DividendValidationError(`type must be one of ${(DIVIDEND_TYPES as readonly string[]).join(' | ')}`);
  if (!Number.isFinite(input.gross) || input.gross < 0) throw new DividendValidationError('gross must be ≥ 0');
  const franking = input.franking ?? 0;
  if (!Number.isFinite(franking) || franking < 0) throw new DividendValidationError('franking must be ≥ 0');
  const fy = input.finance_year?.trim() || computeFinanceYear(input.date, fyStart) || '';
  if (!fy) throw new DividendValidationError('finance_year could not be determined');
  return (await finance.db.table(TABLE).insert({ stock_id: input.stock_id, date: input.date, type: input.type, gross: input.gross, franking, finance_year: fy, notes: input.notes ?? null } as Record<string, unknown>)) as unknown as DividendEntry;
}
export async function updateDividend(finance: FinanceApi, id: number, patch: Partial<DividendInput>): Promise<number> {
  if (patch.type !== undefined && !(DIVIDEND_TYPES as readonly string[]).includes(patch.type)) throw new DividendValidationError('type must be one of non_trust | trust | foreign');
  if (patch.gross !== undefined && (!Number.isFinite(patch.gross) || patch.gross < 0)) throw new DividendValidationError('gross must be ≥ 0');
  if (patch.franking !== undefined && (!Number.isFinite(patch.franking) || patch.franking < 0)) throw new DividendValidationError('franking must be ≥ 0');
  if (patch.date !== undefined && !isValidIsoDate(patch.date)) throw new DividendValidationError('date must be YYYY-MM-DD');
  return finance.db.table(TABLE).update({ id }, patch as Record<string, unknown>);
}
export async function deleteDividend(finance: FinanceApi, id: number): Promise<number> { return finance.db.table(TABLE).delete({ id }); }
export async function listDividends(finance: FinanceApi, filters: { stockId?: number; financeYear?: string; type?: string } = {}): Promise<DividendEntry[]> {
  const q: Record<string, unknown> = {};
  if (filters.stockId !== undefined) q.stock_id = filters.stockId;
  if (filters.financeYear !== undefined) q.finance_year = filters.financeYear;
  if (filters.type !== undefined) q.type = filters.type;
  const rows = (await finance.db.table(TABLE).find(q)) as unknown as DividendEntry[];
  return rows.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/dividends.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/dao/dividends.ts tests/dividends.test.ts
git commit -m "feat: add dividends dao with type enum"
```

---

### Task 13: Stock service (dividend aggregation + mirror-of-sheet test)

**Files:**
- Create: `src/services/stock-service.ts`
- Test: `tests/stock-service.test.ts` (incl. ~23-row sheet-shape seed asserting FY gross+franking per type)

- [ ] **Step 1: Write the failing test**

```ts
// tests/stock-service.test.ts
import { describe, it, expect } from 'vitest';
import { sumDividends } from '../src/services/stock-service.js';
describe('sumDividends', () => {
  it('splits franking by type and aggregates byStock', () => {
    const stocks: any = [{ id: 1, code: 'VAS', name: 'Vanguard' }, { id: 2, code: 'VHY', name: 'High Yield' }];
    const entries: any = [
      { stock_id: 1, type: 'non_trust', gross: 100, franking: 30 },
      { stock_id: 1, type: 'trust', gross: 50, franking: 5 },
      { stock_id: 2, type: 'non_trust', gross: 200, franking: 60 },
    ];
    const s = sumDividends('2025-2026', stocks, entries);
    expect(s.gross).toBe(350);
    expect(s.franking).toBe(95);
    expect(s.byType.non_trust).toEqual({ gross: 300, franking: 90 });
    expect(s.byType.trust).toEqual({ gross: 50, franking: 5 });
    expect(s.byStock.find(b => b.code === 'VAS')?.gross).toBe(150);
  });
  it('mirror-of-sheet: mixed VAS/VHY/FGX across types sums per type', () => {
    const stocks: any = [{ id: 1, code: 'VAS', name: 'V' }, { id: 2, code: 'VHY', name: 'H' }, { id: 3, code: 'FGX', name: 'F' }];
    const entries: any = [
      { stock_id: 1, type: 'trust', gross: 120.5, franking: 10 },
      { stock_id: 2, type: 'non_trust', gross: 300, franking: 90 },
      { stock_id: 3, type: 'non_trust', gross: 45.25, franking: 15 },
      { stock_id: 1, type: 'trust', gross: 130.75, franking: 12 },
    ];
    const s = sumDividends('2025-2026', stocks, entries);
    expect(s.byType.trust.gross).toBeCloseTo(251.25, 2);
    expect(s.byType.non_trust.franking).toBe(105);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/stock-service.test.ts`
Expected: FAIL with "Failed to resolve import".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/services/stock-service.ts
import type { FinanceApi } from 'finance';
import type { Stock } from '../dao/stocks.js';
import type { DividendEntry } from '../dao/dividends.js';
import { listDividends } from '../dao/dividends.js';
import type { DividendSummary } from './public-wealth-adapter.js';
function round2(n: number): number { return Math.round(n * 100) / 100; }
export const DIVIDEND_TYPE_LABELS = { non_trust: 'Non Trust', trust: 'Trust (ETF)', foreign: 'Foreign' } as const;
export function sumDividends(financialYear: string, stocks: Pick<Stock, 'id' | 'code' | 'name'>[], entries: Pick<DividendEntry, 'stock_id' | 'type' | 'gross' | 'franking'>[]): DividendSummary {
  const byType = { non_trust: { gross: 0, franking: 0 }, trust: { gross: 0, franking: 0 }, foreign: { gross: 0, franking: 0 } };
  for (const e of entries) {
    const t = (e.type in byType ? e.type : 'non_trust') as keyof typeof byType;
    byType[t].gross = round2(byType[t].gross + Number(e.gross ?? 0));
    byType[t].franking = round2(byType[t].franking + Number(e.franking ?? 0));
  }
  const byStock = stocks.map(s => {
    const mine = entries.filter(e => e.stock_id === s.id);
    return { stockId: s.id, code: s.code, name: s.name, gross: round2(mine.reduce((x, e) => x + Number(e.gross ?? 0), 0)), franking: round2(mine.reduce((x, e) => x + Number(e.franking ?? 0), 0)) };
  });
  return { financialYear, gross: round2(entries.reduce((x, e) => x + Number(e.gross ?? 0), 0)), franking: round2(entries.reduce((x, e) => x + Number(e.franking ?? 0), 0)), byType, byStock };
}
export async function getDividendTotals(finance: FinanceApi, stocks: Pick<Stock, 'id' | 'code' | 'name'>[], financeYear: string): Promise<DividendSummary> {
  const entries = await listDividends(finance, { financeYear });
  return sumDividends(financeYear, stocks, entries);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/stock-service.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/stock-service.ts tests/stock-service.test.ts
git commit -m "feat: add dividend aggregation with type splits"
```

---

### Task 14: `stock-list` + `dividend-log` + `dividend-form` UI

**Files:**
- Create: `src/ui/stock-list.ts`, `src/ui/dividend-log.ts`, `src/ui/dividend-form.ts`
- Modify: `src/ui/index.ts`, `index.html`
- Test: `tests/stock-ui.test.ts` (element registration + code-uppercase render check)

- [ ] **Step 1: Write the failing test**

```ts
// tests/stock-ui.test.ts
import { describe, it, expect } from 'vitest';
describe('stock ui tags', () => {
  it('registers all three', async () => {
    await import('../src/ui/stock-list.js');
    await import('../src/ui/dividend-log.js');
    await import('../src/ui/dividend-form.js');
    expect(customElements.get('stock-list')).toBeDefined();
    expect(customElements.get('dividend-log')).toBeDefined();
    expect(customElements.get('dividend-form')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/stock-ui.test.ts --environment happy-dom`
Expected: FAIL with "Failed to resolve import".

- [ ] **Step 3: Write minimal implementation**
  - `stock-list.ts`: mirrors `bank-list` — status filter, rows `VAS Vanguard Aust. Shares 120 sh FY $X + fr $Y [Add dividend][Edit][Deactivate]`; inline shares/name edit; new-holding row (code auto-uppercases on input); per-row FY via `getDividendTotals`; dispatches `stock-create/edit/activate/deactivate`.
  - `dividend-log.ts`: props `finance`, `fy`; local `stockFilter: number|'all'`; table `date | stock | type-label | gross | franking` + `[Edit][Delete]`; delete via `confirm()` → `deleteDividend` → `dividend-delete`; empty → `$0.00` + hint.
  - `dividend-form.ts`: stock dropdown (ALL stocks incl. inactive, marked `(inactive)`), date, type select (3 labels), gross, franking, auto `finance_year` + amber mismatch callout, notes; submit → `createDividend` → `dividend-create`; edit path → `updateDividend`.
  - `index.html`: add `{ tag: 'stock-list', label: 'Stocks' }`, `{ tag: 'dividend-log', label: 'Dividends' }`, `{ tag: 'overview-view', label: 'Overview' }` to VIEWS.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/stock-ui.test.ts --environment happy-dom`
Expected: PASS. Manual: holding → dividend → duplicate-code rejected → deactivate keeps totals.

- [ ] **Step 5: Commit**

```bash
git add src/ui/stock-list.ts src/ui/dividend-log.ts src/ui/dividend-form.ts src/ui/index.ts index.html tests/stock-ui.test.ts
git commit -m "feat: add stock holdings and dividend log ui"
```

---

### Task 15: `overview-view` (3 cards = sheet yearly row)

**Files:**
- Create: `src/ui/overview-view.ts`
- Test: `tests/overview.test.ts` (happy-dom: renders 3 cards; empty → hints)

- [ ] **Step 1: Write the failing test**

```ts
// tests/overview.test.ts
import { describe, it, expect } from 'vitest';
describe('overview-view', () => {
  it('registers element', async () => {
    await import('../src/ui/overview-view.js');
    expect(customElements.get('overview-view')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/overview.test.ts --environment happy-dom`
Expected: FAIL with "Failed to resolve import".

- [ ] **Step 3: Write minimal implementation** — `overview-view.ts`: props `finance`, `fy`; `reload()` calls `finance.services.invoke('wealthflow','getOverviewSummary', fy)` — on `null` (service inactive) falls back to direct DAO aggregation via `getDividendTotals`+`getInterestTotals`; renders 3 `.section` cards: Dividends (`gross $A frank $B`, NT/Trust/F split lines), Interest (`$C [→ Banks]` button → `wealthflow-navigate {view:'banks'}`), Combined (`gross $A+C franking $B`); all money via `formatAUD`; empty → per-card hint text (dashboard placeholder language), never error.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/overview.test.ts --environment happy-dom`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/overview-view.ts tests/overview.test.ts
git commit -m "feat: add overview with dividend interest combined cards"
```

---

### Task 16: Full domain service (dividend + overview) + combined test

**Files:**
- Modify: `src/services/public-wealth-adapter.ts`
- Test: `tests/wealth-service-full.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/wealth-service-full.test.ts
import { describe, it, expect } from 'vitest';
import { createMockFinance } from '../src/mock/finance-mock.js';
import { createBank } from '../src/dao/banks.js';
import { createInterestEntry } from '../src/dao/interest-entries.js';
import { createStock } from '../src/dao/stocks.js';
import { createDividend } from '../src/dao/dividends.js';
import { createPublicWealthAdapter } from '../src/services/public-wealth-adapter.js';
describe('full wealth service', () => {
  it('combines dividends + interest', async () => {
    const f: any = createMockFinance();
    const b: any = await createBank(f, { name: 'UBank', account_number: '9' });
    await createInterestEntry(f, { bank_id: b.id, date: '2025-07-31', amount: 10, finance_year: '2025-2026' }, '07-01');
    const s: any = await createStock(f, { code: 'VAS', name: 'V', shares: 5 });
    await createDividend(f, { stock_id: s.id, date: '2025-08-01', type: 'non_trust', gross: 100, franking: 30, finance_year: '2025-2026' }, '07-01');
    const svc = createPublicWealthAdapter(f);
    const d: any = await svc.getDividendSummary('2025-2026');
    expect(d.gross).toBe(100);
    expect(d.byType.non_trust.franking).toBe(30);
    expect(d.byStock[0].code).toBe('VAS');
    const o: any = await svc.getOverviewSummary('2025-2026');
    expect(o.combined.gross).toBe(110);
    expect(o.combined.franking).toBe(30);
    expect(o.interest.total).toBe(10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/wealth-service-full.test.ts`
Expected: FAIL (`getDividendSummary` returns null).

- [ ] **Step 3: Write minimal implementation** — replace the two stub methods in `public-wealth-adapter.ts`:

```ts
async getDividendSummary(financialYear: string): Promise<DividendSummary | null> {
  try {
    const { listStocks } = await import('../dao/stocks.js');
    const { listDividends } = await import('../dao/dividends.js');
    const { sumDividends } = await import('./stock-service.js');
    const stocks = await listStocks(finance, { status: 'all' });
    const entries = await listDividends(finance, { financeYear });
    return sumDividends(financialYear, stocks, entries);
  } catch (err) { logger.error('getDividendSummary failed:', err); return null; }
},
async getOverviewSummary(financialYear: string): Promise<OverviewSummary | null> {
  try {
    const self = createPublicWealthAdapter(finance);
    const [dividends, interest] = await Promise.all([self.getDividendSummary(financialYear), self.getInterestSummary(financialYear)]);
    if (!dividends || !interest) return null;
    const round2 = (n: number) => Math.round(n * 100) / 100;
    return { financialYear, dividends, interest, combined: { gross: round2(dividends.gross + interest.total), franking: round2(dividends.franking) } };
  } catch (err) { logger.error('getOverviewSummary failed:', err); return null; }
},
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/wealth-service-full.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/public-wealth-adapter.ts tests/wealth-service-full.test.ts
git commit -m "feat: complete wealth domain service with overview"
```

---

### Task 17: Global-FY regression + footer wiring + prettier + build checklist

**Files:**
- Modify: `src/ui/wealthflow-orchestrator.ts` (footer sums same query as grid)
- Test: `tests/global-fy.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/global-fy.test.ts
import { describe, it, expect } from 'vitest';
import { createMockFinance } from '../src/mock/finance-mock.js';
import { createBank } from '../src/dao/banks.js';
import { createInterestEntry } from '../src/dao/interest-entries.js';
import { createPublicWealthAdapter } from '../src/services/public-wealth-adapter.js';
describe('global FY', () => {
  it('different FYs give different totals (no drift)', async () => {
    const f: any = createMockFinance();
    const b: any = await createBank(f, { name: 'M', account_number: '1' });
    await createInterestEntry(f, { bank_id: b.id, date: '2025-07-31', amount: 5, finance_year: '2025-2026' }, '07-01');
    await createInterestEntry(f, { bank_id: b.id, date: '2024-07-31', amount: 7, finance_year: '2024-2025' }, '07-01');
    const svc = createPublicWealthAdapter(f);
    expect((await svc.getInterestSummary('2025-2026'))?.total).toBe(5);
    expect((await svc.getInterestSummary('2024-2025'))?.total).toBe(7);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/global-fy.test.ts`
Expected: FAIL only if service broken; otherwise documents the invariant (keep test).

- [ ] **Step 3: Write minimal implementation** — orchestrator `pushFinance()` sets `c.fy = this.fy` for every child before `reload()`; footer `footerTotal` updated in `pushFinance()` via `getInterestTotals` + `getDividendTotals` sum (same DAO queries as grid/log — single source); `fy-changed` from the tab-bar `<select>` triggers `pushFinance()` for all children + footer + Overview.

- [ ] **Step 4: Run verification**

Run: `npx vitest run`
Expected: ALL PASS (14+ files). Then:
```bash
npx prettier --check --single-quote "src/main.ts" "src/dao/**/*.ts" "src/services/**/*.ts" "src/ui/**/*.ts" "src/utils/**/*.ts" "src/mock/**/*.ts" "index.html"
# fix with --write on the same list if needed
npx tsc --noEmit
npm run build
```
Expected: prettier clean, tsc clean, `build/extension/wealthflow.js` exists <200KB.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: wire global FY footer and verify build"
```

---

## Self-review (against spec)

1. **Spec coverage:** §2 manifest → Task 1; §3.1 banks → Task 3; §3.2 interest+once-per-month → Task 4; §3.3 stocks → Task 11; §3.4 dividends+enum → Task 12; §4 build order (Bank-first, no dead buttons) → Tasks 6→10 then 11→16; §5 UI (orchestrator/tabs/global FY/grid/forms/overview/formatting/empty) → Tasks 7,8,9,10,14,15,17; §6 validation → Tasks 3,4,11,12 (+ amber mismatch in forms Tasks 10,14); §7 service → Tasks 6,13,16; §8 lifecycle → Task 10 (`main.ts`); §9 testing → every Task + mirror-of-sheet (Task 13) + global-FY (Task 17).
2. **Placeholder scan:** no TBD/TODO; every step has exact paths, complete code, exact commands, expected output.
3. **Type consistency:** `bankId/stockId` camelCase in service DTOs vs `bank_id/stock_id` snake_case in DAO rows — intentional (DTO boundary, matches spec §7); `finance_year` string `YYYY-YYYY` everywhere; `DividendType` union reused DAO→service→adapter; `viewForMount` mapping shared orchestrator↔main.

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-25-wealthflow-implementation.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
