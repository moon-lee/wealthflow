import { html } from 'lit';

/**
 * Sortable date/month column header, shared by the three overview logs.
 *
 * The caret states the order the column is currently in, so a click reads as
 * "the other one" rather than as an unlabelled toggle. The label does not move
 * and the arrow is decorative: `aria-sort` on the `<th>` is what a screen
 * reader announces, so putting the order on the button too would say it twice.
 */
export function dateSortHeader(
  label: string,
  descending: boolean,
  toggle: () => void,
): unknown {
  return html`<button
    type="button"
    class="th-sort"
    title=${descending ? 'Oldest first' : 'Newest first'}
    @click=${(e: Event) => {
      e.stopPropagation();
      toggle();
    }}
  >
    ${label}
    <span class="caret" aria-hidden="true">${descending ? '▼' : '▲'}</span>
  </button>`;
}

/**
 * Newest-first ordering for ISO date (or `YYYY-MM`) strings, which sort
 * correctly as plain text. `tie` breaks same-date rows by id so the order is
 * stable — an unstable sort would shuffle equal rows on every render.
 */
export function byDate(
  descending: boolean,
  tie?: (a: any, b: any) => number,
): (
  a: { date: string; id?: number },
  b: { date: string; id?: number },
) => number {
  const dir = descending ? -1 : 1;
  return (a, b) => {
    if (a.date !== b.date) return (a.date < b.date ? -1 : 1) * dir;
    return (tie ? tie(a, b) : 0) * dir;
  };
}
