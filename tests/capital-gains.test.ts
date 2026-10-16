// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { createMockFinance } from '../src/mock/finance-mock.js';
import { createStock } from '../src/dao/stocks.js';
import { createTrade } from '../src/dao/trades.js';
import { setOpeningBalance } from '../src/dao/capital-losses.js';
import { rebuildParcels } from '../src/services/parcel-service.js';
import { rebuildDisposals } from '../src/services/trade-service.js';
import { getCapitalGainsSummary } from '../src/services/capital-gains-service.js';
import { createPublicWealthAdapter } from '../src/services/public-wealth-adapter.js';
import '../src/ui/cgt-section.js';

async function sold() {
  const f: any = createMockFinance();
  const s: any = await createStock(f, {
    stock_code: 'VAS',
    stock_full_name: 'V',
    shares: 0,
  });
  await createTrade(f, {
    stock_id: s.id,
    date: '2024-03-15',
    side: 'buy',
    quantity: 20,
    price: 95.4,
    brokerage: 3,
  });
  await createTrade(f, {
    stock_id: s.id,
    date: '2025-11-20',
    side: 'buy',
    quantity: 15,
    price: 102.1,
    brokerage: 3,
  });
  await rebuildParcels(f, s.id);
  await createTrade(f, {
    stock_id: s.id,
    date: '2026-10-16',
    side: 'sell',
    quantity: 25,
    price: 112,
  });
  await rebuildDisposals(f, s.id);
  return { f, s };
}

describe('getCapitalGainsSummary', () => {
  it('reports the spec 6.2 figures for the FY of the sale', async () => {
    const { f } = await sold();
    const s = await getCapitalGainsSummary(f, '2026-2027');
    expect(s.financialYear).toBe('2026-2027');
    expect(s.grossGain).toBeCloseTo(377.5, 2);
    expect(s.lossesApplied).toBe(0);
    expect(s.adjustment).toBeCloseTo(-164.5, 2);
    expect(s.netGain).toBeCloseTo(213, 2);
    expect(s.sellCount).toBe(1);
    expect(s.byStock[0].stockCode).toBe('VAS');
    expect(s.byStock[0].disposals).toBe(2);
  });

  it('does not leak a sale into another financial year', async () => {
    const { f } = await sold();
    const other = await getCapitalGainsSummary(f, '2025-2026');
    expect(other.sellCount).toBe(0);
    expect(other.netGain).toBe(0);
    expect(other.byStock).toEqual([]);
  });

  it('draws down an opening carried-forward loss', async () => {
    const { f } = await sold();
    await setOpeningBalance(f, '2026-2027', 500);
    const s = await getCapitalGainsSummary(f, '2026-2027');
    expect(s.carriedForwardLoss).toBe(500);
    expect(s.hasOpeningBalance).toBe(true);
    expect(s.netGain).toBe(0);
    expect(s.carriedForwardOut).toBeCloseTo(287, 2);
  });
});

describe('carried-forward losses accumulate by recurrence (spec 5)', () => {
  it('sums every opening balance from the earliest FY forward', async () => {
    const { f } = await sold();
    await setOpeningBalance(f, '2024-2025', 200);
    await setOpeningBalance(f, '2025-2026', 150);
    // Nothing entered for 2026-2027, but the earlier balances carry into it.
    const s = await getCapitalGainsSummary(f, '2026-2027');
    expect(s.carriedForwardLoss).toBeCloseTo(350, 4);
    expect(s.hasOpeningBalance).toBe(true);
  });

  it('does not carry a LATER balance backwards', async () => {
    const { f } = await sold();
    await setOpeningBalance(f, '2028-2029', 900);
    const s = await getCapitalGainsSummary(f, '2026-2027');
    expect(s.carriedForwardLoss).toBe(0);
    expect(s.hasOpeningBalance).toBe(false);
  });

  it('draw down: the full 350 absorbs the gain and the residue carries out', async () => {
    const { f } = await sold();
    await setOpeningBalance(f, '2024-2025', 200);
    await setOpeningBalance(f, '2025-2026', 150);
    const s = await getCapitalGainsSummary(f, '2026-2027');
    expect(s.netGain).toBe(0);
    expect(s.carriedForwardOut).toBeCloseTo(350 - 213, 4);
  });

  it('reports the highest FY as the ceiling, not the sum of all years', async () => {
    const { f } = await sold();
    for (const [fy, amt] of [
      ['2022-2023', 100],
      ['2023-2024', 200],
      ['2024-2025', 300],
    ])
      await setOpeningBalance(f, fy, amt);
    const last = await getCapitalGainsSummary(f, '2024-2025');
    expect(last.carriedForwardLoss).toBeCloseTo(600, 4);
  });
});

