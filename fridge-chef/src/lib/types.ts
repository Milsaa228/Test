export const UNITS = ['шт', 'г', 'кг', 'мл', 'л', 'уп'] as const;
export type Unit = (typeof UNITS)[number];

export const CATEGORIES = [
  'Молочное',
  'Мясо и рыба',
  'Овощи',
  'Фрукты',
  'Зелень',
  'Яйца',
  'Хлеб и выпечка',
  'Крупы и макароны',
  'Соусы и консервы',
  'Готовая еда',
  'Сладкое',
  'Напитки',
  'Другое',
] as const;
export type Category = (typeof CATEGORIES)[number];

export interface Product {
  id: string;
  name: string;
  amount: number;
  unit: Unit;
  category: Category;
  /** Даты — локальные дни в формате YYYY-MM-DD. */
  addedAt: string;
  expiresAt: string;
}

export const DIFFICULTIES = ['легко', 'средне', 'сложно'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export interface RecipeIngredient {
  /** Название продукта как в «Моих продуктах». */
  name: string;
  /** Сколько уходит на рецепт; null — «по вкусу» / неизвестно. */
  amount: number | null;
  unit: Unit;
}

export interface Recipe {
  id: string;
  title: string;
  description: string;
  minutes: number;
  difficulty: Difficulty;
  servings: number;
  uses: RecipeIngredient[];
  /** Чего не хватает — докупить. */
  missing: string[];
  steps: string[];
  createdAt: string;
}

export const DIETS = ['обычная', 'вегетарианская', 'веганская', 'без глютена', 'низкоуглеводная', 'ПП'] as const;
export type Diet = (typeof DIETS)[number];

export interface Settings {
  diet: Diet;
  /** Аллергии и нелюбимые продукты, свободным текстом. */
  exclusions: string;
  /** Максимальное время готовки, мин; 0 — не важно. */
  maxMinutes: number;
  servings: number;
  /** Утреннее напоминание о продуктах, которые истекают завтра. */
  notifications: boolean;
}
