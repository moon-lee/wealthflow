# Wealthflow — Trades page: Trades Summary, Investment, Trades, Parcels, style pass

**Date:** 2026-10-21
**Status:** awaiting approval
**Extends:** `2026-10-16-wealthflow-trades-cgt-drp-design.md` (the binding design authority for trades, parcels, CGT, DRP and AMIT)

---

## 1. Intent and the why

Wealthflow currently answers "what trades did I make" well. It does not answer
"what do I own, what is it worth, and how has it actually gone". Those are the
questions a portfolio owner asks once a quarter, and they are the questions the
reference screenshots answer.

This adds two screens built on the ledger the last three phases produced, splits
the Trades page into four clear sections so parcels stop hiding behind a
toggle, and gives the whole trades-and-gains surface a coherent look.

**The why, in one line:** the ledger is the source of truth and it is now correct
— FIFO, the 50% discount, AMIT, DRP — so it can be presented as a portfolio
rather than as a list of rows.

## 2. Goals

1. **Trades Summary** — a new section on the Trades page: portfolio value,
   capital gain, income, currency gain, total return, each with an annualised
   figure.
2. **Investment** — a new section on the Trades page: a per-holding table with
   price, quantity, value, gains, income and return; grouped by market; with a
   totals row.
3. **Trades and Parcels as separate sections on the Trades page**, not a
   segmented toggle hiding one behind the other.
4. **A style pass** across Trades Summary, Investment, Trades, Parcels and the
   CGT section, so they read as one product.
5. **A price seam** — a single place a market-price source writes to, so a free
   price API can be added afterwards without touching the layout.

**All four live on the one Trades page** (§5.6). No new navigation items, no
new views, no new commands.

## 3. Non-goals and anti-goals

- **No live price fetching in this pass.** The seam is built; the API is a later
  step (§7.1).
- **No currency conversion.** Every holding is AUD, so Currency gain is $0 and
  is shown as $0.00. It is not hidden, because a row that appears when it is
  needed beats a row that appears when it is wanted.
- **Banks, Superannuation, Interest and Dividends screens are not touched.**
- **The CGT arithmetic is not changed.** This is a presentation layer over it.
- **The importer is not changed.**
- **No column-visibility control.** See §5.4.

Anti-goal: a Summary screen that shows a plausible-looking number when no price
is known. A missing price must read as missing.

## 4. Constraints

- One `views[]` entry (`wealthflow`); every screen is a `navigation[]` item
  retargeting the panel through `mount.view`, driven by the existing
  orchestrator. No extra `views[]` entries. **The new work adds no navigation
  at all** — it is sections inside the existing Trades page (§5.6).
- The host DB API has single-row `insert`/`update`/`delete` only — no
  transaction, no batch insert.
- **The app does not migrate schemas.** It runs `CREATE TABLE IF NOT EXISTS`, so
  a new column on an existing table never appears on an installed database.
  Anything new must therefore be a **new table**, not a new column. See §5.1.
- Style comes from `src/styles/*` tokens (`--ff-*`). No hardcoded greys.
- `quantity` is REAL; DRP produces fractional units.
- The bundle is at 220.2 KB against a "<200KB" guideline whose enforcing test
  does not exist in the main repo. See §9.

## 5. Decisions taken on the owner's behalf

### 5.1 The price seam — a new table, because the app cannot migrate

`wealthflow_stocks` **gains no columns** (§4). Instead a new table:

| Column | Type | Meaning |
| --- | --- | --- |
| `stock_id` | integer | the holding |
| `price` | real | price per unit |
| `as_at` | date | when that price was observed |
| `source` | text | `manual` or `api` |

A new table is created automatically on install, so no migration is needed. It
also happens to be the better shape: **prices have a history**, so the table
supports "what was this worth on date X" later, and the current price is a
derived value — *the latest row per stock* — rather than a stored one. That
keeps the project's "derive, don't store" rule intact.

- **Value = units × current price**, where current price is the latest
  `wealthflow_prices` row for the holding.
