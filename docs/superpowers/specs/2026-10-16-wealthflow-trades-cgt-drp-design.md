# Wealth Flow — Trades, Parcels, CGT & DRP: design

**Date:** 2026-10-16
**Status:** Design, approved by owner in the brainstorming sessions of 2026-10-16. Not yet planned.
**Companion to:** `2026-09-23-wealthflow-design.md` (Bank + Stock v1) and `2026-09-23-wealthflow-future-trades-cgt-drp.md` (the concept note this implements).
**Supersedes:** nothing. Additive to v1 tables; no existing table or column is dropped.

---

## 1. Intent and the why

Wealth Flow currently tracks *income*: bank interest, dividends, franking credits, superannuation. It tracks holdings as a single number per stock — `wealthflow_stocks.shares` is typed by hand and is the only thing known about a position.

That is enough to answer "what did I earn this year" and nothing else. It cannot answer the questions that actually matter once you own equities:

- If I sell 25 units tomorrow, **what does it cost me in tax?**
- How much of my holding has passed its 12-month mark, and when does the rest?
- What is my actual cost base after five years of dividend reinvestment?

Those questions need **parcels** — the specific batch of units bought on a specific date at a specific price — because Australian CGT taxes the disposal of a batch, not of a holding. "40 VAS" is one number to a human and twenty-nine separate things to the tax calculation.

The feature exists to put a parcel ledger behind every holding, allocate sales across it, and show the tax consequence **before** the sale is committed.

**Success looks like:** opening the Trades section, typing a sell quantity, and reading the exact tax figure without consulting anything else.

## 2. Goals

- Record buy, sell and DRP events as first-class immutable facts.
- Derive parcels from those facts, always rebuildable, never hand-edited.
- Show the FIFO allocation and its tax outcome live, before a sale is saved.
- Produce an FY capital gains summary accurate enough to hand to a tax agent.
- Keep the existing Overview, Banks and Stocks **flows** untouched. The one exception is `wealthflow_stocks.shares`, which becomes a derived cache — see §10.

## 3. Non-goals

| Non-goal | Why |
| --- | --- |
| Specific parcel identification | The ATO permits choosing which parcel to sell. FIFO only for now. The allocation is shown, so the omission is visible rather than silent. |
| Sale brokerage / capital costs | Cost base covers acquisition costs. Selling costs are capital costs and reduce the gain separately. Out of scope; must be called out in the UI, not silently ignored. |
| Wash sales | Explicitly out of scope. |
| Small business concessions | Out of scope. |
| Super accounts | Different discount treatment. Out of scope while individual-only. |
| Indexation method (pre-CGT assets) | No pre-CGT assets in this portfolio. |
| Market pricing of assets | Wealth Flow is a record, not a market data feed. Sell prices are typed. |

## 4. A rule change with a date on it

The 2026 federal budget replaced the 50% CGT discount with **cost-base indexation for assets held more than 12 months, effective 1 July 2027**, alongside a new 30% tax on capital gains. This is sourced from a secondary reference and **must be verified against the budget papers before phase 2.** The specific mechanics of the 30% charge are not confirmed.

This does not invalidate the design. Parcels exist to hold per-acquisition cost base, which is required under either regime, so parcels, FIFO, allocation and cost base are all invariant. What changes is the **final adjustment applied at disposal**.

**Therefore the disposal adjustment is a date-keyed rule set, never a hardcoded 50%.** The rule takes **dates, not a month count**, because a month count cannot express the regime boundary and cannot express eligibility to the day.

```
adjustmentFor(acquiredDate, disposalDate) -> { eligible: boolean, factor: number }
```

Phase 1 returns the 50% discount for `disposalDate >= acquiredDate + 12 calendar months`. The 2027 rule is added as a second entry later. Eligibility is **computed on read from `acquired_date`, never stored** — a stored boolean goes stale the instant a parcel crosses its own line, which is exactly the case in the captured data.

## 5. Data model

New tables, all prefixed `wealthflow_` per the manifest rule. `id`, `created_at`, `updated_at` are added automatically by `table-ddl.ts` and are not declared.

**Money columns are REAL holding 4 decimal places**, and only rounded for display. Fractional unit counts from DRP produce costs like $105.001 that a 2dp column would round away. Parity with the existing `finance_year` column on every table is kept — `seed-sql.test.ts` audit #4 enforces it.

