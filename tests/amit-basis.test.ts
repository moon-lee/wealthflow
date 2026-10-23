// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { buildPortfolio, AS_OF } from './fixtures/portfolio.js';
import {
  getPortfolioSummary,
  readAmitBasis,
  writeAmitBasis,
  AMIT_BASIS_SETTING,
  type AmitBasis,
} from '../src/services/portfolio-service.js';
import '../src/ui/index.js';

/** Mount the Trades page, the way the app does. */
async function mount() {
  const { finance } = await buildPortfolio();
  const view: any = document.createElement('wealthflow-orchestrator');
  document.body.appendChild(view);
  await view.init(finance, { view: 'trades' });
  await view.updateComplete;
  const page: any = view.renderRoot.querySelector('trades-view');
  const summary: any = page.renderRoot.querySelector('trades-summary');
  const table: any = page.renderRoot.querySelector('investment-table');
  await summary.updateComplete;
  await table.updateComplete;
  return { finance, view, page, summary, table };
}

describe('the AMIT basis option', () => {
  it('defaults to pre-AMIT, which is what was actually paid', async () => {
    const { finance } = await buildPortfolio();
    expect(await readAmitBasis(finance)).toBe('pre');
    const s = await getPortfolioSummary(finance, AS_OF);
    expect(s.amitBasis).toBe('pre');
    expect(s.totalCostBase).toBeCloseTo(18146.12225, 2);
    expect(s.totalCapitalGain).toBeCloseTo(3223.51, 2);
  });

  it('post-AMIT is the tax basis, and the gain is $15.26 larger', async () => {
    const { finance } = await buildPortfolio();
    await writeAmitBasis(finance, 'post');
    const s = await getPortfolioSummary(finance, AS_OF);
    expect(s.amitBasis).toBe('post');
    expect(s.totalCostBase).toBeCloseTo(18130.86225, 2);
    expect(s.totalCapitalGain).toBeCloseTo(3238.77, 2);
    // The difference is exactly the AMIT total, and nothing else.
    expect(s.totalCapitalGain! - 3223.50775).toBeCloseTo(15.26, 2);
  });

  it('is stored, so it survives a restart', async () => {
    const { finance } = await buildPortfolio();
    await writeAmitBasis(finance, 'post');
    expect(await finance.settings.get(AMIT_BASIS_SETTING)).toBe('post');
    // A fresh read of the same store finds it.
    expect(await readAmitBasis(finance)).toBe('post');
  });

  it('falls back to pre-AMIT on a broken setting', async () => {
    const { finance } = await buildPortfolio();
    await finance.settings.set(AMIT_BASIS_SETTING, 'nonsense');
    expect(await readAmitBasis(finance)).toBe('pre');
    await finance.settings.set(AMIT_BASIS_SETTING, null);
    expect(await readAmitBasis(finance)).toBe('pre');
  });

  it('moves BOTH sections together when the toolbar switch is used', async () => {
    const { finance, view, summary, table } = await mount();
    // Both start on the same basis, and on the same number.
    expect(table.basis).toBe('pre');
    expect(summary.summary.amitBasis).toBe('pre');
    expect(table.totals.capitalGain).toBeCloseTo(3223.51, 2);
    expect(summary.summary.totalCapitalGain).toBeCloseTo(3223.51, 2);

    // Click it the way a person does.
    const seg = table.renderRoot.querySelector(
      '[aria-label="Cost base the gains are measured against"]',
    ) as any;
    const post = [...seg.querySelectorAll('.filter-btn')].find(
      (b: any) => b.textContent.trim() === 'Post-AMIT',
    ) as any;
    post.click();
    // The handler is async - it writes the setting and then re-reads - so
    // waiting for a render is not enough; wait for the value to arrive.
    await vi.waitFor(() =>
      expect(table.totals.capitalGain).toBeCloseTo(3238.77, 2),
    );
    await vi.waitFor(() =>
      expect(summary.summary.totalCapitalGain).toBeCloseTo(3238.77, 2),
    );
    await table.updateComplete;
    await summary.updateComplete;
    await view.updateComplete;

    // The table moved...
    expect(table.basis).toBe('post');
    expect(table.totals.capitalGain).toBeCloseTo(3238.77, 2);
    // ...and the SIBLING summary moved with it. Two sections on two bases
    // for the same money is the failure this whole option must not produce.
    expect(summary.summary.amitBasis).toBe('post');
    expect(summary.summary.totalCapitalGain).toBeCloseTo(3238.77, 2);
    // And it was stored, so the next session opens on the same basis.
    expect(await finance.settings.get(AMIT_BASIS_SETTING)).toBe('post');

    await view.updateComplete;
    view.remove();
  });

  it('says which basis each screen is on', async () => {
    const { view, summary, table } = await mount();
    const note = table.renderRoot.querySelector('.portfolio-note') as any;
    expect(note.textContent).toMatch(/Gains before AMIT adjustments/i);
    const summaryNote = summary.renderRoot.querySelector(
      '.portfolio-note',
    ) as any;
    expect(summaryNote.textContent).toMatch(
      /before AMIT cost base adjustments/i,
    );

    await table.setBasis('post' as AmitBasis);
    await vi.waitFor(() =>
      expect(summaryNote.textContent).toMatch(
        /after AMIT cost base adjustments/i,
      ),
    );
    await table.updateComplete;
    await summary.updateComplete;
    await view.updateComplete;
    expect(note.textContent).toMatch(/Gains after AMIT adjustments/i);
    expect(summaryNote.textContent).toMatch(
      /after AMIT cost base adjustments/i,
    );
    await view.updateComplete;
    view.remove();
  });

  it('leaves the CGT section alone - the tax basis is the law', async () => {
    const { finance } = await buildPortfolio();
    const { getCapitalGainsSummary } =
      await import('../src/services/capital-gains-service.js');
    const before = await getCapitalGainsSummary(finance, '2026-10-21');
    await writeAmitBasis(finance, 'post');
    const after = await getCapitalGainsSummary(finance, '2026-10-21');
    expect(after).toEqual(before);
  });
});
