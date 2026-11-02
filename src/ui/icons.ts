import { html } from 'lit';

/**
 * Row-action glyphs, shared by the dividend log and the superannuation log.
 * Inline SVG (not an icon font or `<img>`) so they inherit `currentColor` from
 * the button and stay crisp in both themes. `aria-hidden` because the
 * accessible name lives on the button.
 */
export const PENCIL_ICON = html`<svg
  viewBox="0 0 24 24"
  aria-hidden="true"
  focusable="false"
>
  <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z"></path>
  <path d="M14.5 6.5 17.5 9.5"></path>
</svg>`;

export const TRASH_ICON = html`<svg
  viewBox="0 0 24 24"
  aria-hidden="true"
  focusable="false"
>
  <path d="M4 7h16"></path>
  <path d="M9 7V5h6v2"></path>
  <path d="M6 7l1 13h10l1-13"></path>
  <path d="M10 11v6M14 11v6"></path>
</svg>`;
