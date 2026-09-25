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
`;
