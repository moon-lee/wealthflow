# Wealthflow Superannuation Design

**Date:** 2026-09-27 (add-on to the 2026-09-23 Bank + Stock design).
**Scope:** One new `Superannuation` section inside the existing Overview tab: log super
balance snapshots (any date) + private (personal voluntary) contributions, backed by
one new table and one new domain-service method. No new tabs, commands, or views.
**Approach:** Same SDK pattern as Bank/Stock: `wealthflow_*` table, typed DAO,
service aggregation, public `wealthflow` adapter method, Lit card + toggleable form.

## 1. Background

The sheet's `Super Contribution` tab mixes employer SG postings, admin fees, and a few
`Member Contribution` rows in inconsistent layouts — not importable as-is. The v1 ask
is narrower and forward-looking: record the fund **balance** whenever the user checks
it, and record **private contributions** (personal voluntary, the Tax-deduction input).
Employer SG, fees, and balance roll-forward are explicitly deferred (§7).

## 2. Manifest deltas (`package.json` `financeExtension`)

- `tables` += one entry (§3). New tables install safely under
  `CREATE TABLE IF NOT EXISTS` — existing `wealthflow_*` data is untouched
  (contrast with column renames, which need Delete Data).
- No new `views` / `commands` / `navigation` — the section lives in Overview,
  reached via the existing `wealthflow.show-overview` command.
- `allowedUiEvents` += `super-create`, `super-edit`, `super-delete`.
- No version bump in this change (owner manages versions during dev).

## 3. Table: `wealthflow_super_entries` (single log, kind-split)

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | integer | PK, autoincrement | |
| `date` | date | NOT NULL | Balance-as-at date, or contribution payment date. Any date. |
| `kind` | text | NOT NULL | App-validated enum `balance \| contribution` (labels `Balance` / `Private contribution`). Stored plain text, dividends-`type` precedent — no DB enum. |
| `amount` | real | NOT NULL, `min: 0` | Balance value OR contribution amount, per `kind`. AUD, stored plain. |
| `finance_year` | text | NOT NULL | Auto-filled via `computeFinanceYear(date, '07-01')`, display-only (standing date-picker rule). |
| `notes` | text | NULL | e.g. fund name, receipt ref. |
| `created_at` / `updated_at` | datetime | auto | Added by installer, never declared. |

**Explicitly no once-per-month rule:** balances may be logged any time (multiple
snapshots per month are meaningful); multiple contributions per month are normal.
Dedupe is by exact `(kind, date, amount)` only in the seed path — there is no seed
for super in v1 (manual entry; the xlsx sheet is deferred per §1).

## 4. UI: 4th Overview card (no new tab)

```
┌ Superannuation ── FY 2025–2026 ── [Gross badge: latest balance] [Log super] ┐
│ Latest balance   FY contributions   # contributions                          │
│   $X                 $Y                 N                                    │
│ date | kind | amount  (FY history, delete per row)                          │
│ [Log super form ─ date picker | kind | amount | auto-FY | notes] (toggled)  │
└────────────────────────────────────────────────────────────────────────────┘
```

- Card order: Dividends, Interest, **Superannuation**, Combined (activity together,
  summary last). Footer unchanged — super is not taxable income.
- `super-form.ts` mirrors `interest-form.ts`: date picker, kind select, amount,
  muted auto-FY line, notes; `editEntry()` + delete-with-confirm for corrections.
  Embedded in the card behind the `Log super` toggle (same pattern as the other cards).
- History table reuses `.hist-table` (date | kind label | amount num + Delete).
- Empty FY → `$0.00` stats + per-card hint, never an error.

## 5. Validation & errors

- `kind` in enum, else `type must be one of balance | contribution`.
- `amount` finite `≥ 0`; `date` valid ISO `YYYY-MM-DD`.
- DAO errors propagate typed; service returns `null` on error (graceful contract).

## 6. Domain service: `getSuperSummary` (additive, same `wealthflow` name)

```ts
invoke('wealthflow', 'getSuperSummary', ['2025-2026']);
// → { financialYear,
//     balance: { amount, date } | null,   // latest kind='balance' with date <= FY-end (June 30)
//     contributions: { total, count } }   // kind='contribution', finance_year === FY
// → null only on error. Empty FY → { balance: null, contributions: { total: 0, count: 0 } }.
```

- Consumer design (ADR-0005): Tax reads `contributions.total` (personal-deduction
  input); a future dashboard card reads `balance`. One method serves both.
- `balance` is FY-scoped ("as at end of FY"), not lifetime-latest — a Tax/FY
  consumer must never see a future balance. Contributions scope by stored
  `finance_year` (same as dividends/interest).

## 7. Non-goals (v1)

Employer SG import, fee tracking, automatic balance roll-forward
(`prev + contributions + earnings`), fund-level breakdowns, charts, footer
inclusion, seed/extractor rows (manual entry only), card reorder.

## Self-review

1. **Placeholder scan:** no TBD/TODO; deferrals named with owners (§1, §7).
2. **Internal consistency:** single table per owner request (§3) with kind-split
   instead of two tables; FY auto + display-only matches the standing date-picker
   rule; balance FY-end scoping (§6) prevents future leakage; footer exclusion
   justified (not income); no new tabs/commands matches "section in overview".
3. **Scope check:** one table + one method + one card + one form; Overview-only.
4. **Ambiguity check:** "private contribution" = personal voluntary (deductible
   input); "balance" = snapshot value, never summed; `amount` meaning pinned to
   `kind`; empty-FY shape defined.