- When a holding has no price row, it has **no value**, and the screen says so
  (§5.8).
- **Manual entry is the initial writer.** The Investment section gets an
  "Edit prices" mode: the price column becomes editable in place, and saving
  **inserts a price row** dated today with `source = 'manual'`.
- A later free price API inserts the same rows with `source = 'api'`. Nothing
  else in the app needs to know where a price came from.

### 5.2 The annualised figure is one XIRR, allocated to the components

The reference figures imply a money-weighted measure: ShareSight's Total return
of 12.25% p.a. on a 33.6% total return back-solves to about **2.5 years**, for
a holding bought in October 2021 — 5 years ago. A simple "since first purchase"
annualisation cannot produce that; weighting recent money more heavily can.

**The total return rate is an XIRR** over dated cash flows:

- each buy, including a DRP: `−(price × quantity + brokerage)` on the trade date
- each distribution: `+gross` on the payment date
- terminal: `+market value` at the as-of date

solved for the annual rate `r` in

```
Σ  CFᵢ / (1 + r)^((dᵢ − d₀) / 365.25)  =  0
```

by bisection over a bracketed range. **When no sign change exists there is no
solution and the card shows `—`** — never a fallback number shaped like a rate.

**The Capital gain and Income rates are that same rate, allocated.** The total
return is split pro-rata by each component's dollar contribution:

```
capitalGainRate = totalReturnRate × (capitalGain$ / totalReturn$)
incomeRate      = totalReturnRate − capitalGainRate
```

This reproduces the reference's exact additivity (`6.47% + 5.78% = 12.25%`)
while resting on one honestly-computed rate. The rates are **allocations of the
total**, not independent IRRs, and the section says so in a footnote. Currency
gain is $0, so its rate is $0.

### 5.3 What the five Summary cards mean

| Card | Figure | Secondary line |
| --- | --- | --- |
| Portfolio value | market value | "As of \<oldest price date\>" |
| Capital gain | annualised % and $ | **total** capital gain — unrealised + realised |
| Income | annualised % and $ | gross distributions since first purchase |
| Currency gain | annualised % and $ | $0.00 while every holding is AUD |
| Total return | annualised % and $ | capital gain + income |

**"Capital gain" here is total capital gain, measured pre-discount.** The CGT
section's capital gain is **realised and post-50%-discount**, FY-scoped. These
are different numbers for different things and must not be conflated; the CGT
section keeps its own figures unchanged, and this screen is labelled to say
which basis it is on.

**Income is gross distributions, excluding franking credits.** Franking is a tax
offset, not cash received, so it is excluded from both the dollar figure and
the cash flows. The reference agrees: its VHY income of $303.25 is our gross
figure, with $60.18 of franking and $243.07 net sitting behind it. The Overview
continues to show franking credits separately.

**A DRP is not a double count.** A DRP produces a distribution (cash in) *and*
a buy (cash out) on the **same date**, so the two net to zero in the NPV
equation while the units still count towards the terminal value. That is
correct cash-flow accounting, not a mistake to be corrected.

### 5.4 The Investment table

Columns, in order: **Holding · Price · Quantity · Value · Capital gain ·
Income · Currency · Return.**

**How each one is calculated is in §5.10** — the single reference for the
formulas and where each input comes from.

- The holding cell shows `CODE | ASX` over the fund's full name.
- **Return = capital gain + income**, matching the reference.
- Rows are grouped under market headers, with a totals row closing the table.
- A subtitle reports the real state: "Since first purchase | Grouped by Market
  | Open positions only".

Three controls, as in the reference:

- **Split gains & losses** — splits the Capital gain column into **Unrealised**
  and **Realised**. With the split off, the column shows the **total**; the
  toggle is a pure decomposition of that same number, so toggling never
  changes the figure, only how it is broken down.
- **AUS / %** — the gain columns switch between currency and the **annualised
  (per annum) rate** for that row: the holding's own rate in a row, the
  portfolio's rate in the totals row. **Value does not switch** — the
  portfolio is not a percentage of itself, and a value is a value. The note
  says "Percentages are per annum", so a bare `12.34%` beside the Summary's
  `12.34% p.a.` reads as the same number, which is what it is.
