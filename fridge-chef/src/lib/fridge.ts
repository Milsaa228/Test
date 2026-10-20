import { askJson, imageBlock } from './claude';
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

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['products'],
  properties: {
    products: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'amount', 'unit', 'category', 'shelfLifeDays'],
        properties: {
          name: { type: 'string' },
          amount: { type: 'number' },
          unit: { type: 'string', enum: [...UNITS] },
          category: { type: 'string', enum: [...CATEGORIES] },
          shelfLifeDays: { type: 'integer' },
        },
      },
    },
  },
};

export interface RawFridge {
  products: { name: string; amount: number; unit: string; category: string; shelfLifeDays: number }[];
}

export const MAX_PHOTOS = 3;
const MAX_SHELF_DAYS = 365;

export function asUnit(value: unknown): Unit {
  return (UNITS as readonly string[]).includes(value as string) ? (value as Unit) : 'шт';
}

export function asCategory(value: unknown): Category {
  return (CATEGORIES as readonly string[]).includes(value as string) ? (value as Category) : 'Другое';
}

/** Приводит ответ модели к продуктам: убирает пустое, ограничивает срок 0–365 дней, считает дату. */
export function normalizeFridge(raw: RawFridge, now: Date = new Date()): Product[] {
  const today = dateKey(now);
  return (raw?.products ?? [])
    .filter((p) => p && typeof p.name === 'string' && p.name.trim())
    .map((p) => {
      const days = Number.isFinite(p.shelfLifeDays) ? Math.round(p.shelfLifeDays) : 7;
      const name = p.name.trim();
      return {
        id: newId(),
        name: name.charAt(0).toUpperCase() + name.slice(1),
        amount: Number.isFinite(p.amount) && p.amount > 0 ? Math.round(p.amount * 100) / 100 : 1,
        unit: asUnit(p.unit),
        category: asCategory(p.category),
        addedAt: today,
        expiresAt: addDays(today, Math.min(Math.max(days, 0), MAX_SHELF_DAYS)),
      };
    });
}

/** Распознаёт продукты на 1–3 фото (JPEG в base64). */
export async function recognizeFridge(apiKey: string, photos: string[]): Promise<Product[]> {
  const raw = await askJson<RawFridge>(apiKey, {
    system: SYSTEM,
    schema: SCHEMA,
    content: [
      ...photos.slice(0, MAX_PHOTOS).map((b64) => imageBlock(b64)),
      { type: 'text', text: photos.length > 1 ? 'Что за продукты на этих фото?' : 'Что за продукты на этом фото?' },
    ],
  });
  return normalizeFridge(raw);
}
