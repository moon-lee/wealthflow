import { LitElement, html } from 'lit';
import { sharedStyles } from '../styles/shared-styles.js';
import { wealthflowStyles } from '../styles/wealthflow-styles.js';

const Base =
  typeof HTMLElement !== 'undefined'
    ? LitElement
    : (class {} as unknown as typeof LitElement);

export type WealthTab = 'banks' | 'stocks' | 'overview';

/**
 * Topbar dialect: name the extension, then the section you are looking at.
 * Which section is reachable is the host's call — the app's own navigation
 * retargets this panel via `mount-update` — so the bar only reports it.
 */
export const TAB_LABELS: Record<WealthTab, string> = {
  banks: 'Banks',
  stocks: 'Stocks',
  overview: 'Overview',
};

export function viewForMount(mount: Record<string, unknown> = {}): WealthTab {
  const v = (mount.view ?? mount.viewId) as string | undefined;
  if (v === 'banks' || v === 'bank-list') return 'banks';
  if (v === 'stocks' || v === 'stock-list') return 'stocks';
  // Legacy Dividends tab now lives inside Overview.
  return 'overview';
}

export function currentFy(d = new Date()): string {
  const y = d.getFullYear();
  const start = d >= new Date(y, 6, 1) ? y : y - 1;
  return `${start}-${start + 1}`;
}

function fyOptions(center: string): string[] {
  const s = Number(center.slice(0, 4));
  return [`${s - 1}-${s}`, center, `${s + 1}-${s + 2}`];
}

export class WealthOrchestrator extends Base {
  static override styles =
    typeof HTMLElement !== 'undefined'
      ? ([sharedStyles, wealthflowStyles] as any)
      : [];
  finance: any = null;
  tab: WealthTab = 'overview';
  fy = currentFy();
  error = '';
  /** Set by the Add Interest / Add Dividend commands so the cursor lands ready to type. */
  focusTarget: string | null = null;

  async setFinance(f: any): Promise<void> {
    this.finance = f;
    await this.pushFinance();
  }

  async init(f: any, mount: Record<string, unknown> = {}): Promise<void> {
    this.finance = f;
    this.tab = viewForMount(mount);
    if (typeof mount.fy === 'string') this.fy = mount.fy as string;
    const focus = typeof mount.focus === 'string' ? mount.focus : null;
    await this.pushFinance();
    if (!focus) return;
    // One-shot: a later navigate() must not re-grab the cursor.
    this.focusTarget = null;
    const c = this.child() as any;
    if (focus === 'interest' && typeof c?.focusInterest === 'function')
      await c.focusInterest();
    else if (focus === 'dividend' && typeof c?.openDividendForm === 'function')
      await c.openDividendForm();
  }

  navigate(tab: WealthTab): void {
    this.tab = tab;
    (this as any).requestUpdate?.();
    void this.pushFinance();
  }

  private child(): any {
    const root = (this as any).renderRoot as ShadowRoot | undefined;
    return root?.querySelector('#child');
  }

  async pushFinance(): Promise<void> {
    (this as any).requestUpdate?.();
    try {
      await (this as any).updateComplete;
    } catch {
      /* non-Lit context */
    }
    const c = this.child() as any;
    if (c && this.finance) {
      c.finance = this.finance;
      try {
        c.fy = this.fy;
      } catch {
        /* child without fy */
      }
      if (typeof c.setFinance === 'function') {
        try {
          await c.setFinance(this.finance);
        } catch (e: any) {
          this.error = String(e?.message || e);
        }
      } else if (typeof c.reload === 'function') {
        try {
          await c.reload();
        } catch (e: any) {
          this.error = String(e?.message || e);
        }
      }
    }
  }

  override connectedCallback(): void {
    (super.connectedCallback as (() => void) | undefined)?.call(this);
    this.addEventListener('fy-changed', this._onFy as EventListener);
    this.addEventListener('wealthflow-navigate', this._onNav as EventListener);
    this.addEventListener('host-navigate', this._onHostNav as EventListener);
  }

  /**
   * Lit commits a `<select>`'s `.value` binding before its `<option>` children
   * exist, so the first render lands on the first option, and a user pick can
   * drift from `fy` afterwards. Re-syncing here runs before paint and makes the
   * control agree with state in both directions.
   */
  override updated(): void {
    const sel = (this as any).renderRoot?.querySelector(
      '#fy-select',
    ) as HTMLSelectElement | null;
    if (sel && sel.value !== this.fy) sel.value = this.fy;
  }

  override disconnectedCallback(): void {
    this.removeEventListener('fy-changed', this._onFy as EventListener);
    this.removeEventListener(
      'wealthflow-navigate',
      this._onNav as EventListener,
    );
    this.removeEventListener('host-navigate', this._onHostNav as EventListener);
    (super.disconnectedCallback as (() => void) | undefined)?.call(this);
  }

  private _onFy = (e: Event): void => {
    const fy = (e as CustomEvent).detail?.fy as string | undefined;
    if (fy) {
      this.fy = fy;
      void this.pushFinance();
    }
  };

  private _onNav = (e: Event): void => {
    const view = (e as CustomEvent).detail?.view as string | undefined;
    if (view) this.navigate(viewForMount({ view }));
  };

  private _onHostNav = (e: Event): void => {
    const d = (e as CustomEvent).detail as {
      view?: string;
      mountData?: Record<string, unknown>;
    };
    void this.init(this.finance, { view: d.view, ...(d.mountData ?? {}) });
  };

  override render(): unknown {
    if (typeof HTMLElement === 'undefined') return html``;
    return html`
      <div class="view-scroll">
        <div class="topbar">
          <span class="crumb-current"
            >Wealth Flow · ${TAB_LABELS[this.tab]}</span
          >
          <div class="spacer"></div>
          <label class="fy-label" for="fy-select">Finance year</label>
          <select
            id="fy-select"
            aria-label="Financial year"
            .value=${this.fy}
            @change=${(e: Event) => {
              const fy = (e.target as HTMLSelectElement).value;
              this.dispatchEvent(
                new CustomEvent('fy-changed', {
                  detail: { fy },
                  bubbles: true,
                  composed: true,
                }),
              );
            }}
          >
            ${fyOptions(this.fy).map(
              (f) => html`<option value=${f}>FY ${f}</option>`,
            )}
          </select>
        </div>
        <div class="view-container">
          <div class="view-container-inner">
            ${this.error ? html`<p class="field-error">Error: ${this.error}</p>` : ''}
            ${this.tab === 'banks' ? html`<bank-list id="child"></bank-list>` : ''}
            ${this.tab === 'stocks' ? html`<stock-list id="child"></stock-list>` : ''}
            ${this.tab === 'overview' ? html`<overview-view id="child"></overview-view>` : ''}
          </div>
        </div>
      </div>
    `;
  }
}

if (
  typeof customElements !== 'undefined' &&
  !customElements.get('wealthflow-orchestrator')
) {
  customElements.define(
    'wealthflow-orchestrator',
    WealthOrchestrator as unknown as CustomElementConstructor,
  );
}
