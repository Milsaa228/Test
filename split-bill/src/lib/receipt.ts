import { askJson, imageBlock } from './claude';
import { newId } from './split';
import type { BillItem } from './types';

const SYSTEM = `Ты распознаёшь кассовые чеки и счета из ресторанов (в основном российские).
Верни каждую позицию отдельной строкой: название по-русски, как в чеке, но без артикулов и служебных кодов;
quantity — количество; price — итоговая сумма строки в рублях (уже умноженная на количество, с учётом скидки на строку).
Скидки на весь чек верни отдельной позицией с отрицательной ценой. Сервисный сбор и чаевые в позиции не включай —
верни их процент в serviceFeePercent (0, если нет). total — итог к оплате по чеку, или null, если его не видно.
Если на фото не чек, верни пустой список items.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['merchant', 'items', 'total', 'serviceFeePercent'],
  properties: {
    merchant: { type: ['string', 'null'] },
    total: { type: ['number', 'null'] },
    serviceFeePercent: { type: 'number' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'quantity', 'price'],
        properties: { name: { type: 'string' }, quantity: { type: 'number' }, price: { type: 'number' } },
      },
    },
  },
};

export interface RawReceipt {
  merchant: string | null;
  total: number | null;
  serviceFeePercent: number;
  items: { name: string; quantity: number; price: number }[];
}

export interface ParsedReceipt {
  merchant?: string;
  total?: number;
  tipPercent: number;
  items: BillItem[];
}

/** Приводит ответ модели к позициям счёта: отбрасывает пустые строки, округляет до копеек. */
export function normalizeReceipt(raw: RawReceipt): ParsedReceipt {
  const items = (raw.items ?? [])
    .filter((i) => i && i.name?.trim() && Number.isFinite(i.price) && i.price !== 0)
    .map((i) => ({
      id: newId(),
      name: i.name.trim(),
      quantity: Number.isFinite(i.quantity) && i.quantity > 0 ? i.quantity : 1,
      price: Math.round(i.price * 100) / 100,
      assignees: [],
    }));
  const tip = Number(raw.serviceFeePercent);
  return {
    merchant: raw.merchant?.trim() || undefined,
    total: typeof raw.total === 'number' && raw.total > 0 ? raw.total : undefined,
    tipPercent: Number.isFinite(tip) && tip > 0 && tip <= 50 ? tip : 0,
    items,
  };
}

export async function recognizeReceipt(apiKey: string, jpegBase64: string): Promise<ParsedReceipt> {
  const raw = await askJson<RawReceipt>(apiKey, {
    system: SYSTEM,
    schema: SCHEMA,
    content: [imageBlock(jpegBase64), { type: 'text', text: 'Распознай этот чек.' }],
  });
  return normalizeReceipt(raw);
}