- **Edit table** — enters price editing mode (§5.1).

**The totals row has no Quantity.** Adding the units of three holdings gives a
number that means nothing — 1,297 units of three different stocks is not a
quantity of anything. The cell is left empty so the columns still line up.

**Not in scope: a column-visibility control.** The reference's "1 hidden column"
implies one; building it would mean a column state machine and its tests, for
no benefit the owner asked for. The subtitle therefore drops that phrase rather
than lying about a feature that does not exist.

**Open positions only** is a real filter, default on: a holding with zero units
remaining is excluded.

### 5.5 Realised and unrealised must be on the same footing

The stored disposal `net_gain` is **already halved** by the 50% CGT discount.
An unrealised gain is **not** discounted, because no disposal has happened.

So the two are **not additive**, and the split view does not present them as if
they were:

- **Unrealised** = market value − cost base (pre-discount, pre-AMIT, as it
  stands — §5.9).
- **Realised** = the sum of disposal **nominal** gains, pre-discount, with the
  AMIT share added back so it is on the **same pre-AMIT footing** as the
  unrealised half. Taken **all time** — this screen is position-scoped, "since
  first purchase"; the CGT section remains FY-scoped.
- A footnote on the split view states that the CGT section applies the 50%
  discount to the realised side and that the two columns are therefore not
  additive.

### 5.6 One Trades page, four sections

The Trades tab is **one page** carrying four sections, in this order:

| # | Section | State | What it is |
| --- | --- | --- | --- |
| 1 | **Trades Summary** | new | the five cards of §5.3 |
| 2 | **Investment** | new | the holdings table of §5.4 |
| 3 | **Trades** | existing | the buy/sell form above the trade log |
| 4 | **Parcels** | existing | the grouped parcel ledger |

**The segmented toggle is removed.** Trades and Parcels were two views of one
segment control; they are now two sections on one page. That is what the owner
asked for, and it is also what the content is: a log and the ledger of that log
belong on the same page. A toggle made the parcels invisible to anyone who did
not know it was there, and made the ledger of a holding you were looking at two
clicks away from the log that produced it.

**Trades and Parcels are not redesigned into new screens — they are separated
existing sections.** The buy/sell form keeps its place above the trade log, and
the parcel ledger keeps its grouped-by-holding, expand-to-lot form with the
discount countdown. What changes is that they stop sharing a segment control and
stop hiding behind each other.

**Consequences:**

- **No manifest navigation change.** `wealthflow.show-trades` already opens this
  page, so the nav stays exactly as it is: `Refresh · Overview · Banks · Stocks ·
  Trades`. No new `navigation[]` entry, no new command.
- **The orchestrator is unchanged.** `WealthTab` keeps its current values;
  `'trades'` now hosts four sections instead of two.
- **`trades-view` becomes the page container.** It renders four `.section`
  blocks, each with its own header, and injects `finance` into the children.
  `trade-form`, `trade-log` and `parcel-ledger` keep their current
  responsibilities and are reused as-is; two new elements, `trades-summary` and
  `investment-table`, are added alongside them.
- **The Trades section header** is the ONLY owner of the form's visibility: one
  "Log buy / Hide form" button. The form's own header carries Save and Clear —
  "Cancel edit" while amending — and never a second Hide.
- **The Parcels section header** keeps the "N parcels" badge.

**The trade log pages and filters.** Ten rows a page, with the same `.table-pager`
the Overview's superannuation log uses ("Page 1 of 2 · 12 trades", Previous/Next,
and nothing at all when the log fits on one page). A Stock filter sits above the
table and lists only the codes the log actually holds, so no option can select an
empty list. Sorting, filtering and a shrink all return to page one; a filter whose
stock leaves the log is dropped. The date order breaks same-day ties by `id`, so
paging cannot show one trade twice and skip another.

