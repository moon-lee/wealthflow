// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { createMockFinance } from '../src/mock/finance-mock.js';
import { createStock } from '../src/dao/stocks.js';
import { listDividends } from '../src/dao/dividends.js';
import { listTrades } from '../src/dao/trades.js';
import { listParcels } from '../src/dao/parcels.js';
import { listAdjustments } from '../src/dao/cost-base-adjustments.js';
import '../src/ui/dividend-form.js';

// Mirrors the 4dp formatting the form uses for adjustment amounts (spec 9.1).
function formatAdjustment(n: number): string {
  return n.toFixed(4);
}

const flush = () => new Promise((r) => setTimeout(r, 0));

async function form() {
  const f: any = createMockFinance();
  const s: any = await createStock(f, {
    stock_code: 'VAS',
    stock_full_name: 'V',
    shares: 0,
  });
  const el: any = document.createElement('dividend-form');
  document.body.appendChild(el);
  await el.setFinance(f);
  el.editEntry(null);
  el.stockId = s.id;
  el.date = '2023-07-18';
  el.type = 'trust';
  el.gross = '89.18';
  el.requestUpdate?.();
  await el.updateComplete;
  return { f, s, el };
}

describe('dividend form — DRP fields (spec 7.5)', () => {
  it('is off by default, so an ordinary receipt writes no parcel', async () => {
    const { f, el } = await form();
    expect(el.drpEnabled).toBe(false);
    await el.onSubmit(new Event('submit'));
    await flush();
    expect((await listDividends(f)).length).toBe(1);
    expect(await listTrades(f)).toHaveLength(0);
    expect(await listParcels(f)).toHaveLength(0);
    await el.updateComplete;
    el.remove();
  });

  it('derives the per-unit price from money over units, not from gross', async () => {
    const { el } = await form();
    el.drpEnabled = true;
    el.amountReinvested = '45.34';
    el.unitsAcquired = '0.4';
    await el.updateComplete;
    expect(el.drpPrice).toBeCloseTo(113.35, 4);
  });

  it('saves the income AND the parcel from one submit', async () => {
    const { f, el } = await form();
    el.drpEnabled = true;
    el.amountReinvested = '45.34';
    el.unitsAcquired = '0.4';
    await el.onSubmit(new Event('submit'));
    await flush();
    expect((await listDividends(f)).length).toBe(1);
    const trades = await listTrades(f);
    expect(trades).toHaveLength(1);
    expect(trades[0].source).toBe('drp');
    expect(trades[0].price).toBeCloseTo(113.35, 4);
    expect((await listParcels(f)).length).toBe(1);
    await el.updateComplete;
    el.remove();
  });

  it('shows the derived price at per-unit precision, not cents', async () => {
    const { el } = await form();
    el.drpEnabled = true;
    el.amountReinvested = '45.34';
    el.unitsAcquired = '0.4';
    await el.updateComplete;
    // Cents would round the parcel's cost base; the price carries fractional
    // units, so it is shown at 6dp.
    expect(el.drpPriceLabel).toBe('113.350000');
    expect(el.drpPriceLabel).not.toBe('113.35');
    await el.updateComplete;
    el.remove();
  });

  it('records a zero-unit DRP as income only and says so', async () => {
    const { f, el } = await form();
    el.drpEnabled = true;
    el.amountReinvested = '12.44';
    el.unitsAcquired = '0';
    await el.onSubmit(new Event('submit'));
    await flush();
    expect((await listDividends(f)).length).toBe(1);
    expect(await listTrades(f)).toHaveLength(0);
    expect(el.notice).toMatch(/0 units/i);
    await el.updateComplete;
    el.remove();
  });

  it('blocks save when units are given without money', async () => {
    const { f, el } = await form();
    el.drpEnabled = true;
    el.amountReinvested = '0';
    el.unitsAcquired = '3';
    expect(el.canSave).toBe(false);
    await el.onSubmit(new Event('submit'));
    await flush();
    expect(await listDividends(f)).toHaveLength(0);
    await el.updateComplete;
    el.remove();
  });

  it('treats a blank DRP field as zero units, not as an error', async () => {
    const { f, el } = await form();
    el.drpEnabled = true;
    el.amountReinvested = '';
    el.unitsAcquired = '';
    expect(el.canSave).toBe(true);
    await el.onSubmit(new Event('submit'));
    await flush();
    expect((await listDividends(f)).length).toBe(1);
    await el.updateComplete;
    el.remove();
  });
});

describe('dividend form — AMIT field (spec 7.5)', () => {
  it('writes an adjustment row on the same submit', async () => {
    const { f, s, el } = await form();
    el.amitAdjustment = '-3.19';
    await el.onSubmit(new Event('submit'));
    await flush();
    const rows = await listAdjustments(f, s.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(-3.19);
    await el.updateComplete;
    el.remove();
  });

  it('writes no row when the field is left blank', async () => {
    const { f, s, el } = await form();
    expect(el.amitAdjustment).toBe('');
    await el.onSubmit(new Event('submit'));
    await flush();
    expect(await listAdjustments(f, s.id)).toHaveLength(0);
    await el.updateComplete;
    el.remove();
  });

  it('accepts a zero, which is a real answer on the tax statement', async () => {
    const { f, s, el } = await form();
    el.amitAdjustment = '0';
    await el.onSubmit(new Event('submit'));
    await flush();
    expect(await listAdjustments(f, s.id)).toHaveLength(1);
    await el.updateComplete;
    el.remove();
  });

  it('rejects a non-numeric adjustment rather than storing NaN', async () => {
    const { f, s, el } = await form();
    el.amitAdjustment = 'abc';
    expect(el.canSave).toBe(false);
    await el.onSubmit(new Event('submit'));
    await flush();
    expect(await listAdjustments(f, s.id)).toHaveLength(0);
    await el.updateComplete;
    el.remove();
  });

  it('shows the fund running total, at full precision', async () => {
    const { f, s, el } = await form();
    for (const amount of ['-3.19', '0.55'])
      await f.db.table('wealthflow_cost_base_adjustments').insert({
        stock_id: s.id,
        date: '2026-07-16',
        amount: Number(amount),
        reason: 'AMIT',
      });
    await el.reload();
    await el.updateComplete;
    expect(el.fundAdjustment).toBeCloseTo(-2.64, 4);
    // 4dp, not 2dp: spec 9.1 makes per-parcel shares sum back to this figure.
    expect(formatAdjustment(el.fundAdjustment)).toBe('-2.6400');
    await el.updateComplete;
    el.remove();
  });
});

describe('dividend form — delete takes the DRP with it', () => {
  it('removes the parcel too, so no orphan cost base survives', async () => {
    const { f, el } = await form();
    el.drpEnabled = true;
    el.amountReinvested = '45.34';
    el.unitsAcquired = '0.4';
    await el.onSubmit(new Event('submit'));
    await flush();
    expect(await listParcels(f)).toHaveLength(1);
    const row = (await listDividends(f))[0];
    el.editEntry(row as any);
    (globalThis as any).confirm = () => true;
    await el.onDelete();
    await flush();
    expect(await listDividends(f)).toHaveLength(0);
    expect(await listTrades(f)).toHaveLength(0);
    expect(await listParcels(f)).toHaveLength(0);
    await el.updateComplete;
    el.remove();
  });
});
