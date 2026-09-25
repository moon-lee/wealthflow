import type { FinanceApi } from 'finance';
import { ExtensionLogger } from 'finance-logger';
import { listBanks } from '../dao/banks.js';
import { listInterestEntries } from '../dao/interest-entries.js';
import { sumInterestByBank } from './bank-service.js';

const logger = new ExtensionLogger('wealthflow');

export interface InterestSummaryByBank {
  bankId: number;
  name: string;
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
  code: string;
  name: string;
  gross: number;
  franking: number;
}
export interface DividendSummary {
  financialYear: string;
  gross: number;
  franking: number;
  byType: { non_trust: DividendTypeSplit; trust: DividendTypeSplit; foreign: DividendTypeSplit };
  byStock: DividendSummaryByStock[];
}
export interface OverviewSummary {
  financialYear: string;
  dividends: DividendSummary;
  interest: InterestSummary;
  combined: { gross: number; franking: number };
}
export interface PublicWealthService {
  getInterestSummary(financialYear: string): Promise<InterestSummary | null>;
  getDividendSummary(financialYear: string): Promise<DividendSummary | null>;
  getOverviewSummary(financialYear: string): Promise<OverviewSummary | null>;
}

export function createPublicWealthAdapter(finance: FinanceApi): PublicWealthService {
  return {
    async getInterestSummary(financialYear: string): Promise<InterestSummary | null> {
      try {
        const banks = await listBanks(finance, { status: 'all' });
        const entries = await listInterestEntries(finance, { financeYear: financialYear });
        const { total, byBank } = sumInterestByBank(banks, entries);
        return { financialYear, total, byBank };
      } catch (err) {
        logger.error('getInterestSummary failed:', err);
        return null;
      }
    },
    async getDividendSummary(): Promise<DividendSummary | null> {
      return null;
    },
    async getOverviewSummary(): Promise<OverviewSummary | null> {
      return null;
    },
  };
}
