const aud = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });

/** Display-only AUD formatting; amounts are stored plain. */
export function formatAUD(n: number): string {
  return aud.format(n);
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
