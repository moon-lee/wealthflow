// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { buildPortfolio, AS_OF } from './fixtures/portfolio.js';
import { createMockFinance } from '../src/mock/finance-mock.js';
import { createStock } from '../src/dao/stocks.js';
import '../src/ui/index.js';

const VIEWS = [
  'bank-list',
  'interest-grid',
  'stock-list',
  'trade-log',
  'trade-form',
  'trades-view',
  'parcel-ledger',
  'dividend-log',
  'dividend-form',
  'super-form',
  'overview-view',
  'trades-summary',
  'investment-table',
  'cgt-section',
];

describe('the content of a conditional actually renders', () => {
  // These three views used to render their conditional branches from a
  // ROOT-level binding. happy-dom's parser drops lit's marker there, so the
  // branch rendered NOTHING - and no test could see it, because there was
  // nothing in the DOM to assert against. The dividend log's table was
  // simply blank.
  //
  // Each of these asserts the SPECIFIC content that comes out of the
  // conditional, not just that the element exists.
  const cases: [string, string, string][] = [
    ['dividend-log', '.table-wrap', 'the receipt table'],
    ['cgt-section', '.muted', 'the "no disposals" message'],
    ['interest-grid', '.empty-state', 'the "no active banks" message'],
  ];

  for (const [tag, selector, what] of cases) {
    it(`${tag} renders ${what}`, async () => {
      const { finance } = await buildPortfolio();
      const el: any = document.createElement(tag);
      document.body.appendChild(el);
      el.finance = finance;
      el.asOf = AS_OF;
      el.fy = '2026-2027';
      if (typeof el.setFinance === 'function') await el.setFinance(finance);
      if (typeof el.reload === 'function') await el.reload();
      await el.updateComplete;
      expect(
        el.renderRoot.querySelector(selector),
        `${tag} did not render ${what}`,
      ).toBeTruthy();
      el.remove();
    });
  }
});

describe('every view renders cleanly', () => {
  for (const tag of VIEWS) {
    it(`${tag} has no unbound binding`, async () => {
      const { finance } = await buildPortfolio();
      const f: any = finance;
      const el: any = document.createElement(tag);
      document.body.appendChild(el);
      el.finance = f;
      el.asOf = AS_OF;
      el.fy = '2026-2027';
      if (typeof el.setFinance === 'function') await el.setFinance(f);
      if (typeof el.reload === 'function') await el.reload();
      await el.updateComplete;
      const html = el.renderRoot?.innerHTML ?? '';
      if (html.includes('<?>')) {
        const i = html.indexOf('<?>');
        console.log(`DBG ${tag}:`, JSON.stringify(html.slice(i - 160, i + 60)));
      }
      expect(html, `${tag} rendered an unbound binding`).not.toContain('<?>');
      await el.updateComplete;
      el.remove();
    });
  }
});
