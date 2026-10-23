// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { buildPortfolio, AS_OF } from './fixtures/portfolio.js';
import '../src/ui/index.js';

/**
 * Lit leaves an unbound binding position as the literal text `<?>`.
 *
 * That happens when a binding's value is not a plain expression — most
 * often a NESTED template inside a binding, or a multi-line attribute
 * binding. The template renders, the rest of the page looks fine, and the
 * affected value simply comes out EMPTY or binds to the wrong thing.
 *
 * It bit the Investment table twice: a dead Update-prices button, and a
 * subtitle line with no price date on it. So the rendered HTML of the
 * screens is checked for the marker.
 */
describe('no unbound lit bindings', () => {
  it('leaves no <?> marker in the Investment table', async () => {
    const { finance } = await buildPortfolio();
    const el: any = document.createElement('investment-table');
    document.body.appendChild(el);
    el.asOf = AS_OF;
    await el.setFinance(finance);
    await el.updateComplete;
    el.editing = true;
    el.requestUpdate?.();
    await el.updateComplete;
    const html = el.renderRoot.innerHTML;
    expect(html).not.toContain('<?>');
    await el.updateComplete;
    el.remove();
  });

  it('leaves no <?> marker in the Trades Summary', async () => {
    const { finance } = await buildPortfolio();
    const el: any = document.createElement('trades-summary');
    document.body.appendChild(el);
    el.asOf = AS_OF;
    await el.setFinance(finance);
    await el.updateComplete;
    expect(el.renderRoot.innerHTML).not.toContain('<?>');
    await el.updateComplete;
    el.remove();
  });

  it('leaves no <?> marker on the Trades page', async () => {
    const { finance } = await buildPortfolio();
    const view: any = document.createElement('wealthflow-orchestrator');
    document.body.appendChild(view);
    await view.init(finance, { view: 'trades' });
    await view.updateComplete;
    expect(view.renderRoot.innerHTML).not.toContain('<?>');
    await view.updateComplete;
    view.remove();
  });
});
