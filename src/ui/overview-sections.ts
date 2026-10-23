export const CANONICAL_SECTION_ORDER = [
  'combined',
  'dividends',
  'interest',
  'cgt',
  'super',
] as const;

export type OverviewSectionId = (typeof CANONICAL_SECTION_ORDER)[number];

export const SECTION_LABELS: Record<OverviewSectionId, string> = {
  combined: 'Combined taxable',
  dividends: 'Dividends',
  interest: 'Interest',
  cgt: 'Capital gains',
  super: 'Superannuation',
};

export function normalizeSectionOrder(saved: unknown): OverviewSectionId[] {
  const ids = Array.isArray(saved)
    ? saved.filter(
        (x): x is OverviewSectionId =>
          typeof x === 'string' &&
          (CANONICAL_SECTION_ORDER as readonly string[]).includes(x),
      )
    : [];
  for (const id of CANONICAL_SECTION_ORDER) {
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}
