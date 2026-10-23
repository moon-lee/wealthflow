/**
 * The reconciled holding history — the canonical copy.
 *
 * Transcribed from the holding records in `docs/`, which are the reconciled
 * source of truth:
 *
 *   VAS  docs/Vanguard Australian Shares Index Etf.md
 *   VHY  docs/Vanguard Australian Shares High Yield Etf.md
 *   FGX  docs/Future Gen Aust.md
 *
 * `docs/AllTradesReport.xlsx` agrees with all three, and
 * `scripts/import-sharesight.mjs` audits the workbook against the same
 * figures.
 *
 * ONE copy lives here so the seed, the SQL seed and the tests cannot drift
 * apart. The seed under `src/seed/` is gitignored personal data; this module
 * is the machine-readable form of records the repository already carries in
 * `docs/`.
 *
 * The costs are at FULL precision — the DRP prices carry four decimals, so a
 * parcel's cost is `quantity x price` to the cent and a half. The documents
 * round for display; pinning the rounded figure would let a fixture that is
 * wrong by six cents still pass.
 */

export interface HoldingBuy {
  date: string;
  quantity: number;
  price: number;
  brokerage: number;
}

export interface HoldingDrp {
  date: string;
  quantity: number;
  /** The DRP price per unit. NOT the market price. */
  price: number;
  /** The cash this reinvestment deployed, as the source recorded it. */
  reinvested: number;
}

export interface HoldingDistribution {
  date: string;
  gross: number;
  /** The AMIT cost base adjustment attached to this distribution. 0 is a
   *  real answer and is stored, not skipped. */
  costBaseAdj: number;
  franking: number;
}

export interface HoldingHistory {
  code: 'VAS' | 'VHY' | 'FGX';
  name: string;
  buys: HoldingBuy[];
  drps: HoldingDrp[];
  distributions: HoldingDistribution[];
  /** The price the portfolio is valued at, as of PRICE_AS_AT. */
  price: number;
}

/** The date the seeded prices are observed on. */
export const PRICE_AS_AT = '2026-10-21';

