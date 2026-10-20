export interface Person {
  id: string;
  name: string;
}

export interface BillItem {
  id: string;
  name: string;
  /** Сумма строки чека (цена × количество), ₽. */
  price: number;
  quantity: number;
  /** Кто ел/пил. Пустой список — делим на всех. */
  assignees: string[];
}

export interface Bill {
  id: string;
  title: string;
  createdAt: string;
  people: Person[];
  items: BillItem[];
  /** Чаевые / сервисный сбор в процентах, распределяются пропорционально. */
  tipPercent: number;
  /** Итог по чеку, если его удалось распознать, — для сверки с суммой позиций. */
  receiptTotal?: number;
  /** Кто платил по чеку: ему остальные переводят свою долю. */
  payerId?: string;
}

export interface Settings {
  /** Как вас зовут — вы добавляетесь в каждый новый счёт. */
  myName: string;
  /** Телефон для СБП или номер карты — подставляется в сообщение друзьям. */
  paymentDetails: string;
  bank: string;
}

export interface Share {
  personId: string;
  name: string;
  /** Сумма к оплате в копейках. */
  amount: number;
  items: { name: string; amount: number }[];
}
