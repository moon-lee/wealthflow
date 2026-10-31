import { describe, it, expect } from 'vitest';
import { portfolioStyles } from '../src/styles/portfolio-styles.js';
import { wealthflowStyles } from '../src/styles/wealthflow-styles.js';

describe('portfolio styles', () => {
  it('defines the shared rules the five screens rely on', () => {
    const css = String(portfolioStyles);
    for (const rule of [
      '.portfolio-cards',
      '.portfolio-card',
      '.portfolio-table',
      '.portfolio-group-row',
      '.portfolio-totals',
      '.portfolio-note',
      '.portfolio-toolbar',
      '.portfolio-toolbar-left',
      '.portfolio-toolbar-right',
      '.portfolio-toggle',
    ]) {
      expect(css).toContain(rule);
    }
  });

  it('gives the segmented control a visible active state outside a header', () => {
    const css = String(portfolioStyles);
    // `.filter-btn.active` is only styled inside a topbar or a section
    // header, so a segmented control in a table toolbar needs its own rule or
    // the chosen option is invisible.
    expect(css).toContain('.portfolio-toolbar .segment .filter-btn.active');
  });

  it('lays the toolbar out with the options left and the actions right', () => {
    const css = String(portfolioStyles);
    expect(css).toMatch(
      /\.portfolio-toolbar\s*\{[^}]*justify-content:\s*space-between/,
    );
  });

  it('uses the same type size as the Trades list', () => {
    // The Investment table and the Trades log are the same product. A 12px
    // table under a 14px one reads as two different applications.
    const tokenOf = (css: string, sel: string) => {
      const i = css.indexOf(sel);
      if (i < 0) return '';
      const block = css.slice(i, css.indexOf('}', i));
      return block.match(/--ff-font-\w+/)?.[0] ?? '';
    };
    const portfolio = String(portfolioStyles);
    const hist = String(wealthflowStyles);
    expect(tokenOf(portfolio, '.portfolio-table {')).toBe(
      tokenOf(hist, '.hist-table tbody td {'),
    );
    expect(tokenOf(portfolio, '.portfolio-table {')).toBe('--ff-font-base');
    // The header matches too.
    expect(tokenOf(portfolio, '.portfolio-table th {')).toBe(
      tokenOf(hist, '.hist-table thead th {'),
    );
  });

  it('uses the design tokens rather than hardcoded colours', () => {
    const css = String(portfolioStyles);
    expect(css).toContain('var(--ff-');
    // A hex colour would not survive a theme change.
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
  });

  it('aligns money columns on the decimal', () => {
    expect(String(portfolioStyles)).toContain('tabular-nums');
  });

  /**
   * One rule block, from its selector to its closing brace. Used to compare
   * declarations between two stylesheets without matching the whole file.
   */
  function rule(css: string, selector: string): string {
    const start = css.indexOf(selector);
    if (start < 0) throw new Error(`no ${selector} rule`);
    return css.slice(start, css.indexOf('}', start) + 1);
  }

  it('gives the summary cards the parcel card surface', () => {
    // A parcel card is the reference: a surface a step lighter than the panel,
    // a rounded border, and a highlight under the mouse. The other card rows —
    // Trades Summary, Combined taxable, Superannuation, Capital gains — are
    // the same object and must not read as a different product.
    const wealth = String(wealthflowStyles);
    const portfolio = String(portfolioStyles);
    for (const block of [
      rule(wealth, '.stat {'),
      rule(portfolio, '.portfolio-card {'),
    ]) {
      expect(block).toMatch(/background:\s*var\(--ff-bg-input[,)]/);
      expect(block).toMatch(/border:\s*1px solid var\(--ff-border[,)]/);
      expect(block).toMatch(/border-radius:\s*var\(--ff-radius-xl,\s*8px\)/);
    }
  });

  it('highlights a summary card under the mouse', () => {
    const wealth = String(wealthflowStyles);
    const portfolio = String(portfolioStyles);
    for (const css of [wealth, portfolio]) {
      const hover = rule(
        css,
        css === wealth ? '.stat:hover {' : '.portfolio-card:hover {',
      );
      expect(hover).toMatch(/background:\s*var\(--ff-bg-input-hover/);
      expect(hover).toMatch(/border-color:\s*var\(--ff-accent/);
    }
  });

  it('stands each portfolio card on its own instead of sharing one strip', () => {
    // The parcel cards are separate tiles with a gap. A single bordered strip
    // with hairline dividers is a different object, so the container keeps no
    // chrome of its own and each card carries its own border.
    const portfolio = String(portfolioStyles);
    const cards = rule(portfolio, '.portfolio-cards {');
    expect(cards).toMatch(/gap:\s*12px/);
    expect(cards).not.toMatch(/border:/);
    expect(cards).not.toMatch(/background:/);
    const card = rule(portfolio, '.portfolio-card {');
    expect(card).not.toMatch(/border-left/);
    expect(portfolio).not.toContain('.portfolio-card:first-child');
  });

  it('right-aligns the numeric fields in the trade form', () => {
    // The form sits above a table of money. A number field that hugs the left
    // edge reads as text, and the digits stop lining up column to column.
    const css = String(wealthflowStyles);
    expect(css).toMatch(
      /\.trade-form-grid input\[type='number'\]\s*\{[^}]*text-align:\s*right/,
    );
  });
});
