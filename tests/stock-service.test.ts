import { describe, it, expect } from 'vitest';
import { sumDividends } from '../src/services/stock-service.js';

describe('sumDividends', () => {
  it('splits franking by type and aggregates byStock', () => {
    const stocks: any = [
      { id: 1, stock_code: 'VAS', stock_full_name: 'Vanguard' },
      { id: 2, stock_code: 'VHY', stock_full_name: 'High Yield' },
    ];
    const entries: any = [
      { stock_id: 1, type: 'non_trust', gross: 100, franking: 30 },
      { stock_id: 1, type: 'trust', gross: 50, franking: 5 },
      { stock_id: 2, type: 'non_trust', gross: 200, franking: 60 },
    ];
    const s = sumDividends('2025-2026', stocks, entries);
    expect(s.gross).toBe(350);
    expect(s.franking).toBe(95);
    expect(s.byType.non_trust).toEqual({ gross: 300, franking: 90 });
    expect(s.byType.trust).toEqual({ gross: 50, franking: 5 });
    expect(s.byStock.find((b) => b.stock_code === 'VAS')?.gross).toBe(150);
  });
  it('mirror-of-sheet: mixed VAS/VHY/FGX across types sums per type', () => {
    const stocks: any = [
      { id: 1, stock_code: 'VAS', stock_full_name: 'V' },
      { id: 2, stock_code: 'VHY', stock_full_name: 'H' },
      { id: 3, stock_code: 'FGX', stock_full_name: 'F' },
    ];
    const entries: any = [
      { stock_id: 1, type: 'trust', gross: 120.5, franking: 10 },
      { stock_id: 2, type: 'non_trust', gross: 300, franking: 90 },
      { stock_id: 3, type: 'non_trust', gross: 45.25, franking: 15 },
      { stock_id: 1, type: 'trust', gross: 130.75, franking: 12 },
    ];
    const s = sumDividends('2025-2026', stocks, entries);
    expect(s.byType.trust.gross).toBeCloseTo(251.25, 2);
    expect(s.byType.non_trust.franking).toBe(105);
  });
});