**The form starts ready to type.** A new trade is prefilled with the local date
(not UTC: a reader in Australia at 9am is still on yesterday's UTC date). Date,
Quantity and Price are `required`, each field is wrapped in its own `<label>`, and
a buy shows a running total cost before it is saved. Editing a field clears a stale
error, a sell refreshes the FIFO preview while the quantity is typed, and the Save
button disables itself while a save is in flight so one click cannot write two rows.


**Section headers and collapse.** Each of the four sections has its own header,
so the page reads as four distinct blocks rather than one long column. All four
are collapsible, with these defaults:

| Section | Default | Why |
| --- | --- | --- |
| Trades Summary | expanded | the headline — five cards, one screen tall |
| Investment | expanded | the table; three holdings, one screen tall |
| Trades | expanded | the log is what you came for |
| Parcels | **collapsed** | 46 lots, several screens long, and the deepest drill-down of the four |

**A collapsed section still says what is in it.** Every header carries a count
badge — holdings, trades, parcels — so a collapsed section is informative
rather than a mystery. This is the same affordance the CGT section already
uses.

**Editing a trade still works.** Clicking Edit in the log reveals the form in
the Trades section above it, exactly as it does today; the `_onEditRequest`
handler drops the segment-switch it used to need.

### 5.7 The style pass

Scope: Trades Summary, Investment, Trades, Parcels, CGT.

- A new `src/styles/portfolio-styles.ts` holds the shared treatment, so the
  five screens match without duplicating rules.
- **Stat card row**: label above, large value, secondary line beneath, hairline
  dividers between cards — the reference's rhythm, in the app's own tokens.
- **Dense tables**: right-aligned numerics with `font-variant-numeric:
  tabular-nums` so columns of money line up on the decimal; sticky header;
  market group rows; a hover state.
- **Section headers**: one consistent treatment, including the collapse
  affordance the CGT section already has.
- **Numerics**: the same `$` and `%` formatting across all five screens.

### 5.8 Missing prices read as missing, everywhere

A holding with no price row has no value, and that is propagated honestly:

| Where | With a price | Without a price |
| --- | --- | --- |
| Investment row, Value | the amount | `—` |
| Investment row, Capital gain | the amount | `—` (not `$0.00`) |
| Portfolio value card | the total | `—` |
| Totals row | the total | `—` |
| Any rate card | the rate | `—` |

**A total that cannot be computed is not shown as a partial total.** A portfolio
value missing one of three holdings is not a portfolio value, and a partial
figure with a footnote is the sort of thing that gets screenshotted and
mistaken for the truth.

**First run is empty by design**, and says so: the Summary shows `—` with a
prompt pointing at "Edit prices" on Investment. It does not seed invented
prices to look complete.

### 5.9 The gain basis: PRE-AMIT by default, and switchable

**Owner's decision, 2026-10-22. This reverses the earlier post-AMIT decision
in this section, and the reversal is deliberate. On 2026-10-23 the owner asked
for the basis to be a user option, so pre-AMIT became the DEFAULT and
post-AMIT became selectable (§5.9.1).**

Today AMIT is applied **only at disposal**. An open position has no adjusted
cost base stored anywhere, so the portfolio service has to compute one.

**Rule.** For a holding with open units:

```
wholeFundPre   = Σ (every parcel's pre-adjustment cost base)
consumedPre    = Σ (every disposal's pre-adjustment cost base taken)
preAdjustment  = wholeFundPre − consumedPre
share          = fundTotalAdjustment(≤ as-of date) × preAdjustment / wholeFundPre
costBase       = preAdjustment + share
```

**The portfolio view measures the gain against `preAdjustment` — what was
actually paid.** The AMIT adjustment is a notional tax benefit that only
crystallises on a disposal, so it is not part of what a paper gain is measured
against. The CGT section applies it, to the tax figure, which is the one that
has to be right.

**This puts our figures on the same footing as the reference.** At the seeded
prices our capital gain is **$3,223.51** and our total return **$6,099.25** —
ShareSight's own figures, to the cent, on every holding. The earlier
post-AMIT basis put us **$15.26** higher on every total, and no amount of
explanation makes a screen that disagrees with the source it is copied from
feel right.

**The realised half moves with it.** A disposal's stored gain is measured
against its **post-AMIT** cost base, so the AMIT share is added back to put it
on the pre-AMIT footing the unrealised half now uses. One footing, or the two
halves would not add up to the total (§5.5).

**The open basis is what is LEFT, not the oldest N units.** FIFO consumes the
oldest units first, so after a partial sale the remaining units are the newest
ones plus the tail of the oldest parcel. Allocating the oldest N units instead
understates the open cost base and overstates the gain — a wrong tax figure on
any partial sale of a multi-parcel holding. The derivation is from the ledger:
what you still hold is what you bought, less what you sold.

The denominator is the **whole fund's acquisition cost base**, so the sold
units' share and the open units' share are complementary and the adjustment is
counted once.

Only adjustments **dated on or before the as-of date** count. A date-aware
total is needed, which `totalAdjustment` does not yet provide.

#### 5.9.1 It is a choice, made on the Investment toolbar

`post` is not a worse answer, it is a different question, and both are worth
being able to see:

- **pre-AMIT — "how did my investment do?"** The gain on what you actually
  paid. Default. Matches the reference.
- **post-AMIT — "what will I owe?"** The gain on your tax cost base: what you
  paid, less the adjustments the trust has credited to you. A lower cost base
  means a larger taxable gain on sale, so this reconciles with the CGT section.

**Where it lives.** A `Pre-AMIT | Post-AMIT` segment in the Investment
toolbar's LEFT group, beside "Split gains & losses". Both are "what am I
looking at"; the value format and Edit table are format and action, on the
right.

**Stored, not view-local.** `finance.settings` key `wealthflow.amitBasis`,
values `pre` (default) or `post`. Declared in `contributes.configuration`, so
it is also settable from the Settings screen. It survives a restart.

**The service reads the setting, and it is the only reader.**
`getPortfolioSummary` calls `readAmitBasis(finance)` once per summary, so the
Investment table and the Trades Summary — which each hold their own copy —
**cannot be on different bases**. One setting, one answer. The summary reports
`amitBasis` so the screens can label themselves and a consumer can see which
question the numbers answer.

**Both halves move together.** The rule in §5.5 still binds: on `pre` the
realised half adds the AMIT share back (a stored disposal gain is post-AMIT);
on `post` it uses the stored nominal gain as-is. The unrealised half uses
`preAdjustment` on `pre` and `costBase` on `post`. One footing either way.

`HoldingSummary` reports all three numbers so neither basis is a derived
mystery: `costBasePreAdjustment` (what was paid, always), `amitShare` (the
adjustment, signed) and `costBase` (the basis in use).

**The CGT section never moves.** It is post-AMIT, post-discount, FY-scoped,
whatever this setting says. That one is the law, and there is a test asserting
`getCapitalGainsSummary` returns the same thing on both bases.

**The trade-off the label has to carry.** At the seeded prices the difference
is **$15.26** across the portfolio (VAS −$4.43, VHY −$10.83, FGX $0 — FGX is
an LIC, not a trust). Each screen's footnote names the basis it is showing;
without that, two screens a tab apart would look like they disagree when they
are answering different questions.

### 5.10 How each column is calculated

The reference for anyone asking "where did this number come from?". The rules
above are scattered across §5.1, §5.3, §5.4, §5.5, §5.8 and §5.9; this is the
one place that has all of them.

**Nothing here is stored.** Every figure is recomputed from the ledger on every
read, by `getPortfolioSummary` in `src/services/portfolio-service.ts`.

| Column | Formula | Inputs |
| --- | --- | --- |
| **Holding** | `CODE \| MARKET` over the fund's full name | `wealthflow_stocks` |
| **Price** | the latest row's `price` for the holding | `wealthflow_prices` |
| **Quantity** | `Σ parcels.quantity − Σ disposals.quantity` | parcels, disposals |
| **Value** | `Quantity × Price` | derived |
| **Capital gain** | `(Value − Cost base) + Realised gain` | derived |
| **Income** | `Σ dividends.gross` | `wealthflow_dividends` |
| **Currency** | `0` | constant |
| **Return** | `Capital gain + Income` | derived |

**Quantity is units still held.** A parcel keeps the quantity **as acquired** —
it is the original lot, and FIFO allocates a sale *against* that lot, so a
parcel is never reduced. The disposals record what was consumed. Open units =
acquired − consumed.

**Cost base** is the open position's basis **on the selected footing** (§5.9.1):
what was actually paid on `pre` (the default), that less the AMIT adjustment on
`post`.

**Capital gain is realised plus unrealised**, and both halves are measured
**pre-discount** and on the **same footing** (§5.5, §5.9.1). The CGT section's
figure is realised, post-AMIT, post-50%-discount and FY-scoped; this column is
the portfolio view, all time.

**Income is gross distributions, all time, and EXCLUDES franking credits.**
Franking is a tax offset, not cash received, so it is neither in the money nor
in the cash-flow series. The Overview shows franking credits separately.

**Currency is 0** while every holding is AUD. The column is shown rather than
hidden, because a row that appears when it is needed beats a row that appears
when it is wanted.

**A holding with no price has no value**, and that propagates: its Value and
Capital gain read `—`, the Portfolio value card reads `—`, and no rate is
computed (§5.8). The totals row is `—` rather than a partial total.

**In % mode** the gain columns are the **annualised per annum rate**, not a
share of the portfolio value (§5.4). Each row shows **that holding's own
rate** — its own XIRR over its own buys, distributions and terminal value —
with the capital gain and income portions allocated by dollars exactly as §5.2
does for the portfolio. The **totals row shows the portfolio's rate**, so it is
the same figure the Trades Summary shows, to the decimal.

**Value never becomes a percentage**, in either mode.

**A holding with no price has no rate either** — there is no terminal value to
weigh, so the rate is `—` rather than a number without meaning.

**We now match the reference to the cent.** On the pre-AMIT basis (§5.9) the
capital gain is **$3,223.51** and the total return **$6,099.25** at the seeded
prices — ShareSight's own figures, on every holding. A test pins them (§8).

**The annualised rate is not the reference's rate.** At the same prices, our
XIRR is **11.84% p.a.** against the reference's **12.34% p.a.** (§5.2 notes
that the reference's figure back-solves to a period of about 2.5 years, not the
5 years the ledger spans). Our figure is a money-weighted rate over dated cash
flows and is reproducible; the reference's is not, so we do not chase it. What
matters is that the **Investment table and the Trades Summary agree with each
other**, and they do — they are the same number from the same source.

