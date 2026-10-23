const aud = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
});

/** Display-only AUD formatting; amounts are stored plain. */
export function formatAUD(n: number): string {
  return aud.format(n);
}

const audPrice = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});

/**
 * A price per unit, to three decimals — `$109.020`, `$1.340`.
 *
 * Three, not two: a DRP price carries four decimals and a market quote can
 * carry three, so two would quietly round a price the ledger holds exactly.
 * Three is enough for both, and always the same width, so a column of prices
 * lines up.
 *
 * The stored price is not rounded — only what is shown.
 */
export function formatPrice(n: number): string {
  return audPrice.format(n);
}

/** Mask an account number to its last 4 digits (`1234567` → `•••4567`). */
export function maskAccount(acct: string): string {
  return `•••${acct.slice(-4)}`;
}

/** Display a 6-digit BSB as `NNN-NNN`; anything else renders raw. */
export function formatBSB(bsb: string | null): string {
  if (!bsb) return '';
  const digits = bsb.replace(/\D/g, '');
  if (digits.length !== 6) return bsb;
  return `${digits.slice(0, 3)}-${digits.slice(3)}`;
}
