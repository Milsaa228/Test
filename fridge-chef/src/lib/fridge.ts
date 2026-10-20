import { askJson, imagePart, type AiConfig } from './ai';
import { addDays, dateKey } from './expiry';
import { newId } from './inventory';
import { CATEGORIES, UNITS, type Category, type Product, type Unit } from './types';

const SYSTEM = `Ты помогаешь вести учёт продуктов дома. На фото — холодильник, полки или стол с продуктами.
Перечисли все продукты, которые можно разглядеть. name — короткое название по-русски в именительном падеже
(«молоко», «сыр гауда», «помидоры»), без брендов, если они не важны. Одинаковые продукты объединяй в одну строку.
amount и unit — примерное количество: штуки для поштучного, граммы/миллилитры для весового и жидкого,
«уп» для упаковок, когда объём неясен. Если на нескольких фото один и тот же продукт, считай его один раз.
category — одна из перечисленных категорий. shelfLifeDays — сколько дней продукт, скорее всего, ещё будет
пригоден, исходя из типичного срока хранения в холодильнике после покупки и того, как он выглядит
(открытая упаковка, увядшая зелень — меньше). Посуду, магниты и непищевое не включай.
Если на фото нет продуктов, верни пустой список.`;

const EXAMPLE = {
  products: [
    { name: 'молоко', amount: 930, unit: 'мл', category: 'Молочное', shelfLifeDays: 4 },
    { name: 'помидоры', amount: 3, unit: 'шт', category: 'Овощи', shelfLifeDays: 6 },
  ],
};

const UNITS_HINT = `\nunit — одно из: ${UNITS.join(', ')}. category — одна из: ${CATEGORIES.join(', ')}.`;

/** Ответ модели как есть: бесплатные модели присылают числа строками, пропускают поля или меняют формат. */
export interface RawFridge {
  products?: unknown;
}

export const MAX_PHOTOS = 3;
const MAX_SHELF_DAYS = 365;
const DEFAULT_SHELF_DAYS = 7;

/** Число из ответа модели: 5, «5», «1 250,5», «около 3 шт», «2-3». Не получилось — NaN. */
export function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return NaN;
  const match = value.replace(/(\d)[\s\u00a0]+(?=\d)/g, '$1').match(/-?\d+(?:[.,]\d+)?/);
  return match ? Number(match[0].replace(',', '.')) : NaN;
}

/** Строка из ответа модели (числа тоже принимаем), обрезанная; всё остальное — пустая строка. */
export function toText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

/** Список из ответа модели: массив как есть, одиночное значение — массив из одного элемента. */
export function toList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null || value === '' ? [] : [value];
}

/** Достаёт главный список из ответа: {products: [...]}, {items: [...]}, просто [...] или {data: {...}}. */
export function pickList(raw: unknown, ...keys: string[]): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== 'object') return [];
  const obj = raw as Record<string, unknown>;
  for (const key of [...keys, 'items', 'data', 'result']) {
    const value = obj[key];
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      const nested = pickList(value, ...keys);
      if (nested.length) return nested;
    }
  }
  return [];
}

const UNIT_ALIASES: Record<string, Unit> = {
  шт: 'шт', штук: 'шт', штука: 'шт', штуки: 'шт', pcs: 'шт', pc: 'шт', piece: 'шт', pieces: 'шт',
  г: 'г', гр: 'г', грамм: 'г', граммов: 'г', g: 'г', gr: 'г',
  кг: 'кг', kg: 'кг', килограмм: 'кг',
  мл: 'мл', ml: 'мл', миллилитров: 'мл',
  л: 'л', l: 'л', литр: 'л', литра: 'л', литров: 'л',
  уп: 'уп', упак: 'уп', упаковка: 'уп', упаковки: 'уп', pack: 'уп', package: 'уп',
};

export function asUnit(value: unknown): Unit {
  if (typeof value !== 'string') return 'шт';
  const key = value.trim().toLowerCase().replace(/\.$/, '');
  return UNIT_ALIASES[key] ?? 'шт';
}

export function asCategory(value: unknown): Category {
  if (typeof value !== 'string') return 'Другое';
  const key = value.trim().toLowerCase();
  return CATEGORIES.find((c) => c.toLowerCase() === key) ?? 'Другое';
}

/**
 * Приводит ответ модели к продуктам: убирает пустое, ограничивает срок 0–365 дней, считает дату.
 * Никогда не бросает исключений: строки вместо чисел, пропущенные поля и лишний мусор заменяются разумными значениями.
 */
export function normalizeFridge(raw: unknown, now: Date = new Date()): Product[] {
  const today = dateKey(now);
  return pickList(raw, 'products')
    .map((item): Record<string, unknown> => (typeof item === 'string' ? { name: item } : item && typeof item === 'object' ? (item as Record<string, unknown>) : {}))
    .map((p) => ({ p, name: toText(p.name ?? p.title) }))
    .filter(({ name }) => name)
    .map(({ p, name }) => {
      const rawDays = toNumber(p.shelfLifeDays ?? p.days);
      const days = Number.isFinite(rawDays) ? Math.round(rawDays) : DEFAULT_SHELF_DAYS;
      const amount = toNumber(p.amount ?? p.quantity);
      return {
        id: newId(),
        name: name.charAt(0).toUpperCase() + name.slice(1),
        amount: Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : 1,
        unit: asUnit(p.unit),
        category: asCategory(p.category),
        addedAt: today,
        expiresAt: addDays(today, Math.min(Math.max(days, 0), MAX_SHELF_DAYS)),
      };
    });
}

/** Распознаёт продукты на 1–3 фото (JPEG в base64). */
export async function recognizeFridge(ai: AiConfig, photos: string[]): Promise<Product[]> {
  const raw = await askJson<RawFridge>(ai, {
    system: SYSTEM + UNITS_HINT,
    example: EXAMPLE,
    content: [
      ...photos.slice(0, MAX_PHOTOS).map((b64) => imagePart(b64)),
      { type: 'text', text: photos.length > 1 ? 'Что за продукты на этих фото?' : 'Что за продукты на этом фото?' },
    ],
  });
  return normalizeFridge(raw);
}