### 5.10 Market grouping

`wealthflow_stocks` has no market column, and §4 rules out adding one. Every
holding is ASX-listed, so market is **derived**: a single `marketOf(stock)`
function returns `'ASX'` today, and the grouping code reads from that one
function so a real market column can replace it later without touching the
grouping logic.

### 5.11 Who rebuilds the parcels

The rebuild is one idempotent function, `rebuildAllParcels`. Today the Trades
screen calls it on load and after every mutation.

With four sections on **one page**, the page rebuilds **once per load** and then
pushes the result to all four sections. That is better than the original
sketch, which had three sections each calling `ensureParcelsFresh` separately:
on one page there is one load, so there is one rebuild.

- **Trades** keeps ownership — that is where trades change, and it rebuilds
  after every mutation.
- The other three sections read the fresh derived state the page just built.

The portfolio service reads **parcels directly** rather than trusting the
cached `stocks.shares` column.

## 6. Data flow

```
wealthflow_prices ──────┐
wealthflow_trades ──────┼──► portfolio-service ──► Trades Summary cards
wealthflow_parcels ─────┤                      └─► Investment table
wealthflow_dividends ───┤
wealthflow_disposals ───┘
```

The service computes a `PortfolioSummary` and a `Holding[]` from the ledger.
**Nothing is stored that can be derived** — the same rule the parcels follow.

