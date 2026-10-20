import type { Product } from './types';

/** Порог «скоро испортится», дней. */
export const SOON_DAYS = 2;

export type ExpiryStatus = 'expired' | 'soon' | 'ok';

const pad = (n: number) => String(n).padStart(2, '0');

/** Локальная дата в формате YYYY-MM-DD. */
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function keyToUtc(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const t = keyToUtc(value);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === value;
}

export function addDays(key: string, days: number): string {
  return new Date(keyToUtc(key) + days * 86400000).toISOString().slice(0, 10);
}

/** Сколько полных дней осталось до даты (0 — сегодня последний день, <0 — просрочено). */
export function daysLeft(expiresAt: string, now: Date = new Date()): number {
  return Math.round((keyToUtc(expiresAt) - keyToUtc(dateKey(now))) / 86400000);
}

export function expiryStatus(expiresAt: string, now: Date = new Date()): ExpiryStatus {
  const left = daysLeft(expiresAt, now);
  if (left < 0) return 'expired';
  return left <= SOON_DAYS ? 'soon' : 'ok';
}

export function plural(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b === 1) return forms[0];
  if (b >= 2 && b <= 4) return forms[1];
  return forms[2];
}

export function expiryLabel(expiresAt: string, now: Date = new Date()): string {
  const left = daysLeft(expiresAt, now);
  if (left < -1) return `просрочено ${-left} ${plural(-left, ['день', 'дня', 'дней'])} назад`;
  if (left === -1) return 'просрочено вчера';
  if (left === 0) return 'истекает сегодня';
  if (left === 1) return 'истекает завтра';
  return `ещё ${left} ${plural(left, ['день', 'дня', 'дней'])}`;
}

/** По сроку годности, при равенстве — по названию. */
export function sortByExpiry<T extends Pick<Product, 'expiresAt' | 'name'>>(products: T[]): T[] {
  return [...products].sort((a, b) => a.expiresAt.localeCompare(b.expiresAt) || a.name.localeCompare(b.name, 'ru'));
}

/**
 * Что сказать в утреннем уведомлении: ближайшее время `hour`:00 и продукты,
 * у которых в тот день останется ровно 1 день (истекают на следующий день).
 */
export function expiryDigest(products: Product[], now: Date = new Date(), hour = 9): { fireAt: Date; names: string[] } {
  const fireAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, 0, 0, 0);
  if (fireAt.getTime() <= now.getTime()) fireAt.setDate(fireAt.getDate() + 1);
  const names = sortByExpiry(products)
    .filter((p) => daysLeft(p.expiresAt, fireAt) === 1)
    .map((p) => p.name);
  return { fireAt, names };
}

/** YYYY-MM-DD → ДД.ММ.ГГГГ */
export function formatRuDate(key: string): string {
  const [y, m, d] = key.split('-');
  return `${d}.${m}.${y}`;
}

/** ДД.ММ.ГГГГ (или ДД.ММ — текущий год) → YYYY-MM-DD; null, если дата некорректна. */
export function parseRuDate(text: string, now: Date = new Date()): string | null {
  const m = text.trim().match(/^(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2}|\d{4}))?$/);
  if (!m) return null;
  const year = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : now.getFullYear();
  const key = `${year}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
  return isDateKey(key) ? key : null;
}
