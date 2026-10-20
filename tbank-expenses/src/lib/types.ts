export type Direction = 'expense' | 'income';

export type Source = 'api' | 'csv' | 'demo';

export interface Transaction {
  /** Стабильный идентификатор — используется для дедупликации при повторном импорте. */
  id: string;
  /** Дата операции в ISO-формате. */
  date: string;
  /** Абсолютная сумма в валюте счёта (всегда > 0). */
  amount: number;
  direction: Direction;
  currency: string;
  category: string;
  description: string;
  mcc?: string;
  source: Source;
}

export interface Settings {
  includeTransfers: boolean;
  accountNumber?: string;
  lastSyncAt?: string;
}

export interface CategoryStat {
  category: string;
  amount: number;
  count: number;
  share: number;
  color: string;
}

export interface MonthStats {
  month: string;
  expense: number;
  income: number;
  prevExpense: number;
  avgPerDay: number;
  byCategory: CategoryStat[];
  daily: number[];
  topMerchants: { name: string; amount: number; count: number }[];
}
