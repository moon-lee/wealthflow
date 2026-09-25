import { WealthOrchestrator } from './wealthflow-orchestrator';
import { BankList } from './bank-list';
import { BankForm } from './bank-form';
import { InterestGrid } from './interest-grid';
import { InterestForm } from './interest-form';

if (typeof customElements !== 'undefined') {
  if (!customElements.get('wealthflow-orchestrator'))
    customElements.define(
      'wealthflow-orchestrator',
      WealthOrchestrator as unknown as CustomElementConstructor,
    );
  if (!customElements.get('bank-list'))
    customElements.define(
      'bank-list',
      BankList as unknown as CustomElementConstructor,
    );
  if (!customElements.get('bank-form'))
    customElements.define(
      'bank-form',
      BankForm as unknown as CustomElementConstructor,
    );
  if (!customElements.get('interest-grid'))
    customElements.define(
      'interest-grid',
      InterestGrid as unknown as CustomElementConstructor,
    );
  if (!customElements.get('interest-form'))
    customElements.define(
      'interest-form',
      InterestForm as unknown as CustomElementConstructor,
    );
  // Stock + overview milestones (Tasks 14-15) self-register on import; missing files are fine at the Bank milestone.
  for (const mod of [
    './stock-list.js',
    './dividend-log.js',
    './dividend-form.js',
    './overview-view.js',
  ]) {
    void import(/* @vite-ignore */ mod).catch(() => {});
  }
}