### `wealthflow_trades`

| Column | Type | Notes |
| --- | --- | --- |
| `stock_id` | integer | FK to `wealthflow_stocks.id` |
| `date` | date | |
| `side` | text | enum `buy` / `sell` |
| `quantity` | real | fractional allowed — DRP produces them |
| `price` | real | per unit. For a DRP this is the DRP price, not a market quote. |
| `brokerage` | real | default 0. **Acquisition only** — see §6.6. |
| `source` | text | enum `manual` / `drp` / `import` |
| `dividend_id` | integer | nullable; set on DRP rows, links to `wealthflow_dividends` |
| `notes` | text | nullable |

A DRP is therefore represented as a `buy` trade with `source = 'drp'` and `dividend_id` set. This keeps the trade history — the thing §6.3 replays — complete and self-contained; a parcel can be rebuilt from trades alone without joining to dividends.

### `wealthflow_parcels`

Derived. Rebuildable. **Never written by the UI.** A parcel is identified by its **`(stock_id, origin_trade_id)` natural key**, never by `id`.

| Column | Type | Notes |
| --- | --- | --- |
| `stock_id` | integer | |
| `origin_trade_id` | integer | the buy or DRP that created it |
| `acquired_date` | date | = trade date |
| `quantity` | real | quantity **as acquired**; remaining is `quantity − sum(disposals)` |

Eligibility is **not a column.** It is computed on read (see §4). Storing it would freeze a value that changes on its own every day.

### `wealthflow_disposals`

| Column | Type | Notes |
| --- | --- | --- |
| `trade_id` | integer | the sell |
| `origin_trade_id` | integer | the parcel consumed — **by natural key, not `parcel_id`** |
| `finance_year` | date-derived text | parity with every other v1 table |
| `quantity` | real | portion taken |
| `proceeds` | real | qty × price, gross of selling costs |
| `cost_base` | real | this portion's cost base incl. pro-rata AMIT adjustment |
| `nominal_gain` | real | proceeds − cost_base |
| `discount_applied` | real | signed — see §6.2 |
| `net_gain` | real | what carries into the FY summary |

Referencing `origin_trade_id` rather than `parcel_id` is deliberate. A rebuild may re-mint parcel rows, and a disposal that pointed at a regenerated `id` would silently detach from the parcel it describes. Against a stable natural key, rebuild is free.

### `wealthflow_cost_base_adjustments`

**Fund-level, not parcel-level.** See §6.3 — this is a deliberate correction to the concept note.

| Column | Type | Notes |
| --- | --- | --- |
| `stock_id` | integer | the fund |
| `date` | date | the distribution date it attaches to |
| `amount` | real | signed; negative reduces cost base |
| `reason` | text | e.g. "AMIT cost base reduction (2025 tax statement)" |

### `wealthflow_capital_losses`

| Column | Type | Notes |
| --- | --- | --- |
| `finance_year` | text | |
| `opening_balance` | real | user-entered, default 0 |

**User-entered only.** Wealth Flow cannot infer a loss realised in a year before it tracked anything, so the owner may record an opening balance for the first FY they care about. No automatic FY-close write, no reconciliation.

Carried-forward is then computed by recurrence from the earliest FY that has an opening balance:

```
carriedForward(fy)      = openingBalance(fy) + carriedForward(fy - 1)
carriedForward(firstFy) = openingBalance(firstFy)
netLoss(fy)             = max(0, carriedForward(fy) + lossesThisFY - gainsThisFY)
```

If no opening balance has ever been entered, carried-forward is `0` and **the UI says so** rather than presenting a zero that implies none was ever lost.

## 6. The parts that carry judgement

### 6.1 Cost base

Per the concept note, and sufficient for listed-share cases: **cost base = price + brokerage, per acquisition.** ShareSight's own "Value" column confirms this convention — it reports trade value *including* brokerage.

The concept note reserved `wealthflow_cost_base_adjustments {parcel/event, ...}`. **That is corrected here.** Real data (ShareSight, VAS, Oct 2021 – Oct 2026) shows adjustments arrive as a **per-distribution, fund-level dollar amount on a date** — `$−3.19 on 18 Jul 2022`, `$+0.55 on 16 Jul 2026`, `$0.00` for most of 2024–26. They say nothing about which parcel was uplifted.