## 7. What happens next, after the layout is right

### 7.1 The price source

The owner's instruction: find a free API for current market prices, after the
layout.

The seam is §5.1, so the API step is: fetch the prices, insert a row into
`wealthflow_prices` with `source = 'api'`.

**Chosen: ASX's own research endpoint, with Yahoo Finance as the fallback.**
Both were tested against the three holdings on 2026-10-22; both returned the
same prices, and both need no key, no account and no configuration.

| | ASX own endpoint | Yahoo Finance |
| --- | --- | --- |
| URL | `asx.api.markitdigital.com/asx-research/1.0/companies/{code}/header` | `query1.finance.yahoo.com/v8/finance/chart/{code}.AX` |
| Auth | none | none |
| Price | `priceLast` (plus bid and ask) | `meta.regularMarketPrice` |
| Last trade time | not given | `meta.regularMarketTime` |
| Latency | ~250ms | ~600–1000ms |
| Unknown ticker | HTTP 400 | HTTP 404 with a JSON error |

Stooq was tested first and is **dead for ASX** — every symbol returns 404.

**How it is wired:**

- The fetch is **host-side only**. The panel is a browser context and the
  endpoints are cross-origin, so a fetch from there is blocked. The host is
  plain Node and can reach them. The panel calls the host's
  `wealthflow.update-prices` command through the shell bridge and then
  re-reads the price table.
