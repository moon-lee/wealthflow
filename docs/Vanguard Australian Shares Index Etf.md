---
title: "VAS — Vanguard Australian Shares Index ETF"
source: "https://portfolio.sharesight.com/holdings/14309815/dashboard/transactions"
created: 2026-10-16
description: "ShareSight transaction history for VAS, reformatted from a flat page scrape."
tags:
  - "sharesight"
  - "vas"
---

# VAS — Vanguard Australian Shares Index ETF

ASX:VAS · Vanguard Australian Shares Index ETF · an AMIT

Transaction history from ShareSight, **reconciled line by line against
`AllTradesReport.xlsx`**. The two sources disagree — the page scrape is stale, and the
workbook is authoritative. Original numbers are unaltered.

## At a glance

| | |
| --- | --- |
| Units held | **165** |
| Units bought on market | 149 across 18 trades |
| Units acquired via DRP | 16 across 14 reinvestments |
| Holdings ever sold | **none — no disposals on record** |
| Earliest acquisition | 28 Sep 2021 |
| Gross capital outlay | $13,656.93 |
| DRP capital deployed | $1,581.23 |
| Cost base as acquired | $15,238.16 |
| AMIT cost base adjustments | −$4.43 |
| **Cost base today** | **$15,233.73** |
| Average cost per unit | $92.33 |
| Distributions received | $2,345.37 gross · $579.29 franking · $1,764.94 net |
| Units discount-eligible (12 mo+) | **154 of 165** |

