---
title: "FGX — Future Generation Global Investment Company"
source: "https://portfolio.sharesight.com/holdings/19088747/dashboard/transactions"
reconciled_against: "docs/AllTradesReport.xlsx"
created: 2026-10-16
description: "ShareSight transaction history for FGX, reconciled against the All Trades Report."
tags:
  - "sharesight"
  - "fgx"
---

# FGX — Future Generation Global Investment Company

ASX:FGX · Future Generation Global Investment Company · **a Listed Investment Company (LIC),
not an ETF**

Transaction history from ShareSight, **reconciled line by line against
`AllTradesReport.xlsx`**. Both sources agree exactly, with no discrepancies.

## At a glance

| | |
| --- | --- |
| Units held | **1,109** |
| Units bought on market | 980 across 3 trades |
| Units acquired via DRP | 129 across 6 reinvestments |
| Holdings ever sold | **none** |
| Gross capital outlay | $1,125.10 |
| DRP capital deployed | $158.98 |
| **Cost base** | **$1,284.08** |
| AMIT cost base adjustments | **$0.00** — it is not an AMIT |
| Average cost per unit | $1.16 |
| Dividends received | $227.12 gross · $68.14 franking · $158.98 net |
| **Franking percentage** | **30.0%** — the highest of the three holdings |
| **Units discount-eligible (12 mo+)** | **832 of 1,109** |

## Why this holding is the odd one out

FGX is **by far the largest position — 1,109 units against VAS's 164 and VHY's 22** — and
it is the one asset that behaves differently under every rule in the design.

| | FGX | VAS / VHY |
| --- | --- | --- |
| Structure | LIC, not a trust | AMITs |
| Cost base adjustments | **None, ever** | Present, though small |
| Capital losses | Pool with share gains | Same |
| 50% discount | Applies normally | Same |
| Market price | **Bid/ask, negotiated** | Screened price |
| 25% of units undiscounted | **Yes — 277 of 1,109** | No — 10 of 186 |

The ShareSight distributions table for FGX **still shows a "Cost base adj." column, and
every row is $0.00**. That is the confirmation the design needed: an LIC produces no AMIT
adjustments, so the adjustment table simply never has an FGX row.

## Buys

3 trades, $9.00 brokerage. Value includes brokerage.

| Date | Units | Price | Brokerage | Value |
| --- | ---: | ---: | ---: | ---: |
| 7 Jul 2023 | 500 | $1.09 | $3.00 | $548.00 |
| 23 Nov 2023 | 250 | $1.07 | $3.00 | $270.50 |
| 9 Sep 2026 | 230 | $1.32 | $3.00 | $306.60 |
| **Total** | **980** | | **$9.00** | **$1,125.10** |

Three roughly even purchases three years apart. **FIFO will have an obvious answer here** —
there is no contest between nearly-identical parcels, which is the friendliest possible
case for an allocation algorithm.

Note the gap: nothing was bought between Nov 2023 and Sep 2026. The 2026 buy is recent,
and its 230 units are the single largest block of undiscounted exposure in the portfolio.

## Reinvestments

| Date | Units | Price per unit | Reinvested |
| --- | ---: | ---: | ---: |
| 27 Oct 2023 | 15 | $1.11847 | $16.78 |
| 22 May 2024 | 22 | $1.15420 | $25.39 |
| 29 Oct 2024 | 22 | $1.25110 | $27.52 |
| 21 May 2025 | 23 | $1.20600 | $27.74 |
| 26 Nov 2025 | 23 | $1.31050 | $30.14 |
| 13 May 2026 | 24 | $1.30870 | $31.41 |
| **Total** | **129** | | **$158.98** |

**Every dividend received was fully reinvested.** The six net dividend payments total
**$158.98** — the same figure as the six reinvestments.

That equality is a coincidence at the total level, not line by line. The individual
amounts differ, because the funds' DRPs buy **whole units** and leave the remainder in
cash:

| Date | Net dividend | Units bought | Cost of units | Difference |
| --- | ---: | ---: | ---: | ---: |
| 27 Oct 2023 | $16.75 | 15 | $16.78 | +$0.03 |
| 22 May 2024 | $25.63 | 22 | $25.39 | −$0.24 |
| 29 Oct 2024 | $27.55 | 22 | $27.52 | −$0.03 |
| 21 May 2025 | $28.32 | 23 | $27.74 | −$0.58 |
| 26 Nov 2025 | $29.95 | 23 | $30.14 | +$0.19 |
| 13 May 2026 | $30.78 | 24 | $31.41 | +$0.63 |
| **Total** | **$158.98** | **129** | **$158.98** | **$0.00** |

So the parcel cost base is what the units actually cost, **not** the dividend that funded
them — the difference is retained cash and must not be folded into the parcel.