describe('public wealth service exposes capital gains', () => {
  it('serves the summary to a cross-extension caller', async () => {
    const { f } = await sold();
    const svc = createPublicWealthAdapter(f);
    const s: any = await svc.getCapitalGainsSummary('2026-2027');
    expect(s.netGain).toBeCloseTo(213, 2);
  });

  it('returns null rather than throwing when the database is down', async () => {
    const broken: any = {
      ...createMockFinance(),
      db: {
        table: () => ({
          find: async () => {
            throw new Error('db down');
          },
          findOne: async () => null,
          count: async () => 0,
        }),
      },
    };
    const svc = createPublicWealthAdapter(broken);
    expect(await svc.getCapitalGainsSummary('2026-2027')).toBeNull();
  });
});

describe('cgt section', () => {
  it('is collapsed by default and shows the four cards when opened', async () => {
    const { f } = await sold();
    const el = document.createElement('cgt-section') as any;
    document.body.appendChild(el);
    el.fy = '2026-2027';
    await el.setFinance(f);
    await el.updateComplete;
    expect(el.collapsed).toBe(true);
    expect(el.summary.netGain).toBeCloseTo(213, 2);
    await el.toggle();
    await el.updateComplete;
    const text = el.renderRoot.textContent ?? '';
    expect(text).toMatch(/Gross capital gain/);
    expect(text).toMatch(/Losses applied/);
    expect(text).toMatch(/50% discount/);
    expect(text).toMatch(/Net capital gain/);
    // Await the render before detaching: reload() schedules an update, and Lit
    // walking a removed root throws an unhandled rejection.
    await el.updateComplete;
    el.remove();
  });

  it('saves the carried-forward balance from the bound property, not the DOM', async () => {
    const { f } = await sold();
    const el = document.createElement('cgt-section') as any;
    document.body.appendChild(el);
    el.fy = '2026-2027';
    await el.setFinance(f);
    await el.toggle();
    el.openingBalanceInput = '500';
    await el.saveOpeningBalance(new Event('submit'));
    expect(el.summary.carriedForwardLoss).toBe(500);
    expect(el.summary.hasOpeningBalance).toBe(true);
    // 500 absorbs the 213.00 gain entirely, so there is nothing to report.
    expect(el.summary.netGain).toBe(0);
    expect(el.summary.carriedForwardOut).toBeCloseTo(287, 2);
    expect(el.balanceNotice(el.summary)).toMatch(
      /Carrying .* out of this year/,
    );
    // Await the render before detaching: reload() schedules an update, and Lit
    // walking a removed root throws an unhandled rejection.
    await el.updateComplete;
    el.remove();
  });

  it('refuses a negative balance rather than silently zeroing it', async () => {
    const { f } = await sold();
    const el = document.createElement('cgt-section') as any;
    document.body.appendChild(el);
    el.fy = '2026-2027';
    await el.setFinance(f);
    await el.toggle();
    el.openingBalanceInput = '-100';
    await el.saveOpeningBalance(new Event('submit'));
    expect(el.error).toMatch(/positive amount/i);
    expect(el.summary.carriedForwardLoss).toBe(0);
    // Await the render before detaching: reload() schedules an update, and Lit
    // walking a removed root throws an unhandled rejection.
    await el.updateComplete;
    el.remove();
  });

  it('seeds the field from the stored balance on load', async () => {
    const { f } = await sold();
    await setOpeningBalance(f, '2026-2027', 750);
    const el = document.createElement('cgt-section') as any;
    document.body.appendChild(el);
    el.fy = '2026-2027';
    await el.setFinance(f);
    expect(el.openingBalanceInput).toBe('750');
    // Await the render before detaching: reload() schedules an update, and Lit
    // walking a removed root throws an unhandled rejection.
    await el.updateComplete;
    el.remove();
  });

  it('says so plainly when there is no opening balance recorded', async () => {
    const { f } = await sold();
    const el = document.createElement('cgt-section') as any;
    document.body.appendChild(el);
    el.fy = '2026-2027';
    await el.setFinance(f);
    await el.toggle();
    await el.updateComplete;
    expect(el.balanceNotice(el.summary)).toMatch(/not visible to the app/i);
    // Await the render before detaching: reload() schedules an update, and Lit
    // walking a removed root throws an unhandled rejection.
    await el.updateComplete;
    el.remove();
  });
});
