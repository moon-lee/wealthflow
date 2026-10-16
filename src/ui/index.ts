import { WealthOrchestrator } from './wealthflow-orchestrator';
import { BankList } from './bank-list';
import { BankForm } from './bank-form';
import { InterestGrid } from './interest-grid';
import { InterestForm } from './interest-form';
import { StockList } from './stock-list';
import { StockForm } from './stock-form';
import { TradeLog } from './trade-log';
import { TradeForm } from './trade-form';
import { TradesView } from './trades-view';
import { ParcelLedger } from './parcel-ledger';
import { DividendLog } from './dividend-log';
import { DividendForm } from './dividend-form';
import { SuperForm } from './super-form';
import { OverviewView } from './overview-view';
import { CgtSection } from './cgt-section';

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
  if (!customElements.get('stock-form'))
    customElements.define(
      'stock-form',
      StockForm as unknown as CustomElementConstructor,
    );
  if (!customElements.get('trade-log'))
    customElements.define(
      'trade-log',
      TradeLog as unknown as CustomElementConstructor,
    );
  if (!customElements.get('trade-form'))
    customElements.define(
      'trade-form',
      TradeForm as unknown as CustomElementConstructor,
    );
  if (!customElements.get('trades-view'))
    customElements.define(
      'trades-view',
      TradesView as unknown as CustomElementConstructor,
    );
  if (!customElements.get('parcel-ledger'))
    customElements.define(
      'parcel-ledger',
      ParcelLedger as unknown as CustomElementConstructor,
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
  if (!customElements.get('super-form'))
    customElements.define(
      'super-form',
      SuperForm as unknown as CustomElementConstructor,
    );
  if (!customElements.get('overview-view'))
    customElements.define(
      'overview-view',
      OverviewView as unknown as CustomElementConstructor,
    );
  if (!customElements.get('cgt-section'))
    customElements.define(
      'cgt-section',
      CgtSection as unknown as CustomElementConstructor,
    );
}
