# Superannuation Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Superannuation card to the Overview tab backed by one new table and one new domain-service method.

**Architecture:** Follows the established Bank/Stock layering exactly — `src/dao/super-entries.ts` owns all `finance.db.table('wealthflow_super_entries')` access with validation; `src/services/super-service.ts` owns FY-scoped aggregation (`balanceAsAt` + contribution sums); `public-wealth-adapter.ts` gains a thin `getSuperSummary` wrapper; `src/ui/super-form.ts` + a 4th overview card own presentation. No new tabs, commands, or navigation.

**Tech Stack:** TypeScript strict, Lit 3, vitest + happy-dom, `Intl` AUD formatting, native `type="date"` inputs, auto-derived `finance_year`.

**Design:** `docs/superpowers/specs/2026-09-27-wealthflow-superannuation.md` (read it first).

---

## File map

**Modify:**
- `package.json` — `tables` += `wealthflow_super_entries`; `allowedUiEvents` += 3 super events. No version bump (owner manages versions).
- `src/utils/finance-year.ts` — add `fyEndDate(fy)`.
- `src/services/public-wealth-adapter.ts` — `SuperSummary` interface + `getSuperSummary`.
- `src/ui/overview-view.ts` — 4th card + `showSuperForm` toggle + `super-form` in `pushToChildren` + 3 event listeners.
- `src/ui/index.ts` — register `super-form`.
- `tests/manifest.test.ts` — 4 → 5 tables + column check.

**Create:**
- `src/dao/super-entries.ts`, `src/services/super-service.ts`, `src/ui/super-form.ts`
- `tests/super.test.ts`, `tests/super-service.test.ts`, `tests/wealth-service-super.test.ts`, `tests/super-form.test.ts`

**Never touch:** `src/finance.d.ts`, `src/vendor/**`, `src/styles/*` vendored files (only read them).

---

### Task 1: Manifest table + event allowlist

**Files:**
- Modify: `package.json`
- Test: `tests/manifest.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// append inside describe('manifest', ...) in tests/manifest.test.ts
it('declares wealthflow_super_entries with kind/amount columns', () => {
  const fe: any = (pkg as any).financeExtension;
  expect(fe.tables.map((t: any) => t.name)).toContain('wealthflow_super_entries');
  const table = fe.tables.find((t: any) => t.name === 'wealthflow_super_entries');
  expect(table.columns.map((c: any) => c.name).sort()).toEqual(
    ['amount', 'date', 'finance_year', 'kind', 'notes'].sort(),
  );
  for (const evt of ['super-create', 'super-edit', 'super-delete'])
    expect(fe.contributions.allowedUiEvents).toContain(evt);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/manifest.test.ts`
Expected: FAIL with "expected [ ... ] to contain 'wealthflow_super_entries'".

- [ ] **Step 3: Write minimal implementation** — in `package.json` `financeExtension.tables`, append:

```json
{ "name": "wealthflow_super_entries", "columns": [
  { "name": "date", "type": "date", "nullable": false },
  { "name": "kind", "type": "text", "nullable": false },
  { "name": "amount", "type": "real", "nullable": false, "min": 0 },
  { "name": "finance_year", "type": "text", "nullable": false },
  { "name": "notes", "type": "text", "nullable": true }
]}
```

and in `contributes.allowedUiEvents` append `"super-create"`, `"super-edit"`, `"super-delete"`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/manifest.test.ts`
Expected: PASS (all manifest tests).

- [ ] **Step 5: Commit**

```bash
git add package.json tests/manifest.test.ts
git commit -m "feat: declare wealthflow_super_entries table and super ui events"
```

---

### Task 2: Super DAO with kind validation

**Files:**
- Create: `src/dao/super-entries.ts`
- Test: `tests/super.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/super.test.ts
import { describe, it, expect } from 'vitest';
import { createMockFinance } from '../src/mock/finance-mock.js';
import {
  createSuperEntry,
  listSuperEntries,
  updateSuperEntry,
  deleteSuperEntry,
} from '../src/dao/super-entries.js';