So adjustments are stored against the **fund** and applied **pro-rata across that fund's parcels at the moment of disposal**, across the shares actually sold. Nothing is guessed in advance and nothing is permanently wrong if parcels change later. The 12-month discount is unaffected — it keys off acquisition date, not cost base.

For a single-parcel holding the two approaches give identical answers. They diverge only when one fund has multiple lots, which is precisely when a frozen guess is worst.

Observed magnitude: **−$4.43 across five years.** The machinery must be correct; volume is negligible.

### 6.2 Loss ordering and the discount

Load-bearing, and the most common way to get this wrong. Two rules, in order:

**Rule 1 — losses offset gains, and only eligible gains are discounted.**

The adjustment is a property of the **parcel**, not of the year. A gain on a parcel held under 12 months is never discounted, no matter what else happened that year. So the netting is done in two buckets:

```
eligibleNet   = Σ nominal_gain over parcels where adjustmentFor() is eligible
ineligibleNet = Σ nominal_gain over parcels where it is not
netGain       = eligibleNet × factor  +  ineligibleNet
```

**Rule 2 — `discount_applied` is signed from the taxpayer's point of view.** A positive number reduces what they owe; a negative number is what the adjustment took off a gain. Because a *discounted loss shrinks*, the adjustment on a losing disposal is **positive**.

Worked example, FY 2027 — this is the acceptance fixture, pinned in `tests/cgt-service.test.ts`:

| Stock | Cost base | Proceeds | Nominal | Adjustment | Net |
| --- | ---: | ---: | ---: | ---: | ---: |
| VAS | $2,422.50 | $2,800.00 | $377.50 | −$164.50 | $213.00 |
| VHY | $841.00 | $820.00 | −$21.00 | **+$10.50** | −$10.50 |
| **Total** | **$3,263.50** | **$3,620.00** | **$356.50** | **−$154.00** | **$202.50** |

Walk it, because it is easy to get wrong:

- VAS is two parcels. $329.00 of the nominal gain came from a 28-month parcel → eligible → halved to $164.50. $48.50 came from an 11-month parcel → ineligible → untouched. So VAS nets **$164.50 + $48.50 = $213.00**, and the adjustment is −$164.50, **not** half of $377.50.
- VHY's $21.00 loss came from a 38-month parcel. The discount halves a loss too, so it shrinks to $10.50 — the adjustment is **+$10.50**, adding back magnitude.
- Net eligible = $329.00 − $21.00 = $308.00, halved = **$154.00**. Plus ineligible $48.50 = **$202.50**. ✓

Discounting the whole $356.50 aggregate instead would give $178.25 and would be **wrong**, because it would discount a parcel that has not been held a year.

**Cost base on a partial sale is proportional, not "the whole brokerage again."** Selling 5 units of a 15-unit parcel bought at $102.10 with $3 brokerage takes $1,534.50 × 5/15 = **$511.50**, not $513.50. Charging the full $3 each time inflates the gain by $3 every time the parcel is partly sold, and does not conserve. The earlier version of this section stated $513.50 and is corrected here; `conserves cost base across the whole holding` is now a test, so a regression fails loudly.

The UI states this in a footnote rather than leaving it to be reverse-engineered from four numbers.

### 6.3 FIFO allocation

Oldest acquisition first. Deterministic, and therefore replayable.

**Editing replays the entire allocation from the earliest trade on every change.** If the replay balances, the edit saves and every downstream tax figure updates. If it does not — for example reducing a buy so fewer units exist than a later sell requires — **the edit is refused with the reason.** Cosmetic corrections (a brokerage figure from $3.00 to $3.50) sail through; structural ones are caught.

This is the concrete answer to the concept note's "immutable trade". Trades are not immutable; *derived* state is.

### 6.4 DRP

One payment, two consequences, written **together or not at all**:

1. a dividend receipt, assessable and franked as normal;
2. a parcel at the **DRP price per unit**, which is derived (`reinvested ÷ units`) and is **not** the market price — DRP units typically buy in at a discount.

A parcel cannot be back-filled from a market quote later, so the DRP price must be captured at logging time.