- **Nothing is pushed back to the panel.** A `pushData` would retarget the
  open panel, and updating a price should not move the user.
- A holding that cannot be priced is **left alone**. Its last known price
  stays and the staleness warning says so; overwriting a good price with a
  zero because a request failed would be worse than being out of date.
- The price table is a **history**, so a repeated click that returns the same
  price on the same day does not stack a duplicate row.

**The API step does not change any layout.** That is the point of the seam.

### 7.2 VHY's 16 Jul 2026 reinvestment — RESOLVED: one unit at $82.706

**Superseded.** This section originally recorded a decision to keep VHY at 22
units and flag the $82.71 difference from ShareSight. The owner then supplied
the source row:

```
VHY | 16 Jul 2026 | Reinvestment | 1 | AU$82.706 | — | AU$82.71
```

**One unit was bought, at $82.706, for $82.71.** The ledger now records it that
way, and the difference from ShareSight is gone.

| | Before | Now |
| --- | ---: | ---: |
| VHY units | 22 | **23** |
| VHY parcels | 4 | **5** |
| VHY cost base | $1,541.17 pre-AMIT | **$1,623.88** pre-AMIT ($1,613.05 post-AMIT) |
| Portfolio units | 1,296 | **1,297** |
| Portfolio parcels | 45 | **46** |

The oddity the decision was made around is still there and is still true: **the
distribution that day was $12.44, and the DRP cost $82.71**. The reinvestment
cost and the distribution do not reconcile — they invert. The ledger records
what was actually bought, and the $12.44 is still recorded as income.

**The reference's own figures now match ours exactly**: at the same prices the
portfolio value is **$21,420.16** and the income **$2,875.74**, to the cent.
The **$15.26 AMIT difference is gone** too — the owner moved the portfolio
view to the pre-AMIT basis (§5.9), so the capital gain matches as well.

The DRP rule is unchanged: a zero-unit reinvestment is still income-only, and
still produces no parcel. It simply does not apply here any more.

**Why not record the fraction instead:** it would land between the two figures
and match neither, and the DRP rule already handles a zero-unit reinvestment
correctly (income recorded, no parcel). The evidence is contradictory rather
than decisive, and a ledger should not carry a guess.

## 8. Testing

- **XIRR** — a pure function, unit tested: a known rate reproduces itself; a
  no-solution case returns null rather than a number; a single cash flow
  returns null; a zero-date spread is handled.
- **Rate allocation** — the capital gain and income rates sum to the total
  return rate, and a zero total return does not divide by zero.
- **One canonical fixture.** A shared module `tests/fixtures/portfolio.ts`
  carrying the reconciled portfolio - 46 parcels (VAS 32, VHY 5, FGX 9),
  $18,146.12 pre-AMIT cost base ($18,130.86 post-AMIT), the dividend rows and
  the nine AMIT adjustment rows — plus a price set and a **fixed as-of date**
  injected into the service. Tests never use `today`; the service takes `asOf`
  as a parameter, defaulting to today.
- **Missing price** — no crash; every affected cell reads `—` (§5.8).
- **AMIT interaction** — the unrealised gain is computed from the
  **pre-AMIT** cost base by default, so it is $15.26 **below** the post-AMIT
  figure, and the realised half is moved onto the same footing. Pinned.
- **The basis option** — default is `pre`; `post` moves cost base to
  $18,130.86 and the gain to $3,238.77 (exactly +$15.26); the setting is
  persisted; a broken or missing setting falls back to `pre`; the toolbar
  switch moves the Investment table AND the Trades Summary together; each
  footnote names the basis it is showing; `getCapitalGainsSummary` returns the
  same thing on both bases. Pinned in `tests/amit-basis.test.ts`.
- **The reference figures** — on the pre-AMIT basis the portfolio reproduces
  ShareSight's own numbers to the cent: $21,369.63 value, $3,223.51 capital
  gain, $2,875.74 income, $6,099.25 total return, and every holding's gain
  individually. Pinned.
- **The % mode is per annum** — the table's totals row and the Trades Summary
  show the **same** rate, to the decimal; a row's rate is that holding's own;
  Value stays a currency amount in both modes; the totals row shows no
  Quantity. Pinned.
- **UI** — assert on exposed data properties and call methods directly. This is
  the established practice here: happy-dom drops `tbody`/`thead`/`tfoot` from
  shadow roots, mishandles `form=""` on submit buttons, and mis-parents nodes
  when a conditional template is swapped.

**The reference figures ARE expected outputs now.** On the pre-AMIT basis
(§5.9) our dollars match ShareSight's to the cent, and a test pins every one
of them. The one measure that still differs is the **rate**: ours is 11.84%
p.a. against the reference's 12.34%, because ShareSight's rate is not
reproducible from the ledger (§5.2). That is stated rather than fudged.

## 9. Risks

- **Bundle size.** 220.2 KB now, against a "<200KB" guideline. This pass adds
  two elements and a service, so it will grow — though adding sections to one
  page costs less than adding whole screens would have. The owner's instruction
  is layout first, so the lazy-load work is **deferred to its own change**
  rather than attempted here — the orchestrator calls `setFinance()` on a child
  that may not be upgraded yet, so it needs a guard, not a blind edit. Flagged,
  not silently ignored.
- **Price staleness.** Manual prices go stale and Portfolio value will be
  wrong in a way that looks right. Mitigated by showing the **oldest** price
  date on the card, and a warning badge when the oldest price is more than
  **7 days** old.
- **Two "capital gain" numbers in one app.** Mitigated by labelling (§5.3) and
  the footnote in the split view (§5.5).
- **Empty first run.** Every price is null on a fresh install, so the Summary
  is `—` throughout. Intended and honest (§5.8), but it is a weak first
  impression, and the "Edit prices" prompt has to be obvious.
- **A deliberate $82.71 difference from ShareSight on VHY** (§7.2). Flagged, not
  hidden. Anyone comparing the two must be able to find why they differ.

## 10. Left to the builder

- Exact spacing, type scale and table density values.
- Whether "Edit prices" is an inline-editable column or a small dialog.
- Whether the Trades Summary section is FY-scoped or position-scoped.
  **Builder's call, with a preference for position-scoped** — a portfolio
  summary that changes meaning when you change the year filter is more
  confusing than helpful, and the Overview already provides the FY-scoped income
  view.
- Whether "Currency gain" renders as a disabled card or an active one showing
  $0.00. **Builder's call; a disabled-looking card is the clearer signal.**
- Whether the XIRR bisection bracket and tolerance are exposed as constants.
- Whether `getPortfolioSummary` joins the public `wealthflow` service in
  `public-wealth-adapter.ts`. **Builder's call; a builder would, so taxflow
  can consume it the same way it consumes capital gains.**
