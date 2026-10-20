import type { Transaction } from './types';

const TEMPLATES: { category: string; mcc: string; names: string[]; min: number; max: number; perMonth: number }[] = [
  { category: 'Супермаркеты', mcc: '5411', names: ['Пятёрочка', 'Перекрёсток', 'ВкусВилл', 'Лента'], min: 250, max: 4500, perMonth: 14 },
  { category: 'Рестораны', mcc: '5812', names: ['Шоколадница', 'Тануки', 'Кофемания'], min: 600, max: 3800, perMonth: 4 },
  { category: 'Фастфуд', mcc: '5814', names: ['Вкусно — и точка', 'Rostic’s', 'Додо Пицца'], min: 250, max: 1200, perMonth: 6 },
  { category: 'Такси', mcc: '4121', names: ['Яндекс Go', 'Ситимобил'], min: 220, max: 1400, perMonth: 7 },
  { category: 'Транспорт', mcc: '4111', names: ['Метро', 'Тройка'], min: 60, max: 600, perMonth: 8 },
  { category: 'Аптеки', mcc: '5912', names: ['Ригла', 'Аптека 36,6'], min: 200, max: 2500, perMonth: 2 },
  { category: 'Маркетплейсы', mcc: '5399', names: ['Ozon', 'Wildberries'], min: 400, max: 7000, perMonth: 4 },
  { category: 'Связь', mcc: '4814', names: ['МТС', 'Билайн'], min: 450, max: 650, perMonth: 1 },
  { category: 'Развлечения', mcc: '7832', names: ['Кинопоиск', 'Каро Фильм'], min: 299, max: 1600, perMonth: 2 },
  { category: 'Переводы', mcc: '', names: ['Перевод Ивану П.', 'Перевод Марии С.'], min: 500, max: 5000, perMonth: 3 },
];

/** Детерминированный генератор, чтобы демо выглядело одинаково при каждом запуске. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

export function generateDemo(months = 6): Transaction[] {
  const rand = rng(42);
  const now = new Date();
  const txs: Transaction[] = [];
  for (let m = 0; m < months; m++) {
    const first = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const lastDay = m === 0 ? now.getDate() : new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const pick = () => new Date(first.getFullYear(), first.getMonth(), 1 + Math.floor(rand() * lastDay), 8 + Math.floor(rand() * 14), Math.floor(rand() * 60));

    for (const t of TEMPLATES) {
      const count = Math.max(1, Math.round(t.perMonth * (m === 0 ? lastDay / 30 : 1) * (0.7 + rand() * 0.6)));
      for (let i = 0; i < count; i++) {
        txs.push({
          id: `demo|${m}|${t.category}|${i}`,
          date: pick().toISOString(),
          amount: Math.round(t.min + rand() * (t.max - t.min)),
          direction: 'expense',
          currency: 'RUB',
          category: t.category,
          description: t.names[Math.floor(rand() * t.names.length)],
          mcc: t.mcc || undefined,
          source: 'demo',
        });
      }
    }
    if (m > 0 || now.getDate() >= 5) {
      txs.push({
        id: `demo|${m}|salary`,
        date: new Date(first.getFullYear(), first.getMonth(), 5, 10).toISOString(),
        amount: 120000,
        direction: 'income',
        currency: 'RUB',
        category: 'Зарплата',
        description: 'ООО «Ромашка»',
        source: 'demo',
      });
    }
  }
  return txs.sort((a, b) => b.date.localeCompare(a.date));
}