The failure the concept note warns about — recording income XOR recording the parcel — is prevented by making them a single coupled write. The Finance DB API exposes only single-row `insert`/`update`/`delete`, with **no transaction and no batch insert**, so the coupling is a **compensating rollback**:

1. insert or update the dividend → capture its `id`
2. insert or update the DRP trade, `source = 'drp'`, `dividend_id` = that `id`
3. if step 2 throws, undo step 1 (delete a created row, restore the prior values on an edited row) and surface the error

Any other approach needs a schema feature the host does not offer.

### 6.5 LIC handling

`FGX` is a **Listed Investment Company, not an ETF.** Consequences:

- **No AMIT.** No cost base adjustments ever. The adjustment table simply has no FGX rows.
- **The 50% discount applies normally.** It is held 12 months or more like anything else on the ASX.
- **Capital losses are not ring-fenced.** Australian CGT buckets assets as collectables / personal use / **all other assets**. Shares and LICs are both in the third, so an FGX loss pools with VAS gains in the same year.
- **It does not trade at a screen price.** A disposal is a negotiated bid or a buyback. The price is typed, and the sell form must not imply a market quote exists.

Owner decision: FGX gets **full CGT treatment**, same machinery as the ETFs.

### 6.6 Selling costs are not captured

`brokerage` on `wealthflow_trades` is **acquisition only**. On the Sell state the brokerage field is not rendered, and a non-null brokerage on a sell is rejected by validation rather than silently stored and ignored.

Selling costs are capital costs that reduce the gain separately from cost base. §3 makes them a non-goal; the honest form of that is to refuse the input, not to accept it and drop it on the floor.

## 7. Views

One `views[]` entry (`wealthflow`) is retained — one Activity Bar button, one panel. Sections are `navigation[]` items that retarget the panel through `mount.view`, which is the pattern the extension already uses for Overview / Banks / Stocks.

```
Overview   existing + one new collapsible section
Banks      unchanged
Stocks     gains an opening-position path (see §8)
Trades     NEW   segmented: Trades │ Parcels
```

### 7.1 Trades — Trades segment

- **One form with a Buy/Sell toggle** in the section header. Not two tabs: DRP creates a buy, so both sides must be the same shape.
- The form renders **above** the list, matching `dividend-form` / `interest-form` / `super-form`. On save it folds away via `trade-form-close`.
- On the **Sell** state, a **FIFO allocation preview appears below the fields**, live as you type: one row per parcel consumed, with units taken, acquisition date, age in months, whether the discount applies, cost base, proceeds, nominal gain and gain after discount, plus totals. This is the reason the section exists.
- The preview always shows the full allocation **regardless of the finance-year selector** — a sale dated in FY 2027 consumes parcels bought in FY 2024.
- Guard: cannot sell more than is held, and the refusal says why.

### 7.2 Trades — Parcels segment

**Grouped by holding, expanding to the parcel ledger.** VAS alone is 29 parcels averaging 5.4 units; a flat list does not work at this scale.

Group row: stock, units, parcel count, average cost, discount-eligible units (`154 / 165` in the VAS case), and a Sell shortcut.

Expanded parcel row: parcel number, units, acquired date, source (Buy/DRP), cost base, per-unit cost, held duration, and **discount status expressed as a countdown** — `Eligible`, `In 1 month`, `Eligible today`. The countdown is not decoration: a parcel can cross the 12-month line on the day it is viewed, which is exactly the case in the captured data (VAS parcel acquired 16 Oct 2025, qualifying 16 Oct 2026).

Clicking a parcel opens its detail: running cost base history including AMIT adjustments, and the disposals that consumed it.

A "Rebuild from trades" action recomputes parcels from scratch.

### 7.3 Overview — Capital gains section

A **fourth collapsible section, collapsed by default**, below Superannuation.

Four cards in the existing `stat-grid cols-4` idiom: **Gross capital gain · Losses applied · 50% discount · Net capital gain**, with a per-stock table beneath and a footnote stating the loss-before-discount ordering and the carried-forward loss balance. A "Copy for Tax" action emits the figures as text.

### 7.4 Finance year

The topbar selector gains **All years**, and **defaults to it on Trades and Parcels**. Overview remains FY-scoped.

The option is **scoped to the Trades tab**. It is not offered on Banks or Overview, because those children query `finance_year: fy` literally and would receive the sentinel as a year, returning zero rows silently rather than erroring. `pushFinance()` must therefore only assign `fy` to children that declare they want it, rather than assigning to every child unconditionally as it does today.

The rationale: a position ledger is not a period report. Without this, a user selecting FY 2026 sees a Trades log with one entry and a Parcels ledger holding units bought in three different years, with no screen showing where a recent sale went.

Each stock row in the Capital gains table links through to Trades, filtered to that stock.

### 7.5 DRP and AMIT adjustments — both on the dividend form

**No new view for either, and no separate adjustment form.**

**DRP.** Two fields on the **existing dividend form**: amount reinvested and units acquired, with the per-unit price derived from them. Checkbox off by default. Coupling per §6.4.

**AMIT cost base adjustment.** One field on the **same dividend form** — it is a figure printed on the distribution line of the annual tax statement, so it is captured where the rest of that line already is. It writes a row to `wealthflow_cost_base_adjustments`, which is fund-level and per-distribution (§6.1). No `parcel-adjustment-create` event exists, because there is no adjustment-form UI to emit one; the value rides along with `dividend-create` / `dividend-edit`.

This is a correction to an earlier draft of this document, which allowlisted an adjustment event with no screen behind it.

## 8. Migration

The owner holds VAS, VHY and FGX. `wealthflow_stocks.shares` is hand-typed and must become derived, or existing holdings will read as zero units.

**The full acquisition history is already known.** Reconciled against `AllTradesReport.xlsx`, the three held positions total **1,296 units across 46 parcels** and a **$18,048.15** cost base:

| | Units | Parcels | Cost base | Discount-eligible |
| --- | ---: | ---: | ---: | --- |
| VAS | 165 | 32 | $15,233.73 | 154 of 165 |
| VHY | 22 | 5 | $1,530.34 | 22 of 22 |
| FGX | 1,109 | 9 | $1,284.08 | 832 of 1,109 |

Every parcel comes from exactly one trade, and there are **no disposals, splits or consolidations** across the whole portfolio — so the parcel-is-one-trade invariant holds exactly as the data stands. The import path is a **one-off importer** that reads the ShareSight workbook and writes trades, not an "opening position" form requiring the owner to reconstruct dates.

The **workbook is authoritative and the ShareSight page scrape is stale** — it was missing three VAS transactions and under-reported the position by 9 units. The workbook carries four-decimal prices and a `Value` column that is exactly `quantity × price + brokerage`, which is the cost-base rule in §6.1. The workbook has **no distribution rows**, so the dividend side comes only from ShareSight.

**Scope: the three held positions only — VAS, VHY, FGX.** `docs/AllTradesReport.xlsx` also lists TLS, TPG, IFL, VDHG, IVV, VESG and NAB; those are not held and are not imported.

**Stock splits are out of scope.** A split turns one parcel into several and needs its own parcel-splitting rule. The captured VAS history contains none. The importer therefore **refuses any transaction type it does not recognise and reports it by name** rather than skipping it silently — a dropped split would quietly corrupt every later cost base.

**Mechanism.** The extension has no `fs`, dialog or clipboard surface, and parsing xlsx in-panel would pull a dependency against the 200KB bundle ceiling that `sdk-build.test.ts` enforces. The importer is a **Node script in the same shape as `scripts/apply-seed.mjs`** — runs outside the app, writes directly to `finance.db`, prints row counts and audit results, and is safe to re-run. CSV or xlsx input is the builder's call; xlsx parsing is a build-time-only dependency and never enters the extension bundle.

The opening-position path remains as a fallback for any holding whose history is unavailable, taking stock, quantity, acquisition date and price — the acquisition date being the one input that cannot be inferred and the one that decides discount eligibility.

### Known data discrepancies

1. **Resolved.** ShareSight's page scrape reported 156 VAS units against the workbook's
   165; the workbook is authoritative and the scrape was stale by three transactions.
   `AllTradesReport.xlsx` is the import source for trades; ShareSight is the only source
   for distributions.
2. **The `Cost Base Per Share (aud)` column is empty** on every row. Cost base is computed
   as `quantity × price + brokerage`, which the workbook's own `Value` column confirms.
