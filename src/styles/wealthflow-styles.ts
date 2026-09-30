import { css } from 'lit';

/**
 * Wealthflow-owned component styles. Complements the vendored
 * `sharedStyles` (ext-layout.css), which only styles `.filter-btn`
 * inside `.topbar` and leaves bare `table` / `input` / `select` /
 * `form` elements unstyled. Every Lit view adds this to its
 * `static styles` array next to `sharedStyles`.
 *
 * All colors come from `var(--ff-*)` tokens (accent follows
 * `wealthflow.themeColor` at runtime). Never hardcode hex here.
 */
export const wealthflowStyles = css`
  .section {
    padding: 16px;
  }
  .section h3 {
    margin-bottom: 12px;
  }
  .section h4 {
    margin: 0 0 8px;
    font-size: var(--ff-font-base, 14px);
    font-weight: 600;
    color: var(--ff-text-strong, #fff);
  }
  .section p {
    margin: 8px 0;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 12px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: var(--ff-font-sm, 12px);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    color: var(--ff-text-muted, #858585);
  }
  input,
  select {
    background: var(--ff-bg-input, #3c3c3c);
    color: var(--ff-text, #d4d4d4);
    border: 1px solid var(--ff-border, #3e3e3e);
    border-radius: 3px;
    padding: 6px 10px;
    font-size: var(--ff-font-base, 14px);
    font-family: inherit;
    outline: none;
    text-transform: none;
    letter-spacing: 0;
    font-weight: 400;
  }
  input:focus,
  select:focus {
    border-color: var(--ff-accent, #007acc);
  }
  input::placeholder {
    color: var(--ff-text-muted, #858585);
    opacity: 0.7;
  }
  input[type='date']::-webkit-calendar-picker-indicator {
    cursor: pointer;
  }

  .filter-btn {
    background: var(--ff-bg-input, #3c3c3c);
    color: var(--ff-text, #d4d4d4);
    border: 1px solid var(--ff-border, #3e3e3e);
    padding: 5px 12px;
    border-radius: 3px;
    font-size: var(--ff-font-base, 14px);
    cursor: pointer;
  }
  .filter-btn:hover {
    border-color: var(--ff-accent, #007acc);
  }
  .topbar .filter-btn.active {
    border-color: var(--ff-accent, #007acc);
    color: var(--ff-text-strong, #fff);
  }
  .topbar select {
    background: var(--ff-bg-input, #3c3c3c);
    color: var(--ff-text, #d4d4d4);
    border: 1px solid var(--ff-border, #3e3e3e);
    border-radius: 3px;
    padding: 5px 8px;
    font-size: var(--ff-font-base, 14px);
    font-family: inherit;
    outline: none;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--ff-font-base, 14px);
  }
  th,
  td {
    text-align: left;
    padding: 8px 12px;
    border-bottom: 1px solid var(--ff-border, #3e3e3e);
    vertical-align: middle;
  }
  th {
    font-size: var(--ff-font-sm, 12px);
    text-transform: uppercase;
    letter-spacing: 0.3px;
    color: var(--ff-text-muted, #858585);
  }
  td.num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  tr.muted {
    opacity: 0.55;
  }
  tfoot td {
    font-weight: 600;
    color: var(--ff-text-strong, #fff);
  }
  td input {
    width: 100%;
    min-width: 72px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  td .filter-btn {
    margin-right: 6px;
  }
  td .filter-btn:last-child {
    margin-right: 0;
  }

  .badge {
    display: inline-block;
    background: var(--ff-border, #3e3e3e);
    color: var(--ff-text-muted, #858585);
    font-size: var(--ff-font-xs, 11px);
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 2px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    vertical-align: middle;
  }

  .callout-warn {
    background: var(--ff-warning-bg, #3a2e0a);
    color: var(--ff-warning-text, #ffd866);
    border: 1px solid var(--ff-warning, #cca700);
    border-radius: 3px;
    padding: 6px 10px;
    font-size: var(--ff-font-sm, 12px);
    margin: 4px 0;
  }
  p.field-error {
    margin: 4px 0;
  }

  ul {
    margin: 8px 0;
    padding-left: 20px;
  }
  li {
    margin: 2px 0;
  }

  form .btn-primary,
  form .filter-btn {
    align-self: flex-start;
  }
  /* Labeled field grid — four fields on one row, notes full width below.
     Used by the add forms so they read as the same screen as the table's
     edit mode without spending a column on the submit button. */
  .field-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px 10px;
    align-items: end;
  }
  .field-grid.cols-3 {
    grid-template-columns: repeat(3, 1fr);
  }
  .field-grid .span-3 {
    grid-column: span 3;
  }
  @media (max-width: 900px) {
    .field-grid,
    .field-grid.cols-3 {
      grid-template-columns: repeat(2, 1fr);
    }
    .field-grid .span-3 {
      grid-column: 1 / -1;
    }
  }
  @media (max-width: 560px) {
    .field-grid,
    .field-grid.cols-3 {
      grid-template-columns: 1fr;
    }
  }
  /* Editable matrix cell: amount input keeps the full track, the per-entry
     Edit button sits beside it so notes/date/bank stay reachable. */
  .cell-edit {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
  }
  .cell-edit input {
    flex: 1 1 auto;
    min-width: 0;
  }
  .cell-edit .btn-small {
    flex: 0 0 auto;
  }
  /* Filter strip above a log table. The 8px side padding is the table's own
     cell padding (6px 8px), so the labels line up with the header text and the
     badge stops short of the right-hand edge instead of touching it. The top
     margin lives on the host below — this is the strip's first child, so a
     margin here would sit inside the host's own spacing. */
  .log-filters {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
    margin: 0 0 12px;
    padding: 0 8px;
    font-size: var(--ff-font-sm, 12px);
  }
  .log-filters label {
    flex-direction: row;
    align-items: center;
    gap: 6px;
  }
  /* Widest label ("Stock") sets the track, so both selects start on one x. */
  .log-filters label > span {
    min-width: 40px;
  }
  .log-filters select {
    min-width: 132px;
    padding: 5px 10px;
    font-size: 13px;
  }
  .log-filters .rate-badge {
    margin-left: auto;
    padding: 2px 10px;
  }
  /* The two log tables sit in a padded .section-body, so the 12px top margin
     belongs on the host to separate the section header from the filter row.
     Clearing the background is the other half: the vendored :host rule
     (ext-layout.css:10) paints every component --ff-bg-base, which is darker
     than the section, so the margin would read as a dark divider band rather
     than as space. :host(tag) keeps this off the other components that share
     this stylesheet. */
  :host(dividend-log),
  :host(interest-grid) {
    display: block;
    margin-top: 12px;
    background: transparent;
  }
  .section-body form {
    margin-top: 0;
  }
  /* A field is the label, its control, and — once touched — the message.
     Grid keeps the markup as it was while putting the message on the label's
     own line, right-aligned to the control below it, so a validation error
     no longer shoves the control down. Column 1 is the label, column 2 takes
     the message, and the control spans both. */
  .field {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: baseline;
    gap: 3px 8px;
    min-width: 0;
  }
  .field > span {
    grid-row: 1;
    grid-column: 1;
    font-size: var(--ff-font-sm, 12px);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    color: var(--ff-text-muted, #858585);
  }
  /* Both row numbers are explicit: the message is the third child in the
     markup, and auto-placement would push it below the control. */
  .field > .field-error {
    grid-row: 1;
    grid-column: 2;
    justify-self: end;
    text-align: right;
    margin: 0;
    min-width: 0;
    font-size: var(--ff-font-sm, 12px);
  }
  /* Required-field marker; the inputs keep the native required attribute
     for assistive tech, so the glyph itself is decorative. */
  .req {
    font-style: normal;
    color: var(--ff-danger, #f48771);
    margin-left: 3px;
  }
  .field input,
  .field select,
  .field textarea {
    grid-row: 2;
    grid-column: 1 / -1;
    width: 100%;
  }
  .field-wide {
    grid-column: 1 / -1;
  }
  .btn-primary {
    padding: 6px 20px;
    border-radius: 3px;
    font-size: var(--ff-font-base, 14px);
    cursor: pointer;
  }
  .btn-primary:disabled {
    opacity: 0.5;
    cursor: default;
  }
  /* Compact action button for table rows and section headers. Sits a step
     below .btn/.btn-primary (14px) but keeps the 600 weight of the field
     labels it shares a line with, so 12px text does not read thin. */
  .btn-small {
    font-size: var(--ff-font-sm, 12px);
    font-weight: 600;
    padding: 2px 10px;
  }

  /* ===== Master-data list dialect (bank-list, stock-list) =====
     Both master views are deliberately the same screen: a section header
     with a count, an evenly-split table, a clickable status pill, and an
     inline edit row that mirrors the add form. */
  .order-stack {
    display: flex;
    flex-direction: column;
  }
  /* Fixed layout with no colgroup splits the columns evenly. */
  table.data-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  table.data-table th {
    text-align: left;
    font-size: var(--ff-font-sm, 12px);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--ff-text-muted, #858585);
    padding: 6px 8px;
    border-bottom: 1px solid var(--ff-border, #3e3e3e);
    white-space: nowrap;
  }
  table.data-table td {
    padding: 8px;
    border-bottom: 1px solid var(--ff-border, #3e3e3e);
    vertical-align: middle;
    font-size: var(--ff-font-base, 14px);
  }
  table.data-table th.num,
  table.data-table td.num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  table.data-table tbody tr:hover {
    background: var(--ff-bg-input-hover, #4a4a4a);
  }
  table.data-table tbody tr.editing {
    background: var(--ff-bg-subpanel, #2a2a2a);
  }
  table.data-table tbody tr.editing td:first-child {
    box-shadow: inset 3px 0 0 var(--ff-accent, #007acc);
  }
  table.data-table tbody tr.inactive {
    opacity: 0.6;
  }
  /* Total row: the log's only place a subtotal belongs, so it reads as one. */
  table.data-table tfoot td {
    padding: 8px;
    border-top: 1px solid var(--ff-border, #3e3e3e);
    font-size: var(--ff-font-sm, 12px);
    font-weight: 700;
    color: var(--ff-text-strong, #fff);
  }
  /* The word that names the row picks up the accent, the way a badge does, so
     the label and the figures read as two different things. */
  table.data-table tfoot td.total-label {
    color: var(--ff-accent, #007acc);
  }
  /* Sortable column header (dateSortHeader in ui/sort-header.ts). A real button
     so the order is reachable by keyboard; it borrows the th's own typography so
     it does not look like a control dropped into a heading. */
  .th-sort {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: none;
    padding: 0;
    color: inherit;
    font: inherit;
    letter-spacing: inherit;
    text-transform: inherit;
    cursor: pointer;
  }
  .th-sort:hover {
    color: var(--ff-text-strong, #fff);
  }
  .th-sort:focus-visible {
    outline: 1px solid var(--ff-accent, #007acc);
    outline-offset: 2px;
  }
  /* Idle: the affordance is there but unassertive. Active: the accent says
     which way the column is sorted without relying on the glyph. */
  .th-sort .caret {
    font-size: 9px;
    line-height: 1;
    opacity: 0.5;
  }
  th[aria-sort] .th-sort {
    color: var(--ff-text-strong, #fff);
  }
  th[aria-sort] .th-sort .caret {
    opacity: 1;
    color: var(--ff-accent, #007acc);
  }

  /* Pager under a paged log. Hidden entirely when the FY fits on one page, so
     the common case has no dead control in it. */
  .table-pager {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 10px;
    font-size: var(--ff-font-sm, 12px);
  }
  .pager-actions {
    display: flex;
    gap: 6px;
  }
  .row-code {
    font-weight: 700;
    color: var(--ff-text-strong, #fff);
    margin-right: 6px;
  }
  .row-sub {
    display: block;
    color: var(--ff-text-muted, #858585);
    font-size: var(--ff-font-sm, 12px);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mono {
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.4px;
  }
  .row-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    justify-content: flex-end;
  }
  /* Clickable status badge — replaces the per-row Activate/Deactivate button. */
  .status-toggle {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: var(--ff-bg-input, #3c3c3c);
    border: 1px solid var(--ff-border, #3e3e3e);
    color: var(--ff-text-muted, #858585);
    font-family: inherit;
    font-size: var(--ff-font-sm, 12px);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    padding: 1px 8px;
    border-radius: 10px;
    cursor: pointer;
    vertical-align: middle;
  }
  .status-toggle::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--ff-text-muted, #858585);
  }
  .status-toggle.on {
    color: var(--ff-accent, #007acc);
    border-color: var(--ff-accent, #007acc);
  }
  .status-toggle.on::before {
    background: var(--ff-accent, #007acc);
  }
  .status-toggle:hover {
    background: var(--ff-bg-input-hover, #4a4a4a);
  }
  .status-toggle:focus-visible,
  .row-actions button:focus-visible {
    outline: 1px solid var(--ff-accent, #007acc);
    outline-offset: 1px;
  }
  /* Edit row mirrors the add form: the fields on one line, then notes and
     the actions on a second line. One cell spanning the table keeps the
     columns from fighting the grid. */
  .edit-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px 10px;
    align-items: end;
  }
  .edit-grid.cols-3 {
    grid-template-columns: repeat(3, 1fr);
  }
  @media (max-width: 900px) {
    .edit-grid,
    .edit-grid.cols-3 {
      grid-template-columns: repeat(2, 1fr);
    }
    .edit-grid .edit-buttons,
    .edit-grid.cols-3 .edit-buttons {
      grid-column: 1 / -1;
    }
  }
  /* Table cells right-align inputs by default; these are text fields. */
  .edit-grid .field input {
    width: 100%;
    min-width: 0;
    text-align: left;
    font-variant-numeric: normal;
  }
  .edit-notes {
    grid-column: 1 / span 2;
  }
  .edit-buttons {
    grid-column: 3 / span 2;
    display: flex;
    justify-content: flex-end;
    gap: 6px;
    padding-bottom: 1px;
  }
  .edit-grid.cols-3 .edit-buttons {
    grid-column: 3 / span 1;
  }
  .empty-state {
    padding: 20px 8px;
    text-align: center;
    color: var(--ff-text-muted, #858585);
  }
  /* Outcome of a section-level action, stated once under the header. */
  .notice {
    margin: 0 0 10px;
    font-size: var(--ff-font-sm, 12px);
    color: var(--ff-text-muted, #858585);
  }

  /* Mortgage-dialect cards: section-header/body, stat-grid, hist-table.
     Mirrors mortgage-overview-view.ts so cross-extension screens read as one app. */
  .section.flush {
    padding: 0;
    overflow: hidden;
  }
  .section-header {
    background: var(--ff-bg-subpanel, #2a2a2a);
    padding: 8px 16px;
    border-bottom: 1px solid var(--ff-border, #3e3e3e);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 42px;
  }
  .section-header h3 {
    margin-bottom: 0;
  }
  .section-body {
    padding: 16px;
  }
  /* A fixed strip inside a foldable section: the part that has to stay readable
     when the body collapses. It reads as part of the section rather than as a
     card in its own right, so it carries the section's padding and no chrome of
     its own. The rule below it is drawn only while the body is there to separate. */
  .section-summary {
    padding: 12px 16px;
  }
  .section-summary + .section-body:not([hidden]) {
    border-top: 1px solid var(--ff-border, #3e3e3e);
  }
  /* The superannuation section is three bands — position, form, log — on one
     screen, so it runs tighter than the two-padding rhythm the single-band
     sections use. 12px either side of the rule reads as one space, not two. */
  .section-body.super-body {
    padding: 12px 16px 16px;
  }
  /* One form per section, opened above the log it feeds. A fixed gap below it,
     so the form never sits flush against the table it is filling. Adjacent
     margins collapse, so the form and any notice above it share the 12px
     rather than stacking two of them. */
  .section-body > dividend-form,
  .section-body > interest-form,
  .section-body > super-form {
    display: block;
    margin-bottom: 12px;
  }
  .section-body > .notice,
  .section-body > .muted {
    margin-bottom: 12px;
  }
  /* Collapsing sets the hidden attribute; state it here too so a later display
     on .section-body cannot silently turn every collapsed section back on. */
  .section-body[hidden] {
    display: none;
  }
  /* ===== Collapsible overview sections (mirrors expenseflow) =====
     The whole header bar is the click target, and the title inside it is a real
     button so the control is reachable by keyboard and announces its own
     expanded state. Section actions stop their click from reaching the bar, or
     "Log dividend" would fold the section it just opened. */
  .section-header.is-toggle {
    cursor: pointer;
    user-select: none;
  }
  .section-header.is-toggle:hover {
    background: color-mix(in srgb, var(--ff-text, #d4d4d4) 6%, transparent);
  }
  /* The title was an <h3> before it became a control, and a button may only hold
     phrasing content — so the heading's metrics move onto the button itself.
     The size is the UA's 1.17em h3 measured against the bar's 15px (≈17.55px),
     kept in em rather than rounded to a token so the title stays the size it was.
     Declared after the font shorthand because that shorthand would reset it. */
  .section-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    background: none;
    border: none;
    padding: 0;
    color: inherit;
    font: inherit;
    font-size: 1.17em;
    font-weight: 700;
    text-align: left;
    cursor: inherit;
  }
  .section-toggle:focus-visible {
    outline: 2px solid var(--ff-accent, #007acc);
    outline-offset: 2px;
    border-radius: 2px;
  }
  .section-toggle .section-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* Chevron, drawn from borders so it inherits the title's colour. Points right
     when folded, down when open. */
  .section-toggle .chevron {
    width: 0;
    height: 0;
    flex: none;
    border-left: 5px solid currentColor;
    border-top: 4px solid transparent;
    border-bottom: 4px solid transparent;
    color: var(--ff-text-muted, #858585);
    opacity: 0.6;
    transform: rotate(0deg);
    transition:
      transform 120ms ease,
      opacity 120ms ease;
  }
  .section-toggle[aria-expanded='true'] .chevron {
    transform: rotate(90deg);
  }
  .section-header.is-toggle:hover .chevron {
    opacity: 1;
  }
  /* A folded section hides its body, and the body's own count badge goes with
     it — so the header keeps one. Quiet by design: it must not compete with the
     section actions to the right of it. */
  .section-badge.rows-badge {
    background: transparent;
    border-color: var(--ff-border, #3e3e3e);
    color: var(--ff-text-muted, #858585);
    font-weight: 600;
  }
  .header-actions .section-badge {
    background: var(--ff-bg-input, #3c3c3c);
    border: 1px solid var(--ff-border, #3e3e3e);
    color: var(--ff-text-muted, #858585);
    font-size: var(--ff-font-sm, 12px);
    font-weight: 600;
    letter-spacing: 0.3px;
    padding: 1px 10px;
    border-radius: 12px;
    white-space: nowrap;
  }
  @media (prefers-reduced-motion: reduce) {
    .section-toggle .chevron {
      transition: none;
    }
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }
  .header-actions .btn {
    padding: 2px 12px;
    font-size: var(--ff-font-sm, 12px);
  }
  .rate-badge {
    display: inline-block;
    font-weight: 800;
    font-size: var(--ff-font-sm, 12px);
    letter-spacing: 0.3px;
    color: var(--ff-accent, #007acc);
    background: var(--ff-bg-input, #3c3c3c);
    border: 1px solid var(--ff-accent, #007acc);
    border-radius: 12px;
    padding: 1px 10px;
    white-space: nowrap;
  }
  .stat-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
  }
  /* Two headline cards fill the width instead of hugging the left half. */
  .stat-grid.cols-2 {
    grid-template-columns: repeat(2, 1fr);
  }
  /* Three for the superannuation summary: position, private, employer. */
  .stat-grid.cols-3 {
    grid-template-columns: repeat(3, 1fr);
  }
  /* Four for the Combined taxable breakdown: the gross and the three parts. */
  .stat-grid.cols-4 {
    grid-template-columns: repeat(4, 1fr);
  }
  @media (max-width: 640px) {
    .stat-grid,
    .stat-grid.cols-2,
    .stat-grid.cols-3,
    .stat-grid.cols-4 {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  @media (max-width: 420px) {
    .stat-grid.cols-3,
    .stat-grid.cols-4 {
      grid-template-columns: 1fr;
    }
  }
  .stat {
    background: var(--ff-bg-subpanel, #2a2a2a);
    border: 1px solid var(--ff-border, #3e3e3e);
    border-radius: 6px;
    padding: 12px 14px;
    min-width: 0;
  }
  /* Caption inside a card, so a card carries its own "where this comes from"
     instead of a footnote stranded under the grid. */
  .stat-note {
    margin-top: 6px;
    font-size: var(--ff-font-sm, 12px);
    color: var(--ff-text-muted, #858585);
  }
  .stat-label {
    font-size: var(--ff-font-sm, 12px);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    color: var(--ff-text-muted, #858585);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .stat-value {
    font-size: var(--ff-font-xl, 17px);
    font-weight: 600;
    color: var(--ff-text-strong, #fff);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-variant-numeric: tabular-nums;
  }
  /* In the superannuation strip the label names the figure and stays left, but
     the figures themselves are money and read right, so a column of amounts
     lines up digit for digit. Scoped to the strip: Combined taxable keeps its
     left-aligned figures. */
  .section-summary .stat-value,
  .section-summary .stat-note {
    text-align: right;
  }
  /* The strip's labels run long — "LATEST SUPER BALANCE" — and clipping that to
     "LATEST SUPER BAL…" says less than wrapping it onto two lines does. */
  .section-summary .stat-label {
    white-space: normal;
  }
  .hist-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  .hist-table thead th {
    font-size: var(--ff-font-sm, 12px);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--ff-text-muted, #858585);
    text-align: left;
    padding: 6px 8px;
    border-bottom: 1px solid var(--ff-border, #3e3e3e);
    white-space: nowrap;
  }
  .hist-table thead th.num {
    text-align: right;
  }
  .hist-table tbody td {
    padding: 6px 8px;
    border-bottom: 1px solid var(--ff-border, #3e3e3e);
    font-size: var(--ff-font-base, 14px);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .hist-table tbody tr:nth-child(even) {
    background: var(--ff-bg-subpanel, #2a2a2a);
  }
  .hist-table tbody tr:hover {
    background: var(--ff-bg-input-hover, #4a4a4a);
  }
  .hist-table td.num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .hist-table td.money {
    font-weight: 700;
    color: var(--ff-text-strong, #fff);
  }
  .muted {
    color: var(--ff-text-muted, #858585);
    font-size: var(--ff-font-sm, 12px);
  }
  .order-stack {
    display: flex;
    flex-direction: column;
  }

  /* ===== Topbar dialect (mirrors expenseflow) =====
     Crumb on the left, then right-aligned chrome ending in the finance-year
     control with a visible label. Which section you are on is stated by the
     crumb, not by a switch: the host owns navigation, so a second copy of it
     here would be a control that can disagree with the sidebar. */
  /* The FY label shares the control's baseline so the pair reads as one unit
     rather than as two items in the bar's flex gap. */
  .topbar .fy-label {
    display: inline-flex;
    align-items: center;
    flex-direction: row;
    margin: 0;
    font-size: var(--ff-font-sm, 12px);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    color: var(--ff-text-muted, #858585);
    white-space: nowrap;
    cursor: default;
  }
  .topbar select:focus-visible {
    outline: 1px solid var(--ff-accent, #007acc);
    outline-offset: 1px;
  }
  /* Narrow panel: the bar keeps its order, but the label is the first thing to
     go so the control it names stays with its options. */
  @media (max-width: 720px) {
    .topbar .fy-label {
      display: none;
    }
  }
`;