This is the same rounding behaviour that produced VHY's **zero-unit** DRP on 16 Jul 2026.
Whole-unit rounding is normal for these funds, and it is why `quantity` must be `REAL`.

## Dividends

FGX pays twice a year, in May and November. Six payments across three years — against 21
for VAS and 12 for VHY over comparable spans, because the amounts are small and the
holding is young.

| Date paid | Gross | Cost base adj. | Franking | Net |
| --- | ---: | ---: | ---: | ---: |
| 27 Oct 2023 | $23.93 | $0.00 | $7.18 | $16.75 |
| 22 May 2024 | $36.61 | $0.00 | $10.98 | $25.63 |
| 29 Oct 2024 | $39.36 | $0.00 | $11.81 | $27.55 |
| 21 May 2025 | $40.46 | $0.00 | $12.14 | $28.32 |
| 26 Nov 2025 | $42.79 | $0.00 | $12.84 | $29.95 |
| 13 May 2026 | $43.97 | $0.00 | $13.19 | $30.78 |
| **Total** | **$227.12** | **$0.00** | **$68.14** | **$158.98** |

All four totals reproduce ShareSight's own figures exactly.

Franking is a clean **30.0%** on every payment — $227.12 × 0.30 = $68.14. That is higher
than VAS (24.7%) and VHY (19.8%), so FGX contributes proportionally more franking credit
despite being a small absolute amount.

## Discount eligibility

This is where FGX behaves unlike the other two holdings.

| Parcel | Units | Acquired | Qualifies | Status at 16 Oct 2026 |
| --- | ---: | --- | --- | --- |
| #1 | 500 | 7 Jul 2023 | 7 Jul 2024 | Eligible — 3 yr |
| #2 | 15 | 27 Oct 2023 | 27 Oct 2024 | Eligible — 2 yr 11 mo |
| #3 | 250 | 23 Nov 2023 | 23 Nov 2024 | Eligible — 2 yr 10 mo |
| #4 | 22 | 22 May 2024 | 22 May 2025 | Eligible — 2 yr 4 mo |
| #5 | 22 | 29 Oct 2024 | 29 Oct 2025 | Eligible — 1 yr 11 mo |
| #6 | 23 | 21 May 2025 | 21 May 2026 | Eligible — 1 yr 4 mo |
| #7 | 23 | 26 Nov 2025 | 26 Nov 2026 | **In ~6 weeks** |
| #8 | 24 | 13 May 2026 | 13 May 2027 | **In ~7 months** |
| #9 | 230 | 9 Sep 2026 | 9 Sep 2027 | **In ~11 months** |
| | **1,109** | | | **832 eligible · 277 not** |

**One quarter of FGX is undiscounted** — 277 units, against 10 units across VAS and VHY
combined. The Sep 2026 buy alone accounts for 230 of them.

FGX is also the only holding whose cost base is dominated by a *recent* purchase. The
other two are legacy positions whose undiscounted exposure is a rounding error. Any
advice about "when should I sell" will be about FGX, not about VAS.

## Reconciliation against `AllTradesReport.xlsx`

**Both sources agree exactly. No discrepancies.**

| Check | ShareSight | AllTradesReport | `src/seed/` | Agree |
| --- | ---: | ---: | ---: | :-: |
| Rows | 9 | 9 | — | ✓ |
| Units bought | 980 | 980 | — | ✓ |
| Units from DRP | 129 | 129 | — | ✓ |
| **Units held** | **1,109** | **1,109** | **1,109** | ✓ |
| Buy cost | $1,125.10 | $1,125.10 | — | ✓ |
| DRP cost | $158.98 | $158.98 | — | ✓ |
| Brokerage | $9.00 | $9.00 | — | ✓ |
| Cost base adj. | all $0.00 | not carried | — | ✓ |

The workbook carries prices to four decimals (`1.11847`) where the page shows three
(`1.118`). **The workbook is the more precise source** and should win any tie on import.

The workbook has no dividend rows, so the dividend side can only come from ShareSight.
The two sources are complementary.

## Consequences for the Wealthflow design

- **FGX is the portfolio's real CGT exposure**, and the only holding where FIFO has
  something to decide. VAS and VHY are effectively pre-sold answers.
- **Nine parcels, no ambiguity.** Three near-equal buys mean oldest-first has an obvious
  winner. When a sale does happen, the preview will show it cleanly.
- **The sell price is typed, and must be.** There is no screen price for an LIC. The form
  must not imply one exists, and should say why the figure is entered by hand.
- **No adjustment rows will ever exist for FGX.** That is correct behaviour, not a gap —
  but the UI should not present an empty AMIT section as something missing.
- **Whole-unit DRP rounding is systemic.** It produced VHY's zero-unit DRP and it makes
  FGX's parcel cost base differ from its dividend by a few cents per parcel. Neither is an
  error; both must survive the import unchanged.