import type { FinanceApi } from 'finance';
import { ExtensionLogger } from 'finance-logger';
import { listBanks } from '../dao/banks.js';
import { listInterestEntries } from '../dao/interest-entries.js';
import { listStocks } from '../dao/stocks.js';
import { listDividends } from '../dao/dividends.js';
import { sumInterestByBank } from './bank-service.js';
import { sumDividends } from './stock-service.js';
import { getSuperTotals } from './super-service.js';

const logger = new ExtensionLogger('wealthflow');

export interface InterestSummaryByBank {
  bankId: number;
  bank_code: string;
  total: number;
}
export interface InterestSummary {
  financialYear: string;
  total: number;
  byBank: InterestSummaryByBank[];
}
export interface DividendTypeSplit {
  gross: number;
  franking: number;
}
export interface DividendSummaryByStock {
  stockId: number;
  stock_code: string;
  stock_full_name: string;
  gross: number;
  franking: number;
}
export interface DividendSummary {
  financialYear: string;
  gross: number;
  franking: number;
  byType: {
    non_trust: DividendTypeSplit;
    trust: DividendTypeSplit;
    foreign: DividendTypeSplit;
  };
  byStock: DividendSummaryByStock[];
}
export interface OverviewSummary {
  financialYear: string;
  dividends: DividendSummary;
  interest: InterestSummary;
  super: SuperSummary;
  combined: { gross: number; franking: number };
}
export interface SuperSummary {
  financialYear: string;
  balance: { amount: number; date: string } | null;
  contributions: { total: number; count: number };
}
export interface PublicWealthService {
  getInterestSummary(financialYear: string): Promise<InterestSummary | null>;
  getDividendSummary(financialYear: string): Promise<DividendSummary | null>;
  getOverviewSummary(financialYear: string): Promise<OverviewSummary | null>;
  getSuperSummary(financialYear: string): Promise<SuperSummary | null>;
}

export function createPublicWealthAdapter(
  finance: FinanceApi,
): PublicWealthService {
  return {
    async getInterestSummary(
      financialYear: string,
    ): Promise<InterestSummary | null> {
      try {
        const banks = await listBanks(finance, { status: 'all' });
        const entries = await listInterestEntries(finance, {
          financeYear: financialYear,
        });
        const { total, byBank } = sumInterestByBank(banks, entries);
        return { financialYear, total, byBank };
      } catch (err) {
        logger.error('getInterestSummary failed:', err);
        return null;
      }
    },
    async getDividendSummary(
      financialYear: string,
    ): Promise<DividendSummary | null> {
      try {
        const stocks = await listStocks(finance, { status: 'all' });
        const entries = await listDividends(finance, {
          financeYear: financialYear,
        });
        return sumDividends(financialYear, stocks, entries);
      } catch (err) {
        logger.error('getDividendSummary failed:', err);
        return null;
      }
    },
    async getOverviewSummary(
      financialYear: string,
    ): Promise<OverviewSummary | null> {
      try {
        const [dividends, interest, super_] = await Promise.all([
          this.getDividendSummary(financialYear),
          this.getInterestSummary(financialYear),
          this.getSuperSummary(financialYear),
        ]);
        if (!dividends || !interest || !super_) return null;
        const round2 = (n: number) => Math.round(n * 100) / 100;
        return {
          financialYear: financialYear,
          dividends,
          interest,
          super: super_,
          combined: {
            gross: round2(dividends.gross + interest.total),
            franking: round2(dividends.franking),
          },
        };
      } catch (err) {
        logger.error('getOverviewSummary failed:', err);
        return null;
      }
    },
    async getSuperSummary(financialYear: string): Promise<SuperSummary | null> {
      try {
        return await getSuperTotals(finance, financialYear);
      } catch (err) {
        logger.error('getSuperSummary failed:', err);
        return null;
      }
    },
  };
}
