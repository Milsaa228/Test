import { normalizeCategory } from './categories';
import type { Transaction } from './types';

/**
 * Импорт выписки, выгруженной из приложения/личного кабинета Т-Банка
 * («Операции» → «Выписка» → CSV). Формат: разделитель «;», значения в кавычках,
 * даты «dd.MM.yyyy HH:mm:ss», суммы «-1234,56».
 */

export function parseCsv(text: string, delimiter = ';'): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((v) => v.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((v) => v.trim() !== '')) rows.push(row);
  return rows;
}

export function parseRuNumber(value: string): number {
  return Number(value.replace(/\s| /g, '').replace(',', '.'));
}

export function parseRuDate(value: string): Date | null {
  const m = value.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const [, d, mo, y, h = '0', mi = '0', s = '0'] = m;
  return new Date(+y, +mo - 1, +d, +h, +mi, +s);
}

function findColumn(header: string[], ...names: string[]): number {
  const lower = header.map((h) => h.trim().toLowerCase());
  for (const name of names) {
    const idx = lower.indexOf(name.toLowerCase());
    if (idx >= 0) return idx;
  }
  return -1;
}

export interface CsvImportResult {
  transactions: Transaction[];
  skipped: number;
}

export function importTbankCsv(text: string): CsvImportResult {
  const delimiter = text.split('\n', 1)[0].includes(';') ? ';' : ',';
  const rows = parseCsv(text, delimiter);
  if (rows.length < 2) throw new Error('Файл пуст или не похож на выписку');

  const header = rows[0];
  const col = {
    date: findColumn(header, 'Дата операции'),
    status: findColumn(header, 'Статус'),
    amount: findColumn(header, 'Сумма платежа', 'Сумма операции'),
    currency: findColumn(header, 'Валюта платежа', 'Валюта операции'),
    category: findColumn(header, 'Категория'),
    mcc: findColumn(header, 'MCC'),
    description: findColumn(header, 'Описание'),
    card: findColumn(header, 'Номер карты'),
  };
  if (col.date < 0 || col.amount < 0) {
    throw new Error('Не найдены колонки «Дата операции» и «Сумма платежа». Это выписка Т-Банка в CSV?');
  }

  const transactions: Transaction[] = [];
  const seen = new Map<string, number>();
  let skipped = 0;

  for (const r of rows.slice(1)) {
    const status = col.status >= 0 ? r[col.status]?.trim().toUpperCase() : 'OK';
    const date = parseRuDate(r[col.date] ?? '');
    const signed = parseRuNumber(r[col.amount] ?? '');
    if (status === 'FAILED' || !date || !Number.isFinite(signed) || signed === 0) {
      skipped++;
      continue;
    }
    const mcc = col.mcc >= 0 ? r[col.mcc]?.trim() || undefined : undefined;
    const description = (col.description >= 0 ? r[col.description] : '')?.trim() || 'Без описания';
    const category = normalizeCategory(col.category >= 0 ? r[col.category] : undefined, mcc);

    // В выписке нет id операции — строим его из содержимого строки.
    // Одинаковые строки (две покупки кофе в одну секунду) различаем порядковым номером.
    const base = ['csv', r[col.date], r[col.amount], description, col.card >= 0 ? r[col.card] : ''].join('|');
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);

    transactions.push({
      id: n > 1 ? `${base}#${n}` : base,
      date: date.toISOString(),
      amount: Math.abs(signed),
      direction: signed < 0 ? 'expense' : 'income',
      currency: (col.currency >= 0 ? r[col.currency]?.trim() : '') || 'RUB',
      category: signed > 0 && category === 'Другое' ? 'Пополнения' : category,
      description,
      mcc,
      source: 'csv',
    });
  }
  return { transactions, skipped };
}