export const HOLDING_HISTORY: HoldingHistory[] = [
  {
    code: 'VAS',
    name: 'Vanguard Australian Shares Index ETF',
    price: 108.75,
    buys: [
      { date: '2021-09-28', quantity: 11, price: 94.93, brokerage: 9.5 },
      { date: '2022-01-25', quantity: 11, price: 89.0, brokerage: 3 },
      { date: '2022-06-17', quantity: 6, price: 81.5, brokerage: 3 },
      { date: '2022-07-01', quantity: 6, price: 81.5, brokerage: 3 },
      { date: '2022-09-14', quantity: 6, price: 86.28, brokerage: 3 },
      { date: '2022-09-21', quantity: 4, price: 84.8, brokerage: 3 },
      { date: '2022-09-23', quantity: 5, price: 83.3, brokerage: 3 },
      { date: '2023-07-07', quantity: 11, price: 87.0, brokerage: 3 },
      { date: '2023-09-22', quantity: 10, price: 87.48, brokerage: 3 },
      { date: '2023-10-02', quantity: 9, price: 87.12, brokerage: 3 },
      { date: '2023-10-03', quantity: 10, price: 85.79, brokerage: 3 },
      { date: '2024-01-03', quantity: 8, price: 92.93, brokerage: 3 },
      { date: '2024-04-16', quantity: 5, price: 94.28, brokerage: 3 },
      { date: '2024-10-01', quantity: 10, price: 102.0, brokerage: 3 },
      { date: '2025-03-07', quantity: 10, price: 99.7, brokerage: 3 },
      { date: '2025-04-04', quantity: 10, price: 95.7, brokerage: 3 },
      { date: '2025-04-07', quantity: 10, price: 88.92, brokerage: 3 },
      { date: '2026-09-10', quantity: 7, price: 110.0, brokerage: 3 },
    ],
    drps: [
      { date: '2022-07-18', quantity: 1, price: 81.4095, reinvested: 81.41 },
      { date: '2022-10-18', quantity: 1, price: 80.3959, reinvested: 80.4 },
      { date: '2023-07-18', quantity: 1, price: 89.181, reinvested: 89.18 },
      { date: '2023-10-17', quantity: 1, price: 87.1399, reinvested: 87.14 },
      { date: '2024-01-17', quantity: 1, price: 93.706, reinvested: 93.71 },
      { date: '2024-04-17', quantity: 1, price: 97.9497, reinvested: 97.95 },
      { date: '2024-10-16', quantity: 1, price: 102.5435, reinvested: 102.54 },
      { date: '2025-01-17', quantity: 2, price: 100.7245, reinvested: 201.45 },
      { date: '2025-04-16', quantity: 1, price: 97.1013, reinvested: 97.1 },
      { date: '2025-10-16', quantity: 2, price: 109.8171, reinvested: 219.63 },
      { date: '2026-01-19', quantity: 1, price: 108.0618, reinvested: 108.06 },
      { date: '2026-04-20', quantity: 1, price: 105.0007, reinvested: 105.0 },
      { date: '2026-07-16', quantity: 1, price: 108.7983, reinvested: 108.8 },
      { date: '2026-10-16', quantity: 1, price: 108.8611, reinvested: 108.86 },
    ],
    distributions: [
      { date: '2021-10-18', gross: 19.62, costBaseAdj: -0.81, franking: 4.12 },
      { date: '2022-01-19', gross: 9.7, costBaseAdj: -0.41, franking: 2.04 },
      { date: '2022-04-20', gross: 55.62, costBaseAdj: -2.32, franking: 11.67 },
      { date: '2022-07-18', gross: 76.61, costBaseAdj: -3.19, franking: 16.08 },
      { date: '2022-10-18', gross: 99.9, costBaseAdj: 0.68, franking: 27.29 },
      { date: '2023-01-18', gross: 52.68, costBaseAdj: 0.36, franking: 14.39 },
      { date: '2023-04-20', gross: 40.55, costBaseAdj: 0.28, franking: 11.07 },
      { date: '2023-07-18', gross: 62.46, costBaseAdj: 0.43, franking: 17.06 },
      { date: '2023-10-17', gross: 124.6, costBaseAdj: 0, franking: 31.17 },
      { date: '2024-01-17', gross: 88.27, costBaseAdj: 0, franking: 22.08 },
      { date: '2024-04-17', gross: 114.62, costBaseAdj: 0, franking: 28.67 },
      { date: '2024-07-16', gross: 96.19, costBaseAdj: 0, franking: 24.06 },
      { date: '2024-10-16', gross: 145.97, costBaseAdj: 0, franking: 34.11 },
      { date: '2025-01-17', gross: 152.77, costBaseAdj: 0, franking: 36.16 },
      { date: '2025-04-16', gross: 127.74, costBaseAdj: 0, franking: 32.45 },
      { date: '2025-07-16', gross: 125.13, costBaseAdj: 0, franking: 26.31 },
      { date: '2025-10-16', gross: 225.69, costBaseAdj: 0, franking: 59.11 },
      { date: '2026-01-19', gross: 163.09, costBaseAdj: 0, franking: 36.68 },
      { date: '2026-04-20', gross: 177.58, costBaseAdj: 0, franking: 46.16 },
      { date: '2026-07-16', gross: 100.36, costBaseAdj: 0.55, franking: 24.06 },
      { date: '2026-10-16', gross: 286.22, costBaseAdj: 0, franking: 74.55 },
    ],
  },
  {
    code: 'VHY',
    name: 'Vanguard Australian Shares High Yield ETF',
    price: 84.34,
    buys: [
      { date: '2023-10-04', quantity: 10, price: 64.75, brokerage: 3 },
      { date: '2024-10-01', quantity: 10, price: 74.38, brokerage: 3 },
    ],
    drps: [
      { date: '2025-04-16', quantity: 1, price: 70.1346, reinvested: 70.13 },
      { date: '2025-07-16', quantity: 1, price: 73.7378, reinvested: 73.74 },
      // 16 Jul 2026 bought ONE unit at $82.706. The source page had shown
      // this as 0 units, and the ledger followed it; that was wrong. The
      // distribution that day was $12.44, so the DRP cost and the
      // distribution do not reconcile — they invert — and the ledger records
      // what was actually bought.
      { date: '2026-07-16', quantity: 1, price: 82.706, reinvested: 82.71 },
    ],
    distributions: [
      { date: '2024-01-17', gross: 7.7, costBaseAdj: -2.27, franking: 1.52 },
      { date: '2024-04-17', gross: 14.64, costBaseAdj: -4.32, franking: 2.89 },
      { date: '2024-07-16', gross: 14.25, costBaseAdj: -4.2, franking: 2.81 },
      { date: '2024-10-16', gross: 13.95, costBaseAdj: 0, franking: 3.54 },
      { date: '2025-01-17', gross: 27.3, costBaseAdj: 0, franking: 6.58 },
      { date: '2025-04-16', gross: 54.35, costBaseAdj: 0, franking: 5.65 },
      { date: '2025-07-16', gross: 45.71, costBaseAdj: 0, franking: 3.67 },
      { date: '2025-10-16', gross: 33.19, costBaseAdj: 0, franking: 9.06 },
      { date: '2026-01-19', gross: 18.96, costBaseAdj: 0, franking: 4.48 },
      { date: '2026-04-20', gross: 24.63, costBaseAdj: 0, franking: 6.78 },
      { date: '2026-07-16', gross: 12.44, costBaseAdj: -0.04, franking: 3.5 },
      { date: '2026-10-16', gross: 36.13, costBaseAdj: 0, franking: 9.7 },
    ],
  },
  {
    code: 'FGX',
    name: 'Future Generation Global Investment Company',
    price: 1.34,
    buys: [
      { date: '2023-07-07', quantity: 500, price: 1.09, brokerage: 3 },
      { date: '2023-11-23', quantity: 250, price: 1.07, brokerage: 3 },
      { date: '2026-09-09', quantity: 230, price: 1.32, brokerage: 3 },
    ],
    drps: [
      { date: '2023-10-27', quantity: 15, price: 1.11847, reinvested: 16.78 },
      { date: '2024-05-22', quantity: 22, price: 1.1542, reinvested: 25.39 },
      { date: '2024-10-29', quantity: 22, price: 1.2511, reinvested: 27.52 },
      { date: '2025-05-21', quantity: 23, price: 1.206, reinvested: 27.74 },
      { date: '2025-11-26', quantity: 23, price: 1.3105, reinvested: 30.14 },
      { date: '2026-05-13', quantity: 24, price: 1.3087, reinvested: 31.41 },
    ],
    distributions: [
      { date: '2023-10-27', gross: 23.93, costBaseAdj: 0, franking: 7.18 },
      { date: '2024-05-22', gross: 36.61, costBaseAdj: 0, franking: 10.98 },
      { date: '2024-10-29', gross: 39.36, costBaseAdj: 0, franking: 11.81 },
      { date: '2025-05-21', gross: 40.46, costBaseAdj: 0, franking: 12.14 },
      { date: '2025-11-26', gross: 42.79, costBaseAdj: 0, franking: 12.84 },
      { date: '2026-05-13', gross: 43.97, costBaseAdj: 0, franking: 13.19 },
    ],
  },
];

/**
 * The reconciled totals. A test pins the seed and the fixture against these,
 * so a transcription error fails loudly instead of quietly shifting a tax
 * figure.
 */
export const RECONCILED_TOTALS = {
  units: 1297,
  /** 32 VAS + 5 VHY + 9 FGX. VHY's third reinvestment (16 Jul 2026) bought
   *  ONE unit at $82.706, so it makes a parcel like any other. The source
   *  page showed it as 0 units and the ledger followed that; it was wrong. */
  parcels: 46,
  preAdjustmentCostBase: 18146.12225,
  adjustment: -15.26,
  costBase: 18130.86225,
  income: 2875.74,
  franking: 707.61,
  value: 21369.63,
} as const;
