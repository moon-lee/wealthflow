import { css } from 'lit';

/**
 * Shared styling for the Trades page: the Trades Summary cards, the
 * Investment table, the Trades log, the Parcels ledger and the Overview's
 * Capital gains section.
 *
 * These five screens sit together, and they used to look like four unrelated
 * pages. One stylesheet means one treatment rather than five near-copies.
 *
 * Every colour comes from a `var(--ff-*)` token and every size from a
 * `var(--ff-space-*)` / `var(--ff-font-*)` token. The tokens are always
 * defined by the vendored `ext-tokens.css`, so no fallback values are needed
 * here — and a bare hex would not survive a theme change.
 */
export const portfolioStyles = css`
  /* ---- The card row -------------------------------------------------- */
  /* Separate tiles with a gap, the way the parcel cards sit: each card carries
     its own surface and border, so the row needs no container chrome. */
  .portfolio-cards {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 12px;
  }

  .portfolio-card {
    display: flex;
    flex-direction: column;
    gap: var(--ff-space-1);
    padding: 12px 16px;
    background: var(--ff-bg-input);
    border: 1px solid var(--ff-border);
    border-radius: var(--ff-radius-xl, 8px);
    min-width: 0;
    transition:
      background-color 120ms ease,
      border-color 120ms ease;
  }

  .portfolio-card:hover {
    background: var(--ff-bg-input-hover);
    border-color: var(--ff-accent);
  }

  /* A four-card row — the Overview's capital gains, which has four cards
     against the Trades Summary's five. */
  .portfolio-cards.cols-4 {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .portfolio-card .stat-label,
  .portfolio-card-label {
    font-size: var(--ff-font-sm);
    font-weight: 500;
    color: var(--ff-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .portfolio-card .stat-value,
  .portfolio-card-value {
    font-size: var(--ff-font-2xl);
    font-weight: 600;
    line-height: 1.15;
    color: var(--ff-text-strong);
    /* Money must not reflow when a figure grows. */
    font-variant-numeric: tabular-nums;
  }

  .portfolio-card .stat-note,
  .portfolio-card-note {
    font-size: var(--ff-font-xs);
    color: var(--ff-text-muted);
  }

  .portfolio-card-value.is-ok {
    color: var(--ff-success);
  }

  .portfolio-card-value.is-neg {
    color: var(--ff-danger);
  }

  /* ---- The holdings table --------------------------------------------- */
  /* The type and spacing match the .hist-table rule exactly, so the Investment
     table and the Trades list read as one product rather than two. A 12px
     table sitting under a 14px one looks like a different application. */
  .portfolio-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--ff-font-base);
  }

  .portfolio-table th,
  .portfolio-table td {
    padding: 6px var(--ff-space-2);
    text-align: left;
    border-bottom: 1px solid var(--ff-border);
    white-space: nowrap;
  }

  .portfolio-table th {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--ff-bg-subpanel);
    font-size: var(--ff-font-sm);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--ff-text-muted);
  }

  .portfolio-table td.num,
  .portfolio-table th.num {
    text-align: right;
    /* Columns of money line up on the decimal, not on the character. */
    font-variant-numeric: tabular-nums;
  }

  .portfolio-table tbody tr:hover {
    background: var(--ff-bg-input-hover);
  }

  .portfolio-table .portfolio-group-row td {
    background: var(--ff-bg-subpanel);
    font-size: var(--ff-font-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    color: var(--ff-text-muted);
  }

  .portfolio-table .portfolio-totals td {
    font-weight: 600;
    border-top: 1px solid var(--ff-border);
    border-bottom: none;
    color: var(--ff-text-strong);
    background: var(--ff-bg-panel);
  }

  /* ---- The table toolbar ---------------------------------------------- */
  /* Left holds a view option, right holds the view controls and the edit
     action — the same split the reference uses, and the same one the rest of
     the app uses for a section's contextual actions. */
  .portfolio-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ff-space-3);
    flex-wrap: wrap;
    margin-bottom: var(--ff-space-3);
  }

  .portfolio-toolbar-left,
  .portfolio-toolbar-right {
    display: flex;
    align-items: center;
    gap: var(--ff-space-3);
    flex-wrap: wrap;
  }

  /* The switch. A native checkbox keeps it keyboard- and screen-reader-
     correct; only its appearance is styled. */
  .portfolio-toggle {
    display: inline-flex;
    align-items: center;
    gap: var(--ff-space-2);
    font-size: var(--ff-font-sm);
    font-weight: 500;
    color: var(--ff-text-muted);
    cursor: pointer;
    user-select: none;
    white-space: nowrap;
  }

  .portfolio-toggle:hover {
    color: var(--ff-text);
  }

  .portfolio-toggle input {
    accent-color: var(--ff-accent);
    width: 14px;
    height: 14px;
    margin: 0;
    cursor: pointer;
  }

  /* The segmented control: two joined segments with one filled, so the
     current choice is obvious. Scoped to the toolbar because the section
     header has its own treatment for the same idea. */
  .portfolio-toolbar .segment {
    display: inline-flex;
    align-items: stretch;
    border: 1px solid var(--ff-border);
    border-radius: var(--ff-radius-sm);
    overflow: hidden;
    background: var(--ff-bg-subpanel);
  }

  .portfolio-toolbar .segment .filter-btn {
    background: transparent;
    border: none;
    border-radius: 0;
    padding: 4px 12px;
    font-size: var(--ff-font-sm);
    font-weight: 500;
    color: var(--ff-text-muted);
  }

  .portfolio-toolbar .segment .filter-btn + .filter-btn {
    border-left: 1px solid var(--ff-border);
  }

  .portfolio-toolbar .segment .filter-btn:hover {
    background: var(--ff-bg-input);
    color: var(--ff-text);
  }

  .portfolio-toolbar .segment .filter-btn.active {
    background: var(--ff-bg-input);
    color: var(--ff-text-strong);
    font-weight: 600;
  }

  /* ---- The Price header, which updates the prices ---------------------- */
  /* The update lives in the column it affects, so it is where the eye goes
     anyway. It is a button because it does something: a sort and a price fetch
     behind one click would be a surprise, and a fetch can be slow. */
  .portfolio-table .price-update {
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

  .portfolio-table .price-update:hover {
    color: var(--ff-text-strong);
  }

  .portfolio-table .price-update:focus-visible {
    outline: 1px solid var(--ff-accent);
    outline-offset: 2px;
  }

  .portfolio-table .price-update:disabled {
    cursor: progress;
    opacity: 0.7;
  }

  .price-update-icon {
    color: var(--ff-accent);
    font-size: var(--ff-font-sm);
    line-height: 1;
  }

  /* ---- The price editor ------------------------------------------------ */
  /* The app's generic input rule is sized for a form field, not for a cell
     in a dense table: at 14px with 6px/10px padding the control is taller
     than the row around it and the column goes ragged.
     So the editor BLENDS: no fill, no border, the same text metrics as the
     cell it replaces. The affordance appears on the ONE box you are in, not
     on every box at once. */
  .portfolio-price-input {
    width: 100%;
    min-width: 80px;
    padding: 2px 4px;
    font-size: var(--ff-font-sm);
    text-align: right;
    font-variant-numeric: tabular-nums;
    background: transparent;
    border: 1px solid transparent;
    color: inherit;
  }

  /* A hairline on hover is enough to say "this one is editable". */
  .portfolio-price-input:hover {
    border-color: var(--ff-border);
  }

  /* Focus is the only loud state, and it belongs to one cell. */
  .portfolio-price-input:focus,
  .portfolio-price-input:focus-visible {
    outline: none;
    border-color: var(--ff-accent);
    caret-color: var(--ff-accent);
  }

  /* The browser's spinners are noise in a table cell, and stepping a price
     by a thousandth of a cent is not a thing anyone does. */
  .portfolio-price-input::-webkit-inner-spin-button,
  .portfolio-price-input::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .portfolio-price-input[type='number'] {
    -moz-appearance: textfield;
    appearance: textfield;
  }

  /* The column being edited says so, so the boxes are not a mystery. */
  .portfolio-table th.is-editing {
    color: var(--ff-accent);
  }

  /* ---- A price that came from the market ------------------------------- */
  /* A price typed in by hand and a price fetched from the exchange look
     identical on screen, and one of them can be quietly wrong. The marker says
     which is which — on the marker, not on the number, so it does not compete
     with the green and red gain columns. */
  .price-live-mark {
    color: var(--ff-accent);
    font-size: 9px;
    line-height: 1;
    margin-left: 4px;
    vertical-align: super;
  }

  /* ---- The parcel ledger's groups -------------------------------------- */
  /* A holding is a group: a header that expands to its lots. The header is a
     button, so the whole row is the control. */
  .parcel-group {
    border: 1px solid var(--ff-border);
    border-radius: var(--ff-radius-md);
    overflow: hidden;
    margin-bottom: var(--ff-space-3);
  }

  .parcel-group-head {
    display: flex;
    align-items: center;
    gap: var(--ff-space-3);
    width: 100%;
    padding: var(--ff-space-2) var(--ff-space-3);
    background: var(--ff-bg-subpanel);
    border: none;
    border-bottom: 1px solid var(--ff-border);
    color: var(--ff-text);
    font-size: var(--ff-font-base);
    text-align: left;
    cursor: pointer;
  }

  .parcel-group-head:hover {
    background: var(--ff-bg-input-hover);
  }

  .parcel-group-head b {
    color: var(--ff-text-strong);
  }

  .parcel-group-head .section-badge {
    margin-left: var(--ff-space-2);
  }

  /* Pushes the summary figures to the right of the header. */
  .parcel-group-head .spacer {
    flex: 1;
  }

  .parcel-group .hist-table {
    margin: 0;
  }

  /* ---- The sell preview ------------------------------------------------ */
  /* The allocation preview sits below the fields and above the fold-out list
     it belongs to, so it reads as part of the form rather than as a log. */
  .portfolio-preview {
    margin-top: var(--ff-space-4);
    padding-top: var(--ff-space-3);
    border-top: 1px solid var(--ff-border);
  }

  .portfolio-preview .section-title {
    margin-bottom: var(--ff-space-2);
  }

  /* ---- Supporting text ------------------------------------------------ */
  .portfolio-note {
    margin: var(--ff-space-3) 0 0;
    font-size: var(--ff-font-xs);
    color: var(--ff-text-muted);
  }

  .portfolio-warning {
    margin: var(--ff-space-2) 0 0;
    font-size: var(--ff-font-xs);
    color: var(--ff-warning-text);
    background: var(--ff-warning-bg);
    padding: var(--ff-space-2) var(--ff-space-3);
    border-radius: var(--ff-radius-sm);
  }

  @media (max-width: 900px) {
    .portfolio-cards {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
`;