describe('super dao', () => {
  it('creates balance + contribution entries with auto FY', async () => {
    const f: any = createMockFinance();
    const b: any = await createSuperEntry(
      f,
      { date: '2025-08-15', kind: 'balance', amount: 125000 },
      '07-01',
    );
    expect(b.finance_year).toBe('2025-2026');
    await createSuperEntry(
      f,
      { date: '2025-09-01', kind: 'contribution', amount: 1000 },
      '07-01',
    );
    expect(await listSuperEntries(f, { financeYear: '2025-2026' })).toHaveLength(2);
    expect(await listSuperEntries(f, { kind: 'balance' })).toHaveLength(1);
  });
  it('rejects bad kind, negative amount, bad date', async () => {
    const f: any = createMockFinance();
    await expect(
      createSuperEntry(f, { date: '2025-08-01', kind: 'nope', amount: 1 }, '07-01'),
    ).rejects.toThrow(/kind must be one of/);
    await expect(
      createSuperEntry(f, { date: '2025-08-01', kind: 'balance', amount: -1 }, '07-01'),
    ).rejects.toThrow();
    await expect(
      createSuperEntry(f, { date: 'not-a-date', kind: 'balance', amount: 1 }, '07-01'),
    ).rejects.toThrow(/date must be YYYY-MM-DD/);
  });
  it('updates and deletes by id', async () => {
    const f: any = createMockFinance();
    const row: any = await createSuperEntry(
      f,
      { date: '2025-08-01', kind: 'contribution', amount: 500 },
      '07-01',
    );
    expect(await updateSuperEntry(f, row.id, { amount: 750 })).toBe(1);
    expect(await deleteSuperEntry(f, row.id)).toBe(1);
    expect(await listSuperEntries(f, {})).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/super.test.ts`
Expected: FAIL with "Failed to resolve import".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/dao/super-entries.ts
import type { FinanceApi } from 'finance';
import { computeFinanceYear, isValidIsoDate } from '../utils/finance-year.js';

export const SUPER_KINDS = ['balance', 'contribution'] as const;
export type SuperKind = (typeof SUPER_KINDS)[number];
export const SUPER_LABELS: Record<SuperKind, string> = {
  balance: 'Balance',
  contribution: 'Private contribution',
};

export interface SuperEntry {
  readonly id: number;
  readonly date: string;
  readonly kind: SuperKind;
  readonly amount: number;
  readonly finance_year: string;
  readonly notes: string | null;
}

export type SuperInput = {
  date: string;
  kind: string;
  amount: number;
  finance_year?: string;
  notes?: string | null;
};

export class SuperValidationError extends Error {
  readonly code = -32014;
  constructor(msg: string) {
    super(msg);
    this.name = 'SuperValidationError';
  }
}

const TABLE = 'wealthflow_super_entries' as const;

export async function createSuperEntry(
  finance: FinanceApi,
  input: SuperInput,
  fyStart = '07-01',
): Promise<SuperEntry> {
  if (!isValidIsoDate(input.date)) throw new SuperValidationError('date must be YYYY-MM-DD');
  if (!(SUPER_KINDS as readonly string[]).includes(input.kind))
    throw new SuperValidationError(`kind must be one of ${(SUPER_KINDS as readonly string[]).join(' | ')}`);
  if (!Number.isFinite(input.amount) || input.amount < 0)
    throw new SuperValidationError('amount must be ≥ 0');
  const fy = input.finance_year?.trim() || computeFinanceYear(input.date, fyStart) || '';
  if (!fy) throw new SuperValidationError('finance_year could not be determined');
  return (await finance.db.table(TABLE).insert({
    date: input.date,
    type: undefined,
    kind: input.kind,
    amount: input.amount,
    finance_year: fy,
    notes: input.notes ?? null,
  } as Record<string, unknown>)) as unknown as SuperEntry;
}

export async function updateSuperEntry(
  finance: FinanceApi,
  id: number,
  patch: Partial<SuperInput>,
): Promise<number> {
  if (patch.kind !== undefined && !(SUPER_KINDS as readonly string[]).includes(patch.kind))
    throw new SuperValidationError('kind must be one of balance | contribution');
  if (patch.amount !== undefined && (!Number.isFinite(patch.amount) || patch.amount < 0))
    throw new SuperValidationError('amount must be ≥ 0');
  if (patch.date !== undefined && !isValidIsoDate(patch.date))
    throw new SuperValidationError('date must be YYYY-MM-DD');
  return finance.db.table(TABLE).update({ id }, patch as Record<string, unknown>);
}

export async function deleteSuperEntry(finance: FinanceApi, id: number): Promise<number> {
  return finance.db.table(TABLE).delete({ id });
}

export async function listSuperEntries(
  finance: FinanceApi,
  filters: { kind?: string; financeYear?: string } = {},
): Promise<SuperEntry[]> {
  const q: Record<string, unknown> = {};
  if (filters.kind !== undefined) q.kind = filters.kind;
  if (filters.financeYear !== undefined) q.finance_year = filters.financeYear;
  const rows = (await finance.db.table(TABLE).find(q)) as unknown as SuperEntry[];
  return rows.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
```

NOTE: delete the stray `type: undefined,` line before committing — it is a leftover.
The mock `insert` spreads the payload verbatim, and the real DAO ignores
`undefined` values; the line must still go because `updateSuperEntry` would
persist a `type` key on partial patches. Remove it in Step 3.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/super.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/dao/super-entries.ts tests/super.test.ts
git commit -m "feat: add super entries dao with kind validation"
```

---

### Task 3: FY-end helper + super aggregation service

**Files:**
- Modify: `src/utils/finance-year.ts`
- Create: `src/services/super-service.ts`
- Test: `tests/super-service.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/super-service.test.ts
import { describe, it, expect } from 'vitest';
import { fyEndDate } from '../src/utils/finance-year.js';
import { sumSuper } from '../src/services/super-service.js';

describe('super service', () => {
  it('fyEndDate returns June 30 of the FY end year', () => {
    expect(fyEndDate('2025-2026')).toBe('2026-06-30');
  });
  it('latest balance is scoped to FY-end; contributions sum by FY', () => {
    const entries: any = [
      { date: '2025-08-15', kind: 'balance', amount: 100000, finance_year: '2025-2026' },
      { date: '2026-07-20', kind: 'balance', amount: 120000, finance_year: '2026-2027' },
      { date: '2025-09-01', kind: 'contribution', amount: 1000, finance_year: '2025-2026' },
      { date: '2025-10-01', kind: 'contribution', amount: 500, finance_year: '2025-2026' },
    ];
    const s = sumSuper('2025-2026', entries);
    expect(s.balance).toEqual({ amount: 100000, date: '2025-08-15' });
    expect(s.contributions).toEqual({ total: 1500, count: 2 });
  });
  it('empty FY returns null balance and zero contributions', () => {
    expect(sumSuper('2030-2031', [])).toEqual({
      financialYear: '2030-2031',
      balance: null,
      contributions: { total: 0, count: 0 },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/super-service.test.ts`
Expected: FAIL with "Failed to resolve import" (and `fyEndDate` missing).

- [ ] **Step 3: Write minimal implementation** — append to `src/utils/finance-year.ts`:

```ts
/** Last day (`YYYY-MM-DD`) of an AU financial year label, e.g. `'2026-06-30'`. */
export function fyEndDate(fy: string): string {
  const endYear = Number(fy.slice(5, 9));
  return `${endYear}-06-30`;
}
```

and create `src/services/super-service.ts`:

```ts
import type { FinanceApi } from 'finance';
import { fyEndDate } from '../utils/finance-year.js';
import type { SuperEntry } from '../dao/super-entries.js';
import { listSuperEntries } from '../dao/super-entries.js';
import type { SuperSummary } from './public-wealth-adapter.js';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function sumSuper(
  financialYear: string,
  entries: Pick<SuperEntry, 'date' | 'kind' | 'amount' | 'finance_year'>[],
): SuperSummary {
  const end = fyEndDate(financialYear);
  const balances = entries
    .filter((e) => e.kind === 'balance' && e.date <= end)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const top = balances[0];
  const mine = entries.filter((e) => e.kind === 'contribution' && e.finance_year === financialYear);
  return {
    financialYear,
    balance: top ? { amount: Number(top.amount), date: top.date } : null,
    contributions: {
      total: round2(mine.reduce((x, e) => x + Number(e.amount ?? 0), 0)),
      count: mine.length,
    },
  };
}

export async function getSuperTotals(finance: FinanceApi, financeYear: string): Promise<SuperSummary> {
  const entries = await listSuperEntries(finance, {});
  return sumSuper(financeYear, entries);
}
```

NOTE: `getSuperTotals` lists ALL entries (not FY-filtered) because the balance
leg needs pre-FY history. Do not "optimize" this to `{ financeYear }`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/super-service.test.ts tests/utils.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add src/utils/finance-year.ts src/services/super-service.ts tests/super-service.test.ts
git commit -m "feat: add super aggregation with FY-end balance scoping"
```

---

### Task 4: `getSuperSummary` domain-service method

**Files:**
- Modify: `src/services/public-wealth-adapter.ts`
- Test: `tests/wealth-service-super.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/wealth-service-super.test.ts
import { describe, it, expect } from 'vitest';
import { createMockFinance } from '../src/mock/finance-mock.js';
import { createSuperEntry } from '../src/dao/super-entries.js';
import { createPublicWealthAdapter } from '../src/services/public-wealth-adapter.js';

describe('getSuperSummary', () => {
  it('returns balance + contributions, empty→zeros, error→null', async () => {
    const f: any = createMockFinance();
    await createSuperEntry(f, { date: '2025-08-15', kind: 'balance', amount: 100000 }, '07-01');
    await createSuperEntry(f, { date: '2025-09-01', kind: 'contribution', amount: 1000 }, '07-01');
    const svc = createPublicWealthAdapter(f);
    const s: any = await svc.getSuperSummary('2025-2026');
    expect(s.balance).toEqual({ amount: 100000, date: '2025-08-15' });
    expect(s.contributions).toEqual({ total: 1000, count: 1 });
    const empty: any = await svc.getSuperSummary('2030-2031');
    expect(empty.balance).toBeNull();
    expect(empty.contributions).toEqual({ total: 0, count: 0 });
    const broken: any = { ...f, db: { table: () => { throw new Error('db down'); } } };
    expect(await createPublicWealthAdapter(broken).getSuperSummary('2025-2026')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/wealth-service-super.test.ts`
Expected: FAIL with "svc.getSuperSummary is not a function".

- [ ] **Step 3: Write minimal implementation** — in `src/services/public-wealth-adapter.ts`:

```ts
export interface SuperSummary {
  financialYear: string;
  balance: { amount: number; date: string } | null;
  contributions: { total: number; count: number };
}
```

add `getSuperSummary(financialYear: string): Promise<SuperSummary | null>;` to the
`PublicWealthService` interface, import `getSuperTotals` from `./super-service.js`,
and add the method inside `createPublicWealthAdapter`:

```ts
async getSuperSummary(financialYear: string): Promise<SuperSummary | null> {
  try {
    return await getSuperTotals(finance, financialYear);
  } catch (err) {
    logger.error('getSuperSummary failed:', err);
    return null;
  }
},
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/wealth-service-super.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/public-wealth-adapter.ts tests/wealth-service-super.test.ts
git commit -m "feat: add getSuperSummary domain service method"
```

---

### Task 5: Super card + toggleable log form in Overview

**Files:**
- Create: `src/ui/super-form.ts`
- Modify: `src/ui/overview-view.ts`, `src/ui/index.ts`
- Test: `tests/super-form.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/super-form.test.ts
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { createMockFinance } from '../src/mock/finance-mock.js';
import '../src/ui/super-form.js';

describe('super form', () => {
  it('date picker stores a date-derived FY entry and shows the auto line', async () => {
    const finance: any = createMockFinance();
    const form = document.createElement('super-form') as any;
    document.body.appendChild(form);
    await form.setFinance(finance);
    await form.updateComplete;
    const dateInput = form.renderRoot.querySelector('input[type="date"]') as HTMLInputElement;
    expect(dateInput).toBeTruthy();
    dateInput.value = '2025-08-15';
    dateInput.dispatchEvent(new Event('input', { bubbles: true }));
    const kind = form.renderRoot.querySelector('select') as HTMLSelectElement;
    kind.value = 'contribution';
    kind.dispatchEvent(new Event('change', { bubbles: true }));
    const amount = form.renderRoot.querySelector('input[inputmode="decimal"]') as HTMLInputElement;
    amount.value = '1000';
    amount.dispatchEvent(new Event('input', { bubbles: true }));
    await form.updateComplete;
    expect(form.renderRoot.textContent).toContain('2025-2026');
    form.renderRoot.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 0));
    const rows = await finance.db.table('wealthflow_super_entries').find({});
    expect(rows).toHaveLength(1);
    expect(rows[0].finance_year).toBe('2025-2026');
    expect(rows[0].kind).toBe('contribution');
    form.remove();
  });

  it('overview toggles the super form', async () => {
    await import('../src/ui/overview-view.js');
    const finance: any = createMockFinance();
    const el = document.createElement('overview-view') as any;
    document.body.appendChild(el);
    el.fy = '2025-2026';
    await el.setFinance(finance);
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;
    const root = el.renderRoot as ShadowRoot;
    const btn = [...root.querySelectorAll('button')].find(
      (b: any) => b.textContent?.trim() === 'Log super',
    ) as HTMLButtonElement;
    expect(btn).toBeTruthy();
    expect(root.querySelector('super-form')).toBeFalsy();
    btn.click();
    await el.updateComplete;
    expect(root.querySelector('super-form')).toBeTruthy();
    el.remove();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/super-form.test.ts`
Expected: FAIL with "Failed to resolve import" (`super-form.js` missing).

- [ ] **Step 3: Write minimal implementation** — create `src/ui/super-form.ts`
  (structure mirrors `interest-form.ts` exactly; only the differences are listed —
  copy the file and apply them):

```ts
import { LitElement, html } from 'lit';
import { sharedStyles } from '../styles/shared-styles.js';
import { wealthflowStyles } from '../styles/wealthflow-styles.js';
import { ExtensionLogger } from 'finance-logger';
import { computeFinanceYear, isValidIsoDate } from '../utils/finance-year.js';
import {
  SUPER_KINDS,
  SUPER_LABELS,
  createSuperEntry,
  updateSuperEntry,
  deleteSuperEntry,
  type SuperEntry,
} from '../dao/super-entries.js';

const Base = typeof HTMLElement !== 'undefined' ? LitElement : (class {} as unknown as typeof LitElement);
const logger = new ExtensionLogger('wealthflow');

export class SuperForm extends Base {
  static override styles = typeof HTMLElement !== 'undefined' ? ([sharedStyles, wealthflowStyles] as any) : [];
  finance: any = null;
  fy = '';
  kind = 'balance';
  date = '';
  amount = '';
  notes = '';
  editId: number | null = null;
  error = '';

  async setFinance(f: any): Promise<void> {
    this.finance = f;
    await this.reload();
  }

  async reload(): Promise<void> {
    if (!this.finance?.db) return;
    if (this.date === '') {
      const now = new Date();
      this.date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }
    (this as any).requestUpdate?.();
  }

  editEntry(entry: SuperEntry | null): void {
    if (!entry) {
      this.editId = null;
      this.amount = '';
      this.notes = '';
    } else {
      this.editId = entry.id;
      this.kind = entry.kind;
      this.date = entry.date;
      this.amount = String(entry.amount);
      this.notes = entry.notes ?? '';
    }
    (this as any).requestUpdate?.();
  }

  private get autoFy(): string {
    if (!isValidIsoDate(this.date)) return '';
    return computeFinanceYear(this.date, '07-01') ?? '';
  }

  private async onSubmit(e: Event): Promise<void> {
    e.preventDefault();
    this.error = '';
    const amount = Number(this.amount);
    if (!isValidIsoDate(this.date)) {
      this.error = 'Date must be YYYY-MM-DD.';
      (this as any).requestUpdate?.();
      return;
    }
    if (!Number.isFinite(amount) || amount < 0) {
      this.error = 'Amount must be ≥ 0.';
      (this as any).requestUpdate?.();
      return;
    }
    const fyForSave = this.autoFy;
    try {
      if (this.editId == null) {
        const row = await createSuperEntry(
          this.finance,
          { date: this.date, kind: this.kind, amount, finance_year: fyForSave, notes: this.notes.trim() === '' ? null : this.notes.trim() },
          '07-01',
        );
        this.dispatchEvent(new CustomEvent('super-create', { detail: { entry: row }, bubbles: true, composed: true }));
      } else {
        await updateSuperEntry(this.finance, this.editId, {
          date: this.date,
          kind: this.kind,
          amount,
          finance_year: fyForSave,
          notes: this.notes.trim() === '' ? null : this.notes.trim(),
        });
        this.dispatchEvent(new CustomEvent('super-edit', { detail: { id: this.editId }, bubbles: true, composed: true }));
      }
      this.editEntry(null);
    } catch (err: any) {
      logger.error('super save failed:', err);
      this.error = String(err?.message || err);
      (this as any).requestUpdate?.();
    }
  }

  private async onDelete(): Promise<void> {
    if (this.editId == null) return;
    if (typeof confirm !== 'undefined' && !confirm('Delete this super entry?')) return;
    try {
      await deleteSuperEntry(this.finance, this.editId);
      this.dispatchEvent(new CustomEvent('super-delete', { detail: { id: this.editId }, bubbles: true, composed: true }));
      this.editEntry(null);
    } catch (e: any) {
      this.error = String(e?.message || e);
      (this as any).requestUpdate?.();
    }
  }

  override render(): unknown {
    if (typeof HTMLElement === 'undefined') return html``;
    return html`
      <div class="section">
        <h3>${this.editId == null ? 'Log Super' : 'Edit Super Entry'}</h3>
        ${this.error ? html`<p class="field-error">Error: ${this.error}</p>` : ''}
        <form @submit=${this.onSubmit}>
          <label>Date
            <input
              type="date"
              .value=${this.date}
              @input=${(e: Event) => {
                this.date = (e.target as HTMLInputElement).value;
                (this as any).requestUpdate?.();
              }}
            />
          </label>
          <p class="muted">Financial year (auto): ${this.autoFy || '—'}</p>
          <label>Entry
            <select
              @change=${(e: Event) => {
                this.kind = (e.target as HTMLSelectElement).value;
                (this as any).requestUpdate?.();
              }}
            >
              ${(SUPER_KINDS as readonly string[]).map(
                (k) => html`<option value=${k} ?selected=${this.kind === k}>${SUPER_LABELS[k as keyof typeof SUPER_LABELS]}</option>`,
              )}
            </select>
          </label>
          <label>Amount (AUD)
            <input
              .value=${this.amount}
              @input=${(e: Event) => {
                this.amount = (e.target as HTMLInputElement).value;
                (this as any).requestUpdate?.();
              }}
              inputmode="decimal"
              placeholder="0.00"
            />
          </label>
          <label>Notes <input
            .value=${this.notes}
            @input=${(e: Event) => {
              this.notes = (e.target as HTMLInputElement).value;
              (this as any).requestUpdate?.();
            }}
          /></label>
          <button class="btn-primary" type="submit">${this.editId == null ? 'Log Super' : 'Save'}</button>
          ${this.editId != null
            ? html`<button class="filter-btn" type="button" @click=${() => this.editEntry(null)}>Cancel</button>
                <button class="filter-btn" type="button" @click=${() => this.onDelete()}>Delete</button>`
            : ''}
        </form>
      </div>
    `;
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('super-form')) {
  customElements.define('super-form', SuperForm as unknown as CustomElementConstructor);
}
```

Then modify `src/ui/overview-view.ts`:
1. State: add `showSuperForm = false;` next to `showDividendForm`.
2. `pushToChildren` selector list: add `'super-form'`.
3. `toggleForm(which: 'dividends' | 'interest' | 'super')` — add the super branch.
4. `connectedCallback`/`disconnectedCallback`: add `super-create`, `super-edit`, `super-delete` with `this._onFormChanged`.
5. Render — insert the Superannuation card between the Interest card and the Combined card:

```html
<!-- Superannuation -->
<div class="section flush">
  <div class="section-header">
    <h3 class="section-title">Superannuation — FY ${this.fy}</h3>
    <div class="header-actions">
      ${s.super.balance
        ? html`<span class="rate-badge">Balance ${formatAUD(s.super.balance.amount)}</span>`
        : html`<span class="rate-badge">No balance</span>`}
      <button class="btn btn-secondary" @click=${() => this.toggleForm('super')}>
        ${this.showSuperForm ? 'Hide form' : 'Log super'}
      </button>
    </div>
  </div>
  <div class="section-body">
    <div class="stat-grid">
      <div class="stat">
        <div class="stat-label">Latest balance</div>
        <div class="stat-value">${s.super.balance ? formatAUD(s.super.balance.amount) : formatAUD(0)}</div>
      </div>
      <div class="stat">
        <div class="stat-label">FY contributions</div>
        <div class="stat-value">${formatAUD(s.super.contributions.total)}</div>
      </div>
      <div class="stat">
        <div class="stat-label"># contributions</div>
        <div class="stat-value">${s.super.contributions.count}</div>
      </div>
    </div>
    ${this.showSuperForm ? html`<super-form></super-form>` : ''}
  </div>
</div>
```

6. `reload()` — extend the summary assembly to include super. Replace the
`getOverviewSummary` invoke branch AND the DAO fallback: the service path
already returns the full shape once Task 4 lands, so in the fallback add:

```ts
const { getSuperTotals } = await import('../services/super-service.js');
const [interest, dividends, super_] = await Promise.all([
  getInterestTotals(this.finance, banks, this.fy),
  getDividendTotals(this.finance, stocks, this.fy),
  getSuperTotals(this.finance, this.fy),
]);
```

and include `super: super_` in the assembled summary. (`super` is a reserved
word — always name the local `super_`.)

7. The `OverviewSummary` type gains `super: SuperSummary` in Task 4 — update
`public-wealth-adapter.ts` `OverviewSummary` interface AND the `getOverviewSummary`
implementation to fetch all three in `Promise.all` and include `super`.
Also update `tests/wealth-service-full.test.ts`? No — that file asserts the old
shape indirectly; instead extend `tests/wealth-service-super.test.ts` in Task 4
with: `const o = await svc.getOverviewSummary('2025-2026'); expect(o.super.contributions.total).toBe(1000);`

8. `src/ui/index.ts` — import `SuperForm` and register `super-form` next to the others.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsc --noEmit && npx vitest run tests/super-form.test.ts`
Expected: PASS (2 tests), tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/ui/super-form.ts src/ui/overview-view.ts src/ui/index.ts src/services/public-wealth-adapter.ts tests/super-form.test.ts tests/wealth-service-super.test.ts
git commit -m "feat: superannuation overview card with toggleable log form"
```

---

### Task 6: Full verify + commit

**Files:** (none new — verification only)

- [ ] **Step 1: Run the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: ALL PASS (19+ files).

- [ ] **Step 2: Prettier check** (repo standard — never format vendored snapshots)

```bash
npx prettier --check --single-quote "src/main.ts" "src/dao/**/*.ts" "src/services/**/*.ts" "src/ui/**/*.ts" "src/utils/**/*.ts" "src/mock/**/*.ts" "tests/**/*.ts" "package.json" "index.html"
# fix with --write on the same list if needed
```

- [ ] **Step 3: Manual check in dev** (`npm run dev` — mock DB is ephemeral)

1. Overview tab → Superannuation card shows `$0.00` stats + hint-free empty state.
2. `Log super` → date picker defaults today, auto-FY line matches the global FY.
3. Log a balance 100000 + a contribution 1000 → stats update, badge updates.
4. Switch global FY → card re-queries (no drift); balance dated after FY-end excluded.
5. Reload page → mock data gone (expected — ephemeral).

- [ ] **Step 4: Commit anything remaining**

```bash
git status --short
git add -A -- . ":!docs/superpowers/specs" ":!src/seed"
git commit -m "feat: superannuation section verification and cleanup"
```

---

## Self-review

1. **Spec coverage:** §2 manifest → Task 1; §3 table + validation → Task 2;
   FY auto rule → Tasks 2–3 (`fyEndDate` + `computeFinanceYear` reuse);
   §4 card/form/toggle → Task 5; §5 validation → Tasks 2, 5;
   §6 `getSuperSummary` + FY-end scoping → Tasks 3–4; §7 non-goals have no tasks
   by design (footer untouched, no seed, no reorder).
2. **Placeholder scan:** Task 2 names the one intentional code wart (stray
   `type: undefined` line) with a removal instruction instead of leaving it
   ambiguous. No TBD/TODO/"similar to" anywhere else.
3. **Type consistency:** `SuperKind`/`SuperEntry`/`SuperInput`/`SuperSummary`
   spelled identically across DAO/service/adapter/form/test; `bank-id`-style
   snake_case in rows vs camelCase DTOs matches the existing bank/stock
   convention; `super_` local avoids the reserved word; `getSuperTotals`
   takes `(finance, financeYear)` like `getDividendTotals`.

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-27-superannuation-implementation.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
