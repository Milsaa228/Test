import type { Product, RecipeIngredient, Unit } from './types';

export function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Ключ для дедупликации: регистр, ё/е, пунктуация и лишние пробелы не важны. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}%]+/gu, ' ')
    .trim();
}

const BASE: Record<Unit, { base: string; k: number }> = {
  шт: { base: 'шт', k: 1 },
  уп: { base: 'уп', k: 1 },
  г: { base: 'г', k: 1 },
  кг: { base: 'г', k: 1000 },
  мл: { base: 'мл', k: 1 },
  л: { base: 'мл', k: 1000 },
};

const round = (n: number) => Math.round(n * 1000) / 1000;

/** Переводит количество в единицы `to`; null, если единицы несовместимы (шт и г). */
export function convert(amount: number, from: Unit, to: Unit): number | null {
  if (BASE[from].base !== BASE[to].base) return null;
  return round((amount * BASE[from].k) / BASE[to].k);
}

export function formatAmount(amount: number, unit: Unit): string {
  return `${String(round(amount)).replace('.', ',')} ${unit}`;
}

/**
 * Добавляет продукты в инвентарь без дублей (по нормализованному названию).
 * Одинаковые продукты внутри новой партии (с разных фото) складываются.
 * Если продукт уже есть, фото показывает его текущее состояние: обновляем количество,
 * а дату добавления и срок годности оставляем прежними — они точнее оценки по фото.
 */
export function mergeProducts(existing: Product[], incoming: Product[]): { merged: Product[]; added: number; updated: number } {
  const batch = new Map<string, Product>();
  for (const p of incoming) {
    const key = normalizeName(p.name);
    if (!key) continue;
    const prev = batch.get(key);
    const sum = prev ? convert(p.amount, p.unit, prev.unit) : null;
    if (!prev) batch.set(key, { ...p, name: p.name.trim() });
    else if (sum !== null) batch.set(key, { ...prev, amount: round(prev.amount + sum), expiresAt: minKey(prev.expiresAt, p.expiresAt) });
  }

  let updated = 0;
  const merged = existing.map((p) => {
    const key = normalizeName(p.name);
    const fresh = batch.get(key);
    if (!fresh) return p;
    batch.delete(key);
    updated++;
    return { ...p, amount: fresh.amount, unit: fresh.unit };
  });
  const added = [...batch.values()];
  return { merged: [...merged, ...added], added: added.length, updated };
}

function minKey(a: string, b: string) {
  return a < b ? a : b;
}

/** «Использовал одну штуку»: штучное уменьшаем на 1, остальное убираем целиком. */
export function consumeOne(products: Product[], id: string): Product[] {
  return products.flatMap((p) => {
    if (p.id !== id) return [p];
    if ((p.unit === 'шт' || p.unit === 'уп') && p.amount > 1) return [{ ...p, amount: round(p.amount - 1) }];
    return [];
  });
}

/**
 * Списывает продукты, ушедшие на рецепт. Совместимые единицы вычитаются,
 * несовместимые — продукт считается израсходованным, «по вкусу» (amount = null) не трогаем.
 */
export function consumeIngredients(products: Product[], uses: RecipeIngredient[]): { products: Product[]; removed: string[]; decreased: string[] } {
  const need = new Map(uses.map((u) => [normalizeName(u.name), u]));
  const removed: string[] = [];
  const decreased: string[] = [];
  const result = products.flatMap((p) => {
    const use = need.get(normalizeName(p.name));
    if (!use || use.amount === null) return [p];
    need.delete(normalizeName(p.name));
    const spent = convert(use.amount, use.unit, p.unit);
    if (spent !== null && p.amount - spent > 0.0001) {
      decreased.push(p.name);
      return [{ ...p, amount: round(p.amount - spent) }];
    }
    removed.push(p.name);
    return [];
  });
  return { products: result, removed, decreased };
}

/** Есть ли ингредиент рецепта в инвентаре. */
export function findProduct(products: Product[], name: string): Product | undefined {
  const key = normalizeName(name);
  return products.find((p) => normalizeName(p.name) === key);
}
