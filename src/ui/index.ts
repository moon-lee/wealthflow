import { SampleView } from './wealthflow-view';
if (typeof customElements !== 'undefined' && !customElements.get('wealthflow-view')) customElements.define('wealthflow-view', SampleView as unknown as CustomElementConstructor);