**The page scrape showed 156 units; the workbook now shows 165.** Three transactions are
missing from the scrape: a 16 Jul 2026 reinvestment, a 10 Sep 2026 buy of 7 units, and a
16 Oct 2026 reinvestment that has since been confirmed. See
[Reconciliation](#reconciliation-against-alltradesreportxlsx).

Of the 165 units, **11 are not yet discount-eligible**: 1 each from 19 Jan, 20 Apr,
16 Jul and 16 Oct 2026, plus the 7 bought on 10 Sep 2026. The 2 units from the 16 Oct
2025 DRP crossed the 12-month line **on 16 Oct 2026 itself** — exactly one year to the
day, and exactly the day this was captured.

## Buys

18 trades, $60.50 in brokerage — $3.00 each except the first, at $9.50.
**Value includes brokerage**, so it is the cost of that parcel.

| Date | Units | Price | Brokerage | Value |
| --- | ---: | ---: | ---: | ---: |
| 28 Sep 2021 | 11 | $94.93 | $9.50 | $1,053.73 |
| 25 Jan 2022 | 11 | $89.00 | $3.00 | $982.00 |
| 17 Jun 2022 | 6 | $81.50 | $3.00 | $492.00 |
| 1 Jul 2022 | 6 | $81.50 | $3.00 | $492.00 |
| 14 Sep 2022 | 6 | $86.28 | $3.00 | $520.68 |
| 21 Sep 2022 | 4 | $84.80 | $3.00 | $342.20 |
| 23 Sep 2022 | 5 | $83.30 | $3.00 | $419.50 |
| 7 Jul 2023 | 11 | $87.00 | $3.00 | $960.00 |
| 22 Sep 2023 | 10 | $87.48 | $3.00 | $877.80 |
| 2 Oct 2023 | 9 | $87.12 | $3.00 | $787.08 |
| 3 Oct 2023 | 10 | $85.79 | $3.00 | $860.90 |
| 3 Jan 2024 | 8 | $92.93 | $3.00 | $746.44 |
| 16 Apr 2024 | 5 | $94.28 | $3.00 | $474.40 |
| 1 Oct 2024 | 10 | $102.00 | $3.00 | $1,023.00 |
| 7 Mar 2025 | 10 | $99.70 | $3.00 | $1,000.00 |
| 4 Apr 2025 | 10 | $95.70 | $3.00 | $960.00 |
| 7 Apr 2025 | 10 | $88.92 | $3.00 | $892.20 |
| 10 Sep 2026 | 7 | $110.00 | $3.00 | $773.00 |
| **Total** | **149** | | **$60.50** | **$13,656.93** |

The buying pattern: 11 purchases in under two years to the end of 2022, a gap of nearly
two years, then 10 units a quarter through 2025, then a pause, then a single 7-unit buy in
Sep 2026. **The 10 Sep 2026 row is absent from the ShareSight page scrape** and appears
only in the workbook.

## Reinvestments

No brokerage. Cost base of each parcel is the cash reinvested, at the DRP price —
**not** the market price, which is why these prices sit slightly below the traded price.

| Date | Units | Price per unit | Reinvested |
| --- | ---: | ---: | ---: |
| 18 Jul 2022 | 1 | $81.4095 | $81.41 |
| 18 Oct 2022 | 1 | $80.3959 | $80.40 |
| 18 Jul 2023 | 1 | $89.1810 | $89.18 |
| 17 Oct 2023 | 1 | $87.1399 | $87.14 |
| 17 Jan 2024 | 1 | $93.7060 | $93.71 |
| 17 Apr 2024 | 1 | $97.9497 | $97.95 |
| 16 Oct 2024 | 1 | $102.5435 | $102.54 |
| 17 Jan 2025 | 2 | $100.7245 | $201.45 |
| 16 Apr 2025 | 1 | $97.1013 | $97.10 |
| 16 Oct 2025 | 2 | $109.8171 | $219.63 |
| 19 Jan 2026 | 1 | $108.0618 | $108.06 |
| 20 Apr 2026 | 1 | $105.0007 | $105.00 |
| 16 Jul 2026 | 1 | $108.7983 | $108.80 |
| 16 Oct 2026 | 1 | $108.8611 | $108.86 |
| **Total** | **16** | | **$1,581.23** |

The **16 Jul 2026 and 16 Oct 2026 rows are absent from the ShareSight page scrape**. The
Oct 2026 distribution is listed on the page as unconfirmed; it has since been confirmed
and reinvested, and the workbook now carries it.

The per-unit prices carry four decimals in the workbook and three on the page. That
precision is real and needs a `REAL` column, not a 2dp money column — the same reason
`wealthflow_stocks.shares` is `REAL`.

### The reinvested amount is not the distribution

Comparing each reinvestment against the distribution that funded it shows the two **do
not reconcile, and sometimes invert**:

| Reinvestment | DRP cost | Same-day distribution (net) | Difference |
| --- | ---: | ---: | ---: |
| 18 Jul 2022 | $81.41 | $60.48 | **+20.93** |
| 18 Oct 2022 | $80.40 | $72.52 | +7.88 |
| 18 Jul 2023 | $89.18 | $45.34 | **+43.84** |
| 17 Oct 2023 | $87.14 | $93.23 | −6.09 |
| 17 Jan 2024 | $93.71 | $66.05 | +27.66 |
| 17 Apr 2024 | $97.95 | $85.77 | +12.18 |
| 16 Oct 2024 | $102.54 | $111.86 | −9.32 |
| 17 Jan 2025 | $201.45 | $116.61 | **+84.84** |
| 16 Apr 2025 | $97.10 | $95.29 | +1.81 |
| 16 Oct 2025 | $219.63 | $166.58 | +53.05 |
| 19 Jan 2026 | $108.06 | $126.41 | −18.35 |
| 20 Apr 2026 | $105.00 | $131.42 | −26.42 |
| 16 Jul 2026 | $108.80 | $76.18 | **+32.62** |
| 16 Oct 2026 | $108.86 | $211.67 | **−102.81** |

The DRP price is set independently of the distribution amount, so a reinvestment can
cost more or less than the cash that funded it. The largest gap is 16 Oct 2026, where
only $108.86 of a $211.67 distribution was reinvested and the rest went to cash.

**Consequence for the design:** "amount reinvested" must be its own captured field. It
must never be derived from the dividend, and the per-unit price must be derived from the
DRP rather than the other way round. §6.4 and §7.5 of the design doc already specify this;
this data confirms it was the right call.

## Distributions

**Cost base adj.** is the AMIT cost base adjustment attached to that distribution.
`—` means $0.00. Negative means the fund reduced your cost base.

| Date paid | Gross | Cost base adj. | Franking | Net |
| --- | ---: | ---: | ---: | ---: |
| 18 Oct 2021 | $19.62 | −$0.81 | $4.12 | $15.49 |
| 19 Jan 2022 | $9.70 | −$0.41 | $2.04 | $7.65 |
| 20 Apr 2022 | $55.62 | −$2.32 | $11.67 | $43.91 |
| 18 Jul 2022 | $76.61 | −$3.19 | $16.08 | $60.48 |
| 18 Oct 2022 | $99.90 | +$0.68 | $27.29 | $72.52 |
| 18 Jan 2023 | $52.68 | +$0.36 | $14.39 | $38.24 |
| 20 Apr 2023 | $40.55 | +$0.28 | $11.07 | $29.44 |
| 18 Jul 2023 | $62.46 | +$0.43 | $17.06 | $45.34 |
| 17 Oct 2023 | $124.60 | — | $31.17 | $93.23 |
| 17 Jan 2024 | $88.27 | — | $22.08 | $66.05 |
| 17 Apr 2024 | $114.62 | — | $28.67 | $85.77 |
| 16 Jul 2024 | $96.19 | — | $24.06 | $71.98 |
| 16 Oct 2024 | $145.97 | — | $34.11 | $111.86 |
| 17 Jan 2025 | $152.77 | — | $36.16 | $116.61 |
| 16 Apr 2025 | $127.74 | — | $32.45 | $95.29 |
| 16 Jul 2025 | $125.13 | — | $26.31 | $98.82 |
| 16 Oct 2025 | $225.69 | — | $59.11 | $166.58 |
| 19 Jan 2026 | $163.09 | — | $36.68 | $126.41 |
| 20 Apr 2026 | $177.58 | — | $46.16 | $131.42 |
| 16 Jul 2026 | $100.36 | +$0.55 | $24.06 | $76.18 |
| 16 Oct 2026 | $286.22 | — | $74.55 | $211.67 |
| **Total** | **$2,345.37** | **−$4.43** | **$579.29** | **$1,764.94** |

> The 16 Oct 2026 distribution is **unconfirmed** — ShareSight created it from company
> event data and it has not been accepted. There is also **1 unconfirmed automatic
> transaction** outstanding on the holding.

## Reading the AMIT adjustments

The adjustments are **small and front-loaded**: real movement in 2021–2023, then
nothing from Oct 2023 through Apr 2026, and a single +$0.55 in Jul 2026.

The pattern suggests VAS had substantially uplifted its cost base by late 2023 and has
been distributing its taxable income in full each year since, leaving nothing further
to adjust. **The net effect across five years is −$4.43** — under 3 cents a unit.

This matters more for the shape of the data than for the magnitude:

- They arrive **per distribution, as a fund-level dollar amount on a date** — not as a
  closing balance, and not per unit. So the adjustment record belongs to the fund, and
  must be spread across that fund's parcels rather than written onto one of them.
- They are mostly zero, so the entry screen will be low-traffic. Correctness matters,
  volume does not.

## Reconciliation against `AllTradesReport.xlsx`

**The workbook is authoritative and the page scrape is stale.**

| Check | ShareSight scrape | AllTradesReport | `src/seed/` | Agree |
| --- | ---: | ---: | ---: | :-: |
| Rows | 29 | **32** | — | ✗ |
| Units bought | 142 | **149** | — | ✗ |
| Units from DRP | 14 | **16** | — | ✗ |
| **Units held** | **156** | **165** | **164** | ✗ |
| Gross capital outlay | $12,883.93 | **$13,656.93** | — | ✗ |
| DRP capital deployed | $1,363.57 | **$1,581.23** | — | ✗ |
| Brokerage | $57.50 | **$60.50** | — | ✗ |

**The three rows the scrape does not have:**

| Date | Type | Units | Price | Brokerage | Value |
| --- | --- | ---: | ---: | ---: | ---: |
| 16 Jul 2026 | Reinvestment | 1 | $108.7983 | — | $108.80 |
| 10 Sep 2026 | Buy | 7 | $110.0000 | $3.00 | $773.00 |
| 16 Oct 2026 | Reinvestment | 1 | $108.8611 | — | $108.86 |

Every other row agrees to the cent, and every DRP price matches to four decimals.

### `src/seed/` is now stale by one unit

An earlier revision of this document found the workbook and the seed agreed at 164 and
concluded the seed needed no change. **That has stopped being true.** The 16 Oct 2026
distribution has since been confirmed and reinvested into 1 unit, taking the workbook to
**165** while the seed still says 164.

This is the first live evidence for the design's central claim about `shares`: a
hand-typed unit count **drifts every time ShareSight settles a pending distribution**, and
no care taken at the seed prevents it. The derived-rebuild approach in §10 of the design
doc is not a nicety — it is the only way the number stays correct.

## Cost base per share, computed

The workbook's `Cost Base Per Share (aud)` column is **empty on every data row** — header
present, nothing beneath it. So it is computed from the columns that are populated:

```
costBasePerShare = (quantity × price + brokerage) ÷ quantity
```

Brokerage is spread across the units of that parcel, which is why small purchases do not
divide cleanly.

| Parcel | Units | Price | Brokerage | Cost base | **Per share** |
| --- | ---: | ---: | ---: | ---: | ---: |
| 28 Sep 2021 | 11 | $94.93 | $9.50 | $1,053.73 | **$95.79** |
| 25 Jan 2022 | 11 | $89.00 | $3.00 | $982.00 | **$89.27** |
| 17 Jun 2022 | 6 | $81.50 | $3.00 | $492.00 | **$82.00** |
| 1 Jul 2022 | 6 | $81.50 | $3.00 | $492.00 | **$82.00** |
| 18 Jul 2022 | 1 | $81.4095 | — | $81.41 | **$81.41** |
| 14 Sep 2022 | 6 | $86.28 | $3.00 | $520.68 | **$86.78** |
| 21 Sep 2022 | 4 | $84.80 | $3.00 | $342.20 | **$85.55** |
| 23 Sep 2022 | 5 | $83.30 | $3.00 | $419.50 | **$83.90** |
| 18 Oct 2022 | 1 | $80.3959 | — | $80.40 | **$80.40** |
| 7 Jul 2023 | 11 | $87.00 | $3.00 | $960.00 | **$87.27** |
| 18 Jul 2023 | 1 | $89.1810 | — | $89.18 | **$89.18** |
| 22 Sep 2023 | 10 | $87.48 | $3.00 | $877.80 | **$87.78** |
| 2 Oct 2023 | 9 | $87.12 | $3.00 | $787.08 | **$87.45** |
| 3 Oct 2023 | 10 | $85.79 | $3.00 | $860.90 | **$86.09** |
| 17 Oct 2023 | 1 | $87.1399 | — | $87.14 | **$87.14** |
| 3 Jan 2024 | 8 | $92.93 | $3.00 | $746.44 | **$93.31** |
| 17 Jan 2024 | 1 | $93.7060 | — | $93.71 | **$93.71** |
| 16 Apr 2024 | 5 | $94.28 | $3.00 | $474.40 | **$94.88** |
| 17 Apr 2024 | 1 | $97.9497 | — | $97.95 | **$97.95** |
| 1 Oct 2024 | 10 | $102.00 | $3.00 | $1,023.00 | **$102.30** |
| 16 Oct 2024 | 1 | $102.5435 | — | $102.54 | **$102.54** |
| 17 Jan 2025 | 2 | $100.7245 | — | $201.45 | **$100.72** |
| 7 Mar 2025 | 10 | $99.70 | $3.00 | $1,000.00 | **$100.00** |
| 4 Apr 2025 | 10 | $95.70 | $3.00 | $960.00 | **$96.00** |
| 7 Apr 2025 | 10 | $88.92 | $3.00 | $892.20 | **$89.22** |
| 16 Apr 2025 | 1 | $97.1013 | — | $97.10 | **$97.10** |
| 16 Oct 2025 | 2 | $109.8171 | — | $219.63 | **$109.82** |
| 19 Jan 2026 | 1 | $108.0618 | — | $108.06 | **$108.06** |
| 20 Apr 2026 | 1 | $105.0007 | — | $105.00 | **$105.00** |
| 16 Jul 2026 | 1 | $108.7983 | — | $108.80 | **$108.80** |
| 10 Sep 2026 | 7 | $110.00 | $3.00 | $773.00 | **$110.43** |
| 16 Oct 2026 | 1 | $108.8611 | — | $108.86 | **$108.86** |
| **Total** | **165** | | **$60.50** | **$15,238.16** | **$92.35** |

**$92.35 per unit as acquired**, falling to **$92.33** after the −$4.43 of AMIT
adjustments.

Read the table as a shape: the position was accumulated between **$81 and $110**. Bought
parcels carry their brokerage inside them, so a 5-unit purchase at $94.28 is an effective
**$94.88** a unit, not $94.28. DRP parcels have no brokerage, so their per-share figure
is the DRP price exactly.

## The unheaded fifth column — resolved

Every distributions table in these three files has **five** numeric values per row but
only **four** column headers — and the totals row carries **four** values.

| File | Values per row | Headers | Values in total row |
| --- | ---: | ---: | ---: |
| VAS | 5 | 4 | 4 |
| VHY | 5 | 4 | 4 |
| FGX | 5 | 4 | 4 |

**The extra column has no total.** ShareSight sums the other four; it does not sum this
one. So it is not part of the export's data contract — most likely a per-unit rate or a
hidden control that exists in the page layout and was flattened into the text by the
scrape.

**It can be ignored.** The four labelled columns reconcile exactly against ShareSight's
own stated totals in all three holdings:

| Holding | Gross | Cost base adj. | Franking | Net |
| --- | ---: | ---: | ---: | ---: |
| VAS | $2,345.37 ✓ | −$4.43 ✓ | $579.29 ✓ | $1,764.94 ✓ |
| VHY | $303.25 ✓ | −$10.83 ✓ | $60.18 ✓ | $243.07 ✓ |
| FGX | $227.12 ✓ | $0.00 ✓ | $68.14 ✓ | $158.98 ✓ |

**Nothing is left open on this holding.** If per-unit distribution figures are ever needed
rather than these four totals, the annual tax statement is the source — not this column.

### Which source wins

**`AllTradesReport.xlsx` for trades. ShareSight for distributions.** The workbook has
four-decimal prices, a `Value` column, and the complete trade list; it has no dividend
rows. The two are complementary, and neither is a superset of the other.

## Consequences for the Wealthflow design

- **The disposal machinery has never run on this holding.** No sell exists in five
  years, so FIFO allocation, discount apportionment and loss ordering are all
  unexercised by real data. The first sell will be the first real test.
- **154 of 165 units are already discount-eligible.** A sale today would be almost
  entirely discounted, which makes FIFO's choice of parcel unusually cheap to get right —
  and unusually expensive to get wrong later, once the recent parcels become the ones at
  stake.
- **32 parcels from 165 units**, average 5.2 units each. The Parcels ledger needs a
  per-stock grouping; a flat list would drown the screen.
- **The reinvested amount must be its own field.** DRP costs and distributions do not
  reconcile, and can invert.
- **Never trust a page scrape for a ledger.** Every number here came from adding up
  ShareSight's own totals and checking them against a second source. One of the two was
  wrong, and it was the one that looked more authoritative.