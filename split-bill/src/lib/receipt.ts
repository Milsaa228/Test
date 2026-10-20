import { askJson, imagePart, type AiConfig } from './ai';
import { newId } from './split';
import type { BillItem } from './types';

const SYSTEM = `Ты распознаёшь кассовые чеки и счета из ресторанов (в основном российские).
Верни каждую позицию отдельной строкой: название по-русски, как в чеке, но без артикулов и служебных кодов;
quantity — количество; price — итоговая сумма строки в рублях (уже умноженная на количество, с учётом скидки на строку).
Скидки на весь чек верни отдельной позицией с отрицательной ценой. Сервисный сбор и чаевые в позиции не включай —
верни их процент в serviceFeePercent (0, если нет). total — итог к оплате по чеку, или null, если его не видно.
Если на фото не чек, верни пустой список items.`;

const EXAMPLE = {
  merchant: 'Кафе «Ромашка»',
  total: 1850,
  serviceFeePercent: 10,
  items: [
    { name: 'Борщ', quantity: 2, price: 700 },
    { name: 'Скидка', quantity: 1, price: -100 },
  ],
};

/** Ответ модели как есть: бесплатные модели могут прислать числа строками («1 250,50») или пропустить поля. */
export interface RawReceipt {
  merchant?: unknown;
  total?: unknown;
  serviceFeePercent?: unknown;
  items?: unknown;
}

export interface ParsedReceipt {
  merchant?: string;
  total?: number;
  tipPercent: number;
  items: BillItem[];
}

export function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return NaN;
  return Number(value.replace(/[\s ₽]|руб\.?/g, '').replace(',', '.'));
}

/** Приводит ответ модели к позициям счёта: отбрасывает пустые строки, округляет до копеек. */
export function normalizeReceipt(raw: RawReceipt): ParsedReceipt {
  const list = Array.isArray(raw?.items) ? (raw.items as Record<string, unknown>[]) : [];
  const items = list
    .map((i) => ({ name: typeof i?.name === 'string' ? i.name.trim() : '', price: toNumber(i?.price), quantity: toNumber(i?.quantity) }))
    .filter((i) => i.name && Number.isFinite(i.price) && i.price !== 0)
    .map((i) => ({
      id: newId(),
      name: i.name,
      quantity: Number.isFinite(i.quantity) && i.quantity > 0 ? i.quantity : 1,
      price: Math.round(i.price * 100) / 100,
      assignees: [],
    }));
  const tip = toNumber(raw?.serviceFeePercent);
  const total = toNumber(raw?.total);
  return {
    merchant: typeof raw?.merchant === 'string' ? raw.merchant.trim() || undefined : undefined,
    total: Number.isFinite(total) && total > 0 ? total : undefined,
    tipPercent: Number.isFinite(tip) && tip > 0 && tip <= 50 ? tip : 0,
    items,
  };
}

export async function recognizeReceipt(ai: AiConfig, jpegBase64: string): Promise<ParsedReceipt> {
  const raw = await askJson<RawReceipt>(ai, {
    system: SYSTEM,
    example: EXAMPLE,
    content: [imagePart(jpegBase64), { type: 'text', text: 'Распознай этот чек.' }],
  });
  return normalizeReceipt(raw);
}
