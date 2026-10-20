import { askJson, type AiConfig } from './ai';
import { daysLeft, sortByExpiry, SOON_DAYS } from './expiry';
import { asUnit, pickList, toList, toNumber, toText } from './fridge';
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

const EXAMPLE = {
  recipes: [
    {
      title: 'Оладьи на кефире',
      description: 'Пышные оладьи за полчаса из кефира, который скоро испортится.',
      minutes: 25,
      difficulty: 'легко',
      servings: 2,
      uses: [
        { name: 'Кефир', amount: 500, unit: 'мл' },
        { name: 'Яйца', amount: 1, unit: 'шт' },
        { name: 'Сахар', amount: null, unit: 'г' },
      ],
      missing: ['Мука'],
      steps: ['Смешать кефир с яйцом и сахаром.', 'Всыпать муку до густоты сметаны.', 'Жарить на сковороде по 2 минуты с каждой стороны.'],
    },
  ],
};

const FORMAT_HINT = `\ndifficulty — одно из: ${DIFFICULTIES.join(', ')}. unit — одно из: ${UNITS.join(', ')}.`;

/** Ответ модели как есть: поля могут прийти строками, отсутствовать или быть другого типа. */
export interface RawRecipes {
  recipes?: unknown;
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

type Obj = Record<string, unknown>;
const asObj = (value: unknown): Obj => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Obj) : {});

/** Шаги: массив строк, массив объектов {text} или одна строка с переносами; нумерацию «1.» убираем. */
function toSteps(value: unknown): string[] {
  const list = typeof value === 'string' ? value.split(/\n+/) : toList(value);
  return list
    .map((s) => toText(typeof s === 'object' ? (asObj(s).text ?? asObj(s).step ?? asObj(s).description) : s))
    .map((s) => s.replace(/^(?:шаг\s*)?\d+\s*[.)]\s*/i, '').trim())
    .filter(Boolean);
}

/** «Не хватает»: массив строк или объектов {name}, либо одна строка через запятую. */
function toNames(value: unknown): string[] {
  const list = typeof value === 'string' ? value.split(/[,;\n]+/) : toList(value);
  return list.map((m) => toText(typeof m === 'object' ? asObj(m).name : m)).filter(Boolean);
}

/**
 * Приводит ответ модели к рецептам. Ингредиенты сверяем с инвентарём: имя берём как в списке
 * пользователя, а то, чего дома нет, переносим в «не хватает». Никогда не бросает исключений.
 */
export function normalizeRecipes(raw: unknown, products: Product[], now: Date = new Date()): Recipe[] {
  return pickList(raw, 'recipes')
    .map(asObj)
    .map((r) => ({ r, title: toText(r.title ?? r.name), steps: toSteps(r.steps ?? r.instructions) }))
    .filter(({ title, steps }) => title && steps.length)
    .slice(0, MAX_RECIPES)
    .map(({ r, title, steps }) => {
      const uses: Recipe['uses'] = [];
      const missing = new Set(toNames(r.missing));
      for (const item of toList(r.uses ?? r.ingredients)) {
        const u = typeof item === 'string' ? { name: item } : asObj(item);
        const name = toText(u.name);
        if (!name) continue;
        const product = findProduct(products, name);
        if (!product) {
          missing.add(name);
          continue;
        }
        if (uses.some((x) => x.name === product.name)) continue;
        const amount = toNumber(u.amount);
        uses.push({ name: product.name, amount: Number.isFinite(amount) && amount > 0 ? amount : null, unit: asUnit(u.unit) });
      }
      const minutes = toNumber(r.minutes ?? r.time);
      const servings = toNumber(r.servings);
      const difficulty = toText(r.difficulty).toLowerCase();
      return {
        id: newId(),
        title,
        description: toText(r.description),
        minutes: Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : 30,
        difficulty: (DIFFICULTIES as readonly string[]).includes(difficulty) ? (difficulty as Difficulty) : 'средне',
        servings: Number.isFinite(servings) && servings > 0 ? Math.round(servings) : 2,
        uses,
        missing: [...missing].slice(0, 10),
        steps,
        createdAt: now.toISOString(),
      };
    });
}

export async function suggestRecipes(ai: AiConfig, products: Product[], settings: Settings): Promise<Recipe[]> {
  const raw = await askJson<RawRecipes>(ai, {
    system: SYSTEM + FORMAT_HINT,
    example: EXAMPLE,
    content: [{ type: 'text', text: buildRecipeRequest(products, settings) }],
  });
  return normalizeRecipes(raw, products);
}
