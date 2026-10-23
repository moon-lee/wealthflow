---
title: "VHY — Vanguard Australian Shares High Yield ETF"
source: "https://portfolio.sharesight.com/holdings/19766562/dashboard/transactions"
reconciled_against: "docs/AllTradesReport.xlsx"
created: 2026-10-16
description: "ShareSight transaction history for VHY, reconciled against the All Trades Report."
tags:
  - "sharesight"
  - "vhy"
---

# VHY — Vanguard Australian Shares High Yield ETF

ASX:VHY · Vanguard Australian Shares High Yield ETF · an AMIT

Transaction history from ShareSight, **reconciled line by line against
`AllTradesReport.xlsx`**. Both sources agree exactly.

## At a glance

| | |
| --- | --- |
| Units held | **23** |
| Units bought on market | 20 across 2 trades |
| Units acquired via DRP | 3 across 3 reinvestments |
| Holdings ever sold | **none** |
| Gross capital outlay | $1,397.30 |
| DRP capital deployed | $226.58 |
| Cost base as acquired | $1,623.88 |
| AMIT cost base adjustments | −$10.83 |
| **Cost base today** | **$1,613.05** |
| Average cost per unit | $70.60 |
| Distributions received | $303.25 gross · $60.18 franking · $243.07 net |
| Franking percentage | **19.8%** — materially lower than VAS's 24.7% |
| Units discount-eligible (12 mo+) | **23 of 23** — every unit qualifies |

## Buys

2 trades, $6.00 brokerage. Value includes brokerage.

| Date | Units | Price | Brokerage | Value |
| --- | ---: | ---: | ---: | ---: |
| 4 Oct 2023 | 10 | $64.75 | $3.00 | $650.50 |
| 1 Oct 2024 | 10 | $74.38 | $3.00 | $746.80 |
| **Total** | **20** | | **$6.00** | **$1,397.30** |

A single holding of 20 units held three years, untouched since. Buying stopped 1 Oct 2024.

## Reinvestments

| Date | Units | Price per unit | Reinvested |
| --- | ---: | ---: | ---: |
| 16 Apr 2025 | 1 | $70.1346 | $70.13 |
| 16 Jul 2025 | 1 | $73.7378 | $73.74 |
| 16 Jul 2026 | **1** | $82.706 | **$82.71** |
| **Total** | **3** | | **$226.58** |

### The 16 Jul 2026 reinvestment bought one unit, and does not reconcile

This row is the most interesting thing in the file. The distribution that day was
**$12.44 gross**. At the recorded DRP price of $82.706, that cash would buy
**0.1504 units** — and the source records **1 unit at $82.706, $82.71
reinvested**.

So the DRP cost and the distribution **do not reconcile**: $82.71 went out
against a $12.44 distribution. They invert. The source says one unit was
bought and that is what the ledger records — the cash that funded it is not
visible in this file.

> An earlier reading of the source showed this row as **0 units and $0.00**,
> which would have left VHY at 22 units and four parcels. The owner's copy of
> the row settles it, and VHY is 23 units and five parcels.

The lesson for the importer is unchanged in kind: a DRP row is not a normal
trade, and its quantity must not be inferred from the distribution. It is
either taken from the source as recorded, or flagged for manual entry.

## Distributions

**Cost base adj.** is the AMIT adjustment attached to that distribution. Negative
reduces cost base.

| Date paid | Gross | Cost base adj. | Franking | Net |
| --- | ---: | ---: | ---: | ---: |
| 17 Jan 2024 | $7.70 | −$2.27 | $1.52 | $6.18 |
| 17 Apr 2024 | $14.64 | −$4.32 | $2.89 | $11.75 |
| 16 Jul 2024 | $14.25 | −$4.20 | $2.81 | $11.44 |
| 16 Oct 2024 | $13.95 | — | $3.54 | $10.41 |
| 17 Jan 2025 | $27.30 | — | $6.58 | $20.72 |
| 16 Apr 2025 | $54.35 | — | $5.65 | $48.70 |
| 16 Jul 2025 | $45.71 | — | $3.67 | $42.04 |
| 16 Oct 2025 | $33.19 | — | $9.06 | $24.13 |
| 19 Jan 2026 | $18.96 | — | $4.48 | $14.48 |
| 20 Apr 2026 | $24.63 | — | $6.78 | $17.85 |
| 16 Jul 2026 | $12.44 | −$0.04 | $3.50 | $8.94 |
| 16 Oct 2026 | $36.13 | — | $9.70 | $26.43 |
| **Total** | **$303.25** | **−$10.83** | **$60.18** | **$243.07** |

All four totals reproduce ShareSight's own figures exactly.

> The 16 Oct 2026 distribution is **unconfirmed**.

### Reading the AMIT adjustments

Unlike VAS, VHY's adjustments are **large relative to the holding** — $10.83 against a
$1,623.88 cost base is 0.7%, where VAS's $4.43 against $14,247.50 is 0.03%.

The pattern is also opposite: **all reductions, all before Jan 2025, nothing since.**
VAS moved negative then positive then flat; VHY reduced cost base across three
consecutive quarters in 2024 and has not touched it in 21 months.

Either VHY has now fully uplifted its cost base, or its taxable amounts have been
distributed in full since. Either way, the entry screen will be low-traffic for both
holdings.

## Reconciliation against `AllTradesReport.xlsx`

**Both sources agree exactly. No discrepancies.**

| Check | ShareSight | AllTradesReport | `src/seed/` | Agree |
| --- | ---: | ---: | ---: | :-: |
| Rows | 5 | 5 | — | ✓ |
| Units bought | 20 | 20 | — | ✓ |
| Units from DRP | 3 | 3 | — | ✓ |
| **Units held** | **23** | **23** | **23** | ✓ |
| Buy cost | $1,397.30 | $1,397.30 | — | ✓ |
| DRP cost | $226.58 | $226.58 | — | ✓ |
| Brokerage | $6.00 | $6.00 | — | ✓ |
| Prices | 3 dp | 4 dp | — | ✓ |

The workbook carries prices to four decimals (`73.7378`) where the page shows three
(`73.738`). **The workbook is the more precise source** and should win any tie on
import.

The workbook has no distribution rows, so the dividend side of this holding can only
come from ShareSight. The two sources are complementary, not redundant.

## Consequences for the Wealthflow design

- **Five parcels, all discount-eligible, nothing sold.** This is the simple case. VHY
  will sit in the ledger as five clean rows until the first sale.
- **A DRP row is not a trade.** The 16 Jul 2026 reinvestment shows a distribution of
  $12.44 against a $82.71 reinvestment; the two do not reconcile. The importer must
  take the quantity from the source as recorded, not infer it from the cash.
- **Amending a sale, when it happens, has no ambiguity.** With five parcels, all fully
  eligible, FIFO's choice will be obvious and the preview will show it
  without any edge cases.