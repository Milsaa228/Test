import { daysInMonth, filterCounted, monthKey } from './stats';
import type { Transaction } from './types';

/**
 * Прогноз «финансового двойника». Все эвристики простые и детерминированные:
 * одинаковые операции и одинаковая дата `now` всегда дают одинаковый результат.
 */

const DAY = 24 * 60 * 60 * 1000;
/** Окно, по которому считаем средний расход в день. */
const WINDOW_DAYS = 90;
/** Разовая крупная покупка: не меньше этой суммы… */
const OUTLIER_MIN = 15000;
/** …и во столько раз больше медианной операции окна. Такие траты не экстраполируем на будущее. */
const OUTLIER_FACTOR = 10;
/** Платежи одного получателя считаем «одинаковыми», если суммы отличаются не больше чем на 15%. */
const AMOUNT_TOLERANCE = 0.15;
/** Сколько раз платёж должен повториться, чтобы считаться регулярным. */
const MIN_OCCURRENCES = 3;
/** Допустимый интервал между соседними ежемесячными списаниями, дней. */
const MONTHLY_MIN = 25;
const MONTHLY_MAX = 35;
/** Магазин, а не подписка: прочих покупок у получателя за тот же период больше, чем 2× повторов. */
const OTHER_PURCHASES_FACTOR = 2;
/** Если ожидаемое списание не пришло за столько дней, считаем подписку отменённой. */
const GRACE_DAYS = 7;

export interface RecurringPayment {
  merchant: string;
  category: string;
  /** Типичная сумма — медиана списаний. */
  amount: number;
  count: number;
  lastDate: string;
  nextDate: string;
}

export interface SalaryInfo {
  payer: string;
  /** Типичная сумма одной выплаты — медиана. */
  amount: number;
  /** Средний интервал между выплатами, дней (≈30 — раз в месяц, ≈15 — аванс и зарплата). */
  intervalDays: number;
  lastDate: string;
  nextDate: string;
}

export interface Forecast {
  month: string;
  daysInMonth: number;
  /** Сколько дней месяца осталось после сегодняшнего. */
  daysLeft: number;
  spentSoFar: number;
  incomeSoFar: number;
  /** Обычный расход в день за последние ~90 дней без подписок и разовых крупных покупок. */
  dailyBase: number;
  /** Ожидаемые списания подписок до конца месяца. */
  upcomingRecurring: RecurringPayment[];
  upcomingRecurringTotal: number;
  projectedExpense: number;
  recurring: RecurringPayment[];
  salary?: SalaryInfo;
  untilPayday?: {
    days: number;
    expectedExpense: number;
    /** Изменение баланса до зарплаты (без её самой): отрицательное число — столько уйдёт. */
    balanceChange: number;
  };
}

/** Нормализованное имя получателя: регистр, цифры и знаки препинания не важны («Зарплата за 09.2026» = «Зарплата за 10.2026»). */
export function merchantKey(description: string): string {
  return description.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я]+/g, ' ').trim();
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Тот же день следующего месяца (31 января → 28/29 февраля). */
function addMonth(d: Date): Date {
  const last = new Date(d.getFullYear(), d.getMonth() + 2, 0).getDate();
  return new Date(d.getFullYear(), d.getMonth() + 1, Math.min(d.getDate(), last));
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY);
}

function groupBy(txs: Transaction[]): Map<string, Transaction[]> {
  const groups = new Map<string, Transaction[]>();
  for (const t of txs) {
    const key = merchantKey(t.description);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }
  return groups;
}

/** Делит операции на кластеры близких сумм (жадно, по возрастанию суммы). */
function amountClusters(txs: Transaction[], tolerance: number): Transaction[][] {
  const sorted = [...txs].sort((a, b) => a.amount - b.amount);
  const clusters: Transaction[][] = [];
  for (const t of sorted) {
    const current = clusters[clusters.length - 1];
    if (current && t.amount <= current[0].amount * (1 + tolerance) + 1) current.push(t);
    else clusters.push([t]);
  }
  return clusters.map((c) => c.sort((a, b) => a.date.localeCompare(b.date)));
}

function intervals(sortedByDate: Transaction[]): number[] {
  return sortedByDate.slice(1).map((t, i) => daysBetween(new Date(sortedByDate[i].date), new Date(t.date)));
}

/**
 * Регулярные платежи и подписки: один получатель, сумма ±15%, не меньше 3 списаний,
 * каждый интервал между соседними — 25–35 дней (≈ раз в месяц, с допуском на выходные).
 * Чтобы случайные совпадения в супермаркете не выглядели подпиской, отбрасываем получателей,
 * у которых за тот же период прочих покупок больше чем вдвое больше, чем повторов. Следующее списание —
 * тот же день следующего месяца после последнего. Если оно просрочено больше чем на неделю,
 * платёж считаем прекратившимся; если просрочено меньше — ждём его сегодня.
 */
export function detectRecurring(all: Transaction[], now = new Date()): RecurringPayment[] {
  const today = startOfDay(now);
  const result: RecurringPayment[] = [];
  for (const group of groupBy(all.filter((t) => t.direction === 'expense')).values()) {
    let best: Transaction[] | undefined;
    for (const cluster of amountClusters(group, AMOUNT_TOLERANCE)) {
      if (cluster.length < MIN_OCCURRENCES) continue;
      const gaps = intervals(cluster);
      if (!gaps.every((g) => g >= MONTHLY_MIN && g <= MONTHLY_MAX)) continue;
      const from = cluster[0].date;
      const to = cluster[cluster.length - 1].date;
      const others = group.filter((t) => t.date >= from && t.date <= to && !cluster.includes(t)).length;
      if (others > cluster.length * OTHER_PURCHASES_FACTOR) continue;
      if (!best || cluster.length > best.length) best = cluster;
    }
    if (!best) continue;
    const last = best[best.length - 1];
    let next = addMonth(startOfDay(new Date(last.date)));
    if (next < today) {
      if (daysBetween(next, today) > GRACE_DAYS) continue;
      next = today;
    }
    result.push({
      merchant: last.description,
      category: last.category,
      amount: Math.round(median(best.map((t) => t.amount))),
      count: best.length,
      lastDate: last.date,
      nextDate: next.toISOString(),
    });
  }
  return result.sort((a, b) => a.nextDate.localeCompare(b.nextDate) || b.amount - a.amount);
}

/**
 * Зарплата: среди поступлений ищем регулярные (один плательщик, ≥ 2 выплат, все интервалы 10–40 дней,
 * последняя — не старше 45 дней) и берём самую крупную по медианной сумме. Следующая выплата:
 * при интервале ≥ 25 дней — тот же день следующего месяца, иначе — через средний интервал
 * (аванс + зарплата). Просроченную дату переносим на сегодня.
 */
export function detectSalary(all: Transaction[], now = new Date()): SalaryInfo | undefined {
  const today = startOfDay(now);
  let best: SalaryInfo | undefined;
  for (const group of groupBy(all.filter((t) => t.direction === 'income')).values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => a.date.localeCompare(b.date));
    const gaps = intervals(sorted);
    if (!gaps.every((g) => g >= 10 && g <= 40)) continue;
    const last = sorted[sorted.length - 1];
    const lastDay = startOfDay(new Date(last.date));
    if (daysBetween(lastDay, today) > 45) continue;
    const interval = Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length);
    let next = interval >= 25 ? addMonth(lastDay) : new Date(lastDay.getTime() + interval * DAY);
    if (next < today) next = today;
    const amount = Math.round(median(sorted.map((t) => t.amount)));
    if (!best || amount > best.amount) {
      best = { payer: last.description, amount, intervalDays: interval, lastDate: last.date, nextDate: startOfDay(next).toISOString() };
    }
  }
  return best;
}

/**
 * Средний «обычный» расход в день за последние 90 дней (или меньше, если история короче):
 * без регулярных платежей (их прогнозируем отдельно по датам) и без разовых крупных покупок.
 */
export function dailyBaseline(expenses: Transaction[], recurring: RecurringPayment[], now = new Date()): number {
  const today = startOfDay(now);
  const from = new Date(today.getTime() - WINDOW_DAYS * DAY);
  const recurringKeys = new Map(recurring.map((r) => [merchantKey(r.merchant), r.amount]));
  const window = expenses.filter((t) => {
    const d = new Date(t.date);
    return d >= from && d < today;
  });
  if (!window.length) return 0;
  const typical = median(window.map((t) => t.amount));
  const threshold = Math.max(OUTLIER_MIN, typical * OUTLIER_FACTOR);
  let total = 0;
  for (const t of window) {
    const recAmount = recurringKeys.get(merchantKey(t.description));
    if (recAmount !== undefined && Math.abs(t.amount - recAmount) <= recAmount * AMOUNT_TOLERANCE + 1) continue;
    if (t.amount >= threshold) continue;
    total += t.amount;
  }
  const earliest = window.reduce((min, t) => (t.date < min ? t.date : min), window[0].date);
  const days = Math.max(1, Math.min(WINDOW_DAYS, daysBetween(new Date(earliest), today)));
  return total / days;
}

export function computeForecast(all: Transaction[], includeTransfers: boolean, now = new Date()): Forecast {
  const txs = filterCounted(all, includeTransfers);
  const expenses = txs.filter((t) => t.direction === 'expense');
  const month = monthKey(now);
  const dim = daysInMonth(month);
  const daysLeft = dim - now.getDate();
  const today = startOfDay(now);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  let spentSoFar = 0;
  let incomeSoFar = 0;
  for (const t of txs) {
    if (monthKey(t.date) !== month || new Date(t.date) > now) continue;
    if (t.direction === 'expense') spentSoFar += t.amount;
    else incomeSoFar += t.amount;
  }

  const recurring = detectRecurring(expenses, now);
  const dailyBase = dailyBaseline(expenses, recurring, now);
  const upcomingRecurring = recurring.filter((r) => new Date(r.nextDate) < monthEnd);
  const upcomingRecurringTotal = upcomingRecurring.reduce((s, r) => s + r.amount, 0);
  const projectedExpense = Math.round(spentSoFar + dailyBase * daysLeft + upcomingRecurringTotal);

  const salary = detectSalary(txs, now);
  let untilPayday: Forecast['untilPayday'];
  if (salary) {
    const payday = new Date(salary.nextDate);
    const days = daysBetween(today, payday);
    const recurringBefore = recurring.filter((r) => new Date(r.nextDate) < payday).reduce((s, r) => s + r.amount, 0);
    const expectedExpense = Math.round(dailyBase * days + recurringBefore);
    untilPayday = { days, expectedExpense, balanceChange: -expectedExpense };
  }

  return {
    month,
    daysInMonth: dim,
    daysLeft,
    spentSoFar,
    incomeSoFar,
    dailyBase: Math.round(dailyBase),
    upcomingRecurring,
    upcomingRecurringTotal,
    projectedExpense,
    recurring,
    salary,
    untilPayday,
  };
}