3. **An unheaded fifth column** in the ShareSight distributions table has **no total**,
   in any of the three holdings. ShareSight does not sum it, so it is not part of the
   export's data contract and is ignored. The four labelled columns reconcile exactly.

## 9. Services

Additive to the existing `wealthflow` service. Existing methods unchanged; existing consumers unaffected.

```ts
getCapitalGainsSummary(financialYear: string): Promise<CapitalGainsSummary | null>
```

```ts
interface CapitalGainsSummary {
  financialYear: string;
  grossGain: number;        // nominal, before losses and adjustment
  lossesApplied: number;    // losses offset against gains this FY
  discountApplied: number;  // the regime adjustment
  netGain: number;          // reportable
  carriedForwardLoss: number;
  byStock: Array<{
    stockId: number; stockCode: string;
    disposals: number; proceeds: number; costBase: number;
    nominalGain: number; adjustment: number; netGain: number;
  }>;
}
```

Params are passed as an array — the host spreads them positionally, so a bare string would arrive one character per argument. This is an existing trap, already worked around in `overview-view.ts`.

All service methods are named closures, never `this.`-bound methods: cross-extension `invoke` dispatches unbound.

### 9.1 Acceptance criteria — AMIT cost base adjustments

**The owner's real adjustments are too small to verify by eye.** VAS's entire five-year adjustment is **−$4.43**; spread pro-rata across 32 parcels that is about 14 cents each, below display precision. A bug that doubled or halved the allocation would be invisible on screen.

Verification therefore has two halves: **invariants that hold at any magnitude**, and **one synthetic fixture with round numbers** where the arithmetic is unmistakable.

#### Against the real portfolio

| # | Check | Expected |
| --- | --- | --- |
| 1 | Sum of entered adjustments per fund matches the tax statement | VAS **−$4.43**, VHY **−$10.83**, FGX **$0.00** |
| 2 | **Full liquidation conserves the adjustment** | Sell all 165 VAS units; the adjustment across every disposal totals **exactly −$4.43** |
| 3 | A partial sale takes a proportional share | Sell the 7 units bought 10 Sep 2026 ($773.00 cost base) → adjustment **−$0.2247**, cost base **$772.78** |
| 4 | **Order of entry does not matter** | Shuffle the nine VAS adjustment rows; check 3 must return the identical figure |
| 5 | Direction is correct | VAS cost base **$15,238.16 → $15,233.73**; a lower cost base means a *higher* gain |
| 6 | Negative test — FGX untouched | Every FGX adjustment row is `$0.00`, so no FGX disposal may ever show a non-zero adjustment |

Check 2 is the load-bearing one. It never requires knowing the "correct" per-parcel split — only that the allocation is self-consistent — and it catches every way pro-rata can leak.

Check 4 guards a specific trap: applying each adjustment to an already-adjusted base makes the answer depend on entry order, which would be wrong. **The cumulative net adjustment is applied once, at disposal**, per §6.1.

#### The synthetic fixture

One holding: **100 units at $100 each, $10,000 cost base**, single adjustment **−$1,000**.

| Sell | Pre-adjustment | Expected cost base | Expected adjustment |
| ---: | ---: | ---: | ---: |
| 30 units | $3,000 | **$2,700** | **−$300** |
| 70 units | $7,000 | **$6,300** | **−$700** |
| **Total** | **$10,000** | **$9,000** | **−$1,000** |

A bug is impossible to miss at this scale. If the first sale returns $2,850 or $2,600, the allocation is wrong in a way that −$0.22 would have concealed.

#### Precision requirement

Because per-parcel pro-rata amounts land **below 2dp display precision** at real magnitudes:

- Adjustment amounts are **stored and computed at 4dp**.
- The **fund-level adjustment is the headline figure** in the parcel detail, not the per-parcel share.
- The per-parcel share is **displayed at 4dp**, not rounded to 2dp like ordinary money, so the displayed figures still add back to the fund total.
- The running cost base on each parcel row is likewise shown at full precision where it carries an adjustment share.

Rounding the displayed per-parcel figures to 2dp would visibly fail to sum back to $4.43 across 32 rows.

## 10. Manifest changes

`commands[]`: `wealthflow.show-trades`, `wealthflow.log-buy`, `wealthflow.log-sell`.
`navigation[]`: a "Trades" item in the Wealth group.
`allowedCommands[]`: all three.
`allowedUiEvents[]`: `trade-create`, `trade-edit`, `trade-delete`, `trade-edit-request`, `trade-form-close`.

