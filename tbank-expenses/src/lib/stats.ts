import { categoryColor, isTransfer } from './categories';
import type { MonthStats, Transaction } from './types';

/** Ключ месяца в формате YYYY-MM по локальному времени. */
export function monthKey(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

export function monthTitle(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export function formatMoney(value: number, currency = 'RUB'): string {
  const sign = currency === 'RUB' ? '₽' : currency;
  const rounded = Math.round(value);
  const digits = Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${rounded < 0 ? '−' : ''}${digits} ${sign}`;
}

/** Убирает исходящие переводы из статистики. Поступления (в т.ч. зарплату-«пополнение») не трогаем. */
export function filterCounted(txs: Transaction[], includeTransfers: boolean): Transaction[] {
  return includeTransfers ? txs : txs.filter((t) => t.direction === 'income' || !isTransfer(t.category));
}

export function computeMonthStats(all: Transaction[], month: string, includeTransfers: boolean): MonthStats {
  const txs = filterCounted(all, includeTransfers);
  const prevMonth = shiftMonth(month, -1);
  const days = daysInMonth(month);
  const daily = new Array<number>(days).fill(0);
  const cats = new Map<string, { amount: number; count: number }>();
  const merchants = new Map<string, { amount: number; count: number }>();
  let expense = 0;
  let income = 0;
  let prevExpense = 0;

  for (const t of txs) {
    const key = monthKey(t.date);
    if (key === prevMonth && t.direction === 'expense') prevExpense += t.amount;
    if (key !== month) continue;
    if (t.direction === 'income') {
      income += t.amount;
      continue;
    }
    expense += t.amount;
    daily[new Date(t.date).getDate() - 1] += t.amount;
    const c = cats.get(t.category) ?? { amount: 0, count: 0 };
    cats.set(t.category, { amount: c.amount + t.amount, count: c.count + 1 });
    const m = merchants.get(t.description) ?? { amount: 0, count: 0 };
    merchants.set(t.description, { amount: m.amount + t.amount, count: m.count + 1 });
  }

  // Для текущего месяца среднее считаем по прошедшим дням, а не по всему месяцу.
  const now = new Date();
  const elapsed = month === monthKey(now) ? now.getDate() : days;

  return {
    month,
    expense,
    income,
    prevExpense,
    avgPerDay: elapsed ? expense / elapsed : 0,
    daily,
    byCategory: [...cats.entries()]
      .map(([category, v]) => ({
        category,
        amount: v.amount,
        count: v.count,
        share: expense ? v.amount / expense : 0,
        color: categoryColor(category),
      }))
      .sort((a, b) => b.amount - a.amount),
    topMerchants: [...merchants.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5),
  };
}

/** Расходы по месяцам за последние `count` месяцев, заканчивая `month`. */
export function monthlyTrend(all: Transaction[], month: string, count: number, includeTransfers: boolean) {
  const keys = Array.from({ length: count }, (_, i) => shiftMonth(month, i - count + 1));
  const totals = new Map(keys.map((k) => [k, 0]));
  for (const t of filterCounted(all, includeTransfers)) {
    if (t.direction !== 'expense') continue;
    const k = monthKey(t.date);
    if (totals.has(k)) totals.set(k, totals.get(k)! + t.amount);
  }
  return keys.map((k) => ({ month: k, amount: totals.get(k)! }));
}

export function mergeTransactions(existing: Transaction[], incoming: Transaction[]): { merged: Transaction[]; added: number } {
  const byId = new Map(existing.map((t) => [t.id, t]));
  let added = 0;
  for (const t of incoming) {
    if (!byId.has(t.id)) added++;
    byId.set(t.id, t);
  }
  const merged = [...byId.values()].sort((a, b) => b.date.localeCompare(a.date));
  return { merged, added };
}
