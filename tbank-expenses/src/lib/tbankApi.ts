import { normalizeCategory } from './categories';
import type { Transaction } from './types';

/**
 * Клиент Т-Бизнес Open API (https://developer.tbank.ru/docs/api).
 * Токен выпускается в личном кабинете Т-Бизнеса: «Интеграции» → «Т-API» → токен
 * с правом чтения выписки. Для личных (физлицо) счетов публичного API у Т-Банка нет —
 * для них используйте импорт CSV-выписки.
 */
const BASE_URL = 'https://business.tbank.ru/openapi';

export interface BankAccount {
  accountNumber: string;
  name: string;
  currency: string;
  balance?: number;
}

export class TbankApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

async function request<T>(token: string, path: string, query: Record<string, string | undefined> = {}): Promise<T> {
  const params = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v!)}`)
    .join('&');
  const url = `${BASE_URL}${path}${params ? `?${params}` : ''}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${token.trim()}`, Accept: 'application/json' },
    });
  } catch {
    throw new TbankApiError('Нет соединения с сервером Т-Банка');
  }
  if (res.status === 401 || res.status === 403) {
    throw new TbankApiError('Токен недействителен или у него нет прав на чтение выписки', res.status);
  }
  if (res.status === 429) throw new TbankApiError('Слишком много запросов, попробуйте через минуту', 429);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new TbankApiError(`Ошибка API ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`, res.status);
  }
  return (await res.json()) as T;
}

export async function fetchAccounts(token: string): Promise<BankAccount[]> {
  const data = await request<any>(token, '/api/v4/bank-accounts');
  const list: any[] = Array.isArray(data) ? data : data?.accounts ?? [];
  return list.map((a) => ({
    accountNumber: String(a.accountNumber),
    name: a.name ?? a.accountType ?? 'Счёт',
    currency: currencyCode(a.currency),
    balance: a.balance?.otb ?? a.balance?.balance ?? (typeof a.balance === 'number' ? a.balance : undefined),
  }));
}

/** Загружает все операции за период, проходя по страницам курсора. */
export async function fetchStatement(
  token: string,
  accountNumber: string,
  from: Date,
  to: Date = new Date(),
  onProgress?: (loaded: number) => void,
): Promise<Transaction[]> {
  const result: Transaction[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 200; page++) {
    const data = await request<any>(token, '/api/v1/statement', {
      accountNumber,
      from: from.toISOString(),
      to: to.toISOString(),
      limit: '1000',
      cursor,
    });
    for (const op of data?.operations ?? []) {
      const tx = mapOperation(op);
      if (tx) result.push(tx);
    }
    onProgress?.(result.length);
    cursor = data?.nextCursor || undefined;
    if (!cursor) break;
  }
  return result;
}

export function mapOperation(op: any): Transaction | null {
  const rawAmount = Number(op.accountAmount ?? op.operationAmount ?? op.amount);
  const date = op.operationDate ?? op.authorizationDate ?? op.trxnPostDate ?? op.date;
  if (!Number.isFinite(rawAmount) || rawAmount === 0 || !date) return null;

  const type = String(op.typeOfOperation ?? '').toLowerCase();
  const direction = type ? (type === 'debit' ? 'expense' : 'income') : rawAmount < 0 ? 'expense' : 'income';
  const mcc = op.mcc ?? op.merch?.mcc ?? op.merchant?.mcc;
  const description =
    op.merchant?.name ?? op.merch?.name ?? op.counterParty?.name ?? op.description ?? op.payPurpose ?? 'Без описания';

  return {
    id: `api|${op.operationId ?? op.id ?? `${date}|${rawAmount}|${description}`}`,
    date: new Date(date).toISOString(),
    amount: Math.abs(rawAmount),
    direction,
    currency: currencyCode(op.accountCurrencyDigitalCode ?? op.currency),
    category: normalizeCategory(op.category, mcc ? String(mcc) : undefined),
    description: String(description).trim(),
    mcc: mcc ? String(mcc) : undefined,
    source: 'api',
  };
}

function currencyCode(value: unknown): string {
  const map: Record<string, string> = { '643': 'RUB', '840': 'USD', '978': 'EUR', '156': 'CNY' };
  if (value === undefined || value === null) return 'RUB';
  const s = String(value);
  return map[s] ?? s.toUpperCase();
}