Unlisted `CustomEvent` names are dropped by the ui-event allowlist — a missing entry fails silently.

`tables[]`: the five new tables above. Version bumped in both `version` and `financeExtension.version` before every build.

`tests/manifest.test.ts` currently hardcodes the command and table counts and must be updated alongside.

### `wealthflow_stocks.shares` becomes derived

This is a change to an **existing v1 column**, and it contradicts the "Stocks stays untouched" line in §2, which is corrected there.

`shares` becomes a **cache written by the parcel rebuild**, not a typed value. Consequences:

- `stock-form.ts`'s Shares field becomes read-only with a note that it is derived from trades.
- Until a holding has imported history it has no parcels, and a derived total reads as **zero units** — visibly wrong. Every holding must therefore be imported before this ships, or the rebuild must fall back to the existing hand-typed value and mark the holding as not yet tracked. **Which of those two is the owner's call — see §12.**

## 11. Structure

```
src/
  dao/
    trades.ts               # typed CRUD + the edit-replay transaction
    parcels.ts              # read-only; rebuild from trades
    disposals.ts
    cost-base-adjustments.ts
    capital-losses.ts
  services/
    trade-service.ts        # validation, FIFO replay, guard
    parcel-service.ts       # rebuild, discount status, grouping
    cgt-service.ts          # loss ordering, regime rules, FY summary
    public-wealth-adapter.ts  # + getCapitalGainsSummary
  ui/
    wealthflow-orchestrator.ts  # + 'trades' tab
    trades-view.ts              # host, segmented
    trade-form.ts               # Buy/Sell + live preview
    trade-log.ts
    allocation-preview.ts
    parcel-ledger.ts            # grouped, expandable
    cgt-section.ts              # Overview's fourth section
```

`overview-view.ts` is already ~990 lines and holds three sections. **The Capital gains section goes in its own element**, not appended to that file.

## 12. Decisions taken on the owner's behalf

The owner delegated the last three with "just best is best". They are recorded here as **my calls**, not as theirs, so a later reader can revisit them.

**Q1 — Carried-forward capital losses.** User-entered opening balance per FY, defaulting to zero, with the recurrence in §5. No FY-close automation. The Capital gains section carries one small inline control for it. Rationale: it is the only loss figure the app genuinely cannot infer, and an explicit zero the owner can override beats automation that could be subtly wrong in a way nobody audits.

**Q2 — Import scope.** VAS, VHY and FGX only. Splits out of scope, refused-by-name by the importer (§8).

**Q3 — Untracked holdings.** `shares` shows the derived total, which is **zero for a holding with no imported history**, and the Stocks list marks that holding **"not yet tracked"** rather than rendering a bare `0`. Rationale: a wrong number that looks right is worse than an obviously empty one. Every held position must therefore be imported before this ships.

## 13. Left to the builder

- Exact breakpoints and column widths
- Whether the expanded parcel rows collapse or page
- Whether "Copy for Tax" emits plain text or CSV
- Whether held duration renders as "2 yr 7 mo", "30 mo", or both
- Whether `wealthflow_disposals` also carries an explicit `id`-free update path, given the natural-key decision

## 14. Self-review

1. **Placeholders** — none outstanding. §12 records the three decisions taken on the owner's behalf; §8.1 holds the data discrepancies, all resolved. Verification of the cost base adjustment machinery is specified in §9.1.
2. **Consistency** — matches v1's table prefix, service, manifest and UI patterns. Two deliberate contradictions with the concept note: §6.1 (adjustments are fund-level, forced by real data) and §6.3 (trades are not immutable; derived state is). Both flagged with the data that forced them. One correction to this document's own first draft: the AMIT adjustment was given a dedicated event with no screen behind it, and now lives on the dividend form.
3. **Scope** — one feature, four screens, two new sections. DRP and AMIT deliberately add no view of their own.
4. **Ambiguity** — §4 records the pending regime change and its verification requirement. §6.2 gives a worked fixture with the arithmetic walked, because a literal reading of "losses offset gains before the discount" produces a different and incorrect answer by discounting a parcel that is not yet a year old.