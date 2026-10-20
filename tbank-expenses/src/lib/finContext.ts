import { computeForecast, merchantKey, type Forecast } from './forecast';
import { computeMonthStats, filterCounted, formatMoney, monthKey, monthTitle, shiftMonth } from './stats';
import type { Transaction } from './types';

/**
 * Компактная текстовая сводка финансов для модели. Вся выписка в промпт не попадает:
 * только агрегаты за 6 месяцев, топ мест, регулярные платежи, прогноз и ограниченный
 * список крупных операций — так промпт остаётся небольшим и хорошо кэшируется.
 */

const MONTHS = 6;
const TOP_CATEGORIES = 8;
const TOP_MERCHANTS = 15;
export const MAX_LARGE_TX = 200;

function day(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function clean(text: string, max = 40): string {
  const s = text.replace(/[;\r\n]+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function forecastLines(f: Forecast): string[] {
  const lines = [
    `Потрачено с начала месяца: ${formatMoney(f.spentSoFar)}; поступило: ${formatMoney(f.incomeSoFar)}`,
    `Обычный расход в день (90 дней, без подписок и разовых крупных покупок): ${formatMoney(f.dailyBase)}`,
    `До конца месяца дней: ${f.daysLeft}; ожидаемые списания подписок: ${formatMoney(f.upcomingRecurringTotal)}`,
    `Прогноз расходов за месяц: ${formatMoney(f.projectedExpense)}`,
  ];
  if (f.salary) {
    lines.push(
      `Зарплата: ${clean(f.salary.payer)}, обычно ${formatMoney(f.salary.amount)}, интервал ~${f.salary.intervalDays} дн., ` +
        `последняя ${day(f.salary.lastDate)}, следующая ожидается ${day(f.salary.nextDate)}`,
    );
  } else {
    lines.push('Регулярный доход (зарплата) не обнаружен');
  }
  if (f.untilPayday) {
    lines.push(`До зарплаты дней: ${f.untilPayday.days}; ожидаемые траты до неё: ${formatMoney(f.untilPayday.expectedExpense)}`);
  }
  return lines;
}

export function buildFinContext(all: Transaction[], includeTransfers: boolean, now = new Date()): string {
  const current = monthKey(now);
  const months = Array.from({ length: MONTHS }, (_, i) => shiftMonth(current, i - MONTHS + 1));
  const first = months[0];
  const txs = filterCounted(all, includeTransfers).filter((t) => {
    const k = monthKey(t.date);
    return k >= first && k <= current && new Date(t.date) <= now;
  });
  const forecast = computeForecast(all, includeTransfers, now);

  const out: string[] = [
    `Сегодня: ${day(now.toISOString())}. Валюта: рубли. Суммы округлены.`,
    `Исходящие переводы ${includeTransfers ? 'учитываются' : 'НЕ учитываются'} как расходы.`,
    `Операций за период ${monthTitle(first)} — ${monthTitle(current)}: ${txs.length}.`,
    '',
    '## Итоги по месяцам (расходы по категориям)',
  ];

  for (const m of months) {
    const s = computeMonthStats(txs, m, true);
    if (!s.expense && !s.income) {
      out.push(`${monthTitle(m)}: нет данных`);
      continue;
    }
    const partial = m === current ? ' (месяц не закончился)' : '';
    out.push(`${monthTitle(m)}${partial}: расходы ${formatMoney(s.expense)}, доходы ${formatMoney(s.income)}`);
    const cats = s.byCategory.slice(0, TOP_CATEGORIES).map((c) => `${c.category} ${formatMoney(c.amount)}`);
    const rest = s.byCategory.slice(TOP_CATEGORIES).reduce((sum, c) => sum + c.amount, 0);
    if (rest) cats.push(`прочее ${formatMoney(rest)}`);
    if (cats.length) out.push(`  ${cats.join('; ')}`);
  }

  // Группируем по нормализованному имени («Зарплата за 09.2026» и «… 10.2026» — один источник), показываем последнее написание.
  type Agg = { name: string; date: string; amount: number; count: number; category: string };
  const incomes = new Map<string, Agg>();
  const merchants = new Map<string, Agg>();
  for (const t of txs) {
    const map = t.direction === 'income' ? incomes : merchants;
    const key = merchantKey(t.description) || t.description;
    const prev = map.get(key) ?? { name: t.description, date: t.date, amount: 0, count: 0, category: t.category };
    const newer = t.date > prev.date;
    map.set(key, {
      name: newer ? t.description : prev.name,
      date: newer ? t.date : prev.date,
      category: newer ? t.category : prev.category,
      amount: prev.amount + t.amount,
      count: prev.count + 1,
    });
  }

  out.push('', `## Топ мест по расходам за ${MONTHS} мес.`);
  for (const v of [...merchants.values()].sort((a, b) => b.amount - a.amount).slice(0, TOP_MERCHANTS)) {
    out.push(`${clean(v.name)} (${v.category}): ${formatMoney(v.amount)}, ${v.count} опер.`);
  }

  out.push('', `## Источники доходов за ${MONTHS} мес.`);
  const incomeList = [...incomes.values()].sort((a, b) => b.amount - a.amount).slice(0, 10);
  if (!incomeList.length) out.push('нет поступлений');
  for (const v of incomeList) out.push(`${clean(v.name)}: ${formatMoney(v.amount)}, ${v.count} поступл.`);

  out.push('', '## Регулярные платежи и подписки');
  if (!forecast.recurring.length) out.push('не обнаружены');
  for (const r of forecast.recurring) {
    out.push(`${clean(r.merchant)} (${r.category}): ~${formatMoney(r.amount)} в месяц, ${r.count} списаний, следующее ${day(r.nextDate)}`);
  }

  out.push('', `## Прогноз на ${monthTitle(current)}`, ...forecastLines(forecast));

  // Крупные операции: самые большие по сумме за период, не больше MAX_LARGE_TX, по убыванию даты.
  const large = [...txs].sort((a, b) => b.amount - a.amount).slice(0, MAX_LARGE_TX).sort((a, b) => b.date.localeCompare(a.date));
  out.push('', `## Крупнейшие операции (${large.length}, формат: дата;тип;категория;описание;сумма)`);
  for (const t of large) {
    out.push(`${day(t.date)};${t.direction === 'income' ? 'доход' : 'расход'};${clean(t.category, 30)};${clean(t.description)};${Math.round(t.amount)}`);
  }
  return out.join('\n');
}
