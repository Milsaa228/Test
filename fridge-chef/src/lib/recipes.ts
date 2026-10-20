import { askJson } from './claude';
import { daysLeft, sortByExpiry, SOON_DAYS } from './expiry';
import { asUnit } from './fridge';
import { findProduct, formatAmount, newId } from './inventory';
import { DIFFICULTIES, UNITS, type Difficulty, type Product, type Recipe, type Settings } from './types';

const SYSTEM = `Ты домашний шеф. Тебе дают список продуктов, которые есть дома, со сроками годности,
и пожелания пользователя. Предложи от 3 до 5 разных блюд из того, что есть.
Главное — в первую очередь использовать продукты с пометкой «СКОРО ИСПОРТИТСЯ».
Строго соблюдай диету и исключения (аллергии): ни в одном рецепте не должно быть исключённых продуктов.
uses — продукты из списка пользователя, которые идут в блюдо: name точно как в списке, amount и unit — сколько
нужно на рецепт (amount = null для «по вкусу»). Соль, перец, растительное масло и воду считай имеющимися и в missing
не пиши. missing — чего не хватает (не больше 3 позиций, лучше 0–1). minutes — общее время готовки.
steps — понятные шаги по-русски, без нумерации в тексте. description — одна фраза, чем блюдо хорошо.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['recipes'],
  properties: {
    recipes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'description', 'minutes', 'difficulty', 'servings', 'uses', 'missing', 'steps'],
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          minutes: { type: 'integer' },
          difficulty: { type: 'string', enum: [...DIFFICULTIES] },
          servings: { type: 'integer' },
          uses: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'amount', 'unit'],
              properties: {
                name: { type: 'string' },
                amount: { type: ['number', 'null'] },
                unit: { type: 'string', enum: [...UNITS] },
              },
            },
          },
          missing: { type: 'array', items: { type: 'string' } },
          steps: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
};

export interface RawRecipes {
  recipes: {
    title: string;
    description: string;
    minutes: number;
    difficulty: string;
    servings: number;
    uses: { name: string; amount: number | null; unit: string }[];
    missing: string[];
    steps: string[];
  }[];
}

const MAX_RECIPES = 5;

/** Текст запроса: продукты по сроку годности с пометками и пожелания из настроек. */
export function buildRecipeRequest(products: Product[], settings: Settings, now: Date = new Date()): string {
  const lines = sortByExpiry(products).map((p) => {
    const left = daysLeft(p.expiresAt, now);
    const mark = left < 0 ? ' — срок истёк, использовать только если продукт в порядке' : left <= SOON_DAYS ? ' — СКОРО ИСПОРТИТСЯ' : '';
    return `- ${p.name}: ${formatAmount(p.amount, p.unit)}, осталось дней: ${left}${mark}`;
  });
  const wishes = [
    `Диета: ${settings.diet}.`,
    settings.exclusions.trim() ? `Исключить (аллергии, не ест): ${settings.exclusions.trim()}.` : 'Исключений нет.',
    settings.maxMinutes > 0 ? `Время готовки — не больше ${settings.maxMinutes} минут.` : 'Время готовки не ограничено.',
    `Порций: ${settings.servings}.`,
  ];
  return `Продукты дома:\n${lines.join('\n')}\n\nПожелания:\n${wishes.join('\n')}`;
}

/**
 * Приводит ответ модели к рецептам. Ингредиенты сверяем с инвентарём: имя берём как в списке
 * пользователя, а то, чего дома нет, переносим в «не хватает».
 */
export function normalizeRecipes(raw: RawRecipes, products: Product[], now: Date = new Date()): Recipe[] {
  return (raw?.recipes ?? [])
    .filter((r) => r && typeof r.title === 'string' && r.title.trim() && Array.isArray(r.steps) && r.steps.some((s) => s?.trim()))
    .slice(0, MAX_RECIPES)
    .map((r) => {
      const uses: Recipe['uses'] = [];
      const missing = new Set((r.missing ?? []).map((m) => m?.trim()).filter(Boolean));
      for (const u of r.uses ?? []) {
        if (!u?.name?.trim()) continue;
        const product = findProduct(products, u.name);
        if (!product) {
          missing.add(u.name.trim());
          continue;
        }
        if (uses.some((x) => x.name === product.name)) continue;
        const amount = typeof u.amount === 'number' && Number.isFinite(u.amount) && u.amount > 0 ? u.amount : null;
        uses.push({ name: product.name, amount, unit: asUnit(u.unit) });
      }
      const minutes = Number.isFinite(r.minutes) && r.minutes > 0 ? Math.round(r.minutes) : 30;
      const servings = Number.isFinite(r.servings) && r.servings > 0 ? Math.round(r.servings) : 2;
      return {
        id: newId(),
        title: r.title.trim(),
        description: r.description?.trim() ?? '',
        minutes,
        difficulty: (DIFFICULTIES as readonly string[]).includes(r.difficulty) ? (r.difficulty as Difficulty) : 'средне',
        servings,
        uses,
        missing: [...missing],
        steps: r.steps.map((s) => s?.trim()).filter(Boolean),
        createdAt: now.toISOString(),
      };
    });
}

export async function suggestRecipes(apiKey: string, products: Product[], settings: Settings): Promise<Recipe[]> {
  const raw = await askJson<RawRecipes>(apiKey, {
    system: SYSTEM,
    schema: SCHEMA,
    content: [{ type: 'text', text: buildRecipeRequest(products, settings) }],
  });
  return normalizeRecipes(raw, products);
}
