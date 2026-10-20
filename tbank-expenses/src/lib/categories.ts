const PALETTE = [
  '#F5A623', '#4A90E2', '#7ED321', '#D0021B', '#9013FE', '#50E3C2',
  '#F8507A', '#8B572A', '#417505', '#BD10E0', '#0F9D9A', '#B8860B',
];

const FIXED_COLORS: Record<string, string> = {
  'Супермаркеты': '#4A90E2',
  'Рестораны': '#F5A623',
  'Фастфуд': '#F8507A',
  'Такси': '#FFC107',
  'Транспорт': '#0F9D9A',
  'Топливо': '#8B572A',
  'Аптеки': '#7ED321',
  'Переводы': '#9B9B9B',
  'Связь': '#9013FE',
  'Одежда и обувь': '#BD10E0',
  'Развлечения': '#D0021B',
  'Маркетплейсы': '#6F42C1',
  'Коммунальные услуги': '#417505',
  'Другое': '#B0B0B0',
};

export function categoryColor(category: string): string {
  if (FIXED_COLORS[category]) return FIXED_COLORS[category];
  let hash = 0;
  for (let i = 0; i < category.length; i++) hash = (hash * 31 + category.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

/** Категория по MCC-коду — для операций, у которых банк не прислал категорию. */
const MCC_RANGES: [number, number, string][] = [
  [5411, 5411, 'Супермаркеты'],
  [5499, 5499, 'Супермаркеты'],
  [5812, 5813, 'Рестораны'],
  [5814, 5814, 'Фастфуд'],
  [4121, 4121, 'Такси'],
  [4111, 4112, 'Транспорт'],
  [4131, 4131, 'Транспорт'],
  [5541, 5542, 'Топливо'],
  [5912, 5912, 'Аптеки'],
  [4814, 4814, 'Связь'],
  [4900, 4900, 'Коммунальные услуги'],
  [5611, 5699, 'Одежда и обувь'],
  [7832, 7832, 'Развлечения'],
  [7991, 7999, 'Развлечения'],
  [5262, 5262, 'Маркетплейсы'],
  [5399, 5399, 'Маркетплейсы'],
  [6536, 6540, 'Переводы'],
];

export function categoryFromMcc(mcc?: string): string | undefined {
  const code = Number(mcc);
  if (!mcc || Number.isNaN(code)) return undefined;
  return MCC_RANGES.find(([from, to]) => code >= from && code <= to)?.[2];
}

/** Коды категорий Т-Бизнес API → человекочитаемые названия. */
const BUSINESS_CATEGORIES: Record<string, string> = {
  cardOperation: 'Операции по карте',
  cashOut: 'Снятие наличных',
  fee: 'Комиссии',
  penalty: 'Штрафы',
  contragentPeople: 'Переводы',
  contragentPeopleSelf: 'Переводы',
  selfTransferInner: 'Переводы',
  selfTransferOuter: 'Переводы',
  salary: 'Зарплата',
  tax: 'Налоги',
  budget: 'Налоги',
  contragentOutcome: 'Платежи контрагентам',
  contragentIncome: 'Поступления от контрагентов',
  acquiring: 'Эквайринг',
  incomePeople: 'Пополнения',
  creditPaymentOuter: 'Кредиты',
  depositPartReturn: 'Депозиты',
};

export function normalizeCategory(raw: string | undefined, mcc?: string): string {
  const value = raw?.trim();
  // Для карточных операций MCC точнее, чем общий код категории.
  if (!value || value === 'cardOperation') {
    return categoryFromMcc(mcc) ?? (value ? BUSINESS_CATEGORIES[value] : 'Другое');
  }
  return BUSINESS_CATEGORIES[value] ?? value;
}

export function isTransfer(category: string): boolean {
  return /перевод|пополнени/i.test(category);
}
