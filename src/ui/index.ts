import { WealthOrchestrator } from './wealthflow-orchestrator';
import { BankList } from './bank-list';
import { BankForm } from './bank-form';
import { InterestGrid } from './interest-grid';
import { InterestForm } from './interest-form';
import { StockList } from './stock-list';
import { DividendLog } from './dividend-log';
import { DividendForm } from './dividend-form';
import { OverviewView } from './overview-view';

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
  if (!customElements.get('stock-list'))
    customElements.define(
      'stock-list',
      StockList as unknown as CustomElementConstructor,
    );
  if (!customElements.get('dividend-log'))
    customElements.define(
      'dividend-log',
      DividendLog as unknown as CustomElementConstructor,
    );
  if (!customElements.get('dividend-form'))
    customElements.define(
      'dividend-form',
      DividendForm as unknown as CustomElementConstructor,
    );
  if (!customElements.get('overview-view'))
    customElements.define(
      'overview-view',
      OverviewView as unknown as CustomElementConstructor,
    );
}
