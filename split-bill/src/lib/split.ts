import type { Bill, BillItem, Share } from './types';

export function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Делит `total` копеек на части по весам так, чтобы сумма частей была ровно `total` (метод наибольшего остатка). */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (!sum || !weights.length) return weights.map(() => 0);
  // Скидки (отрицательные суммы) делим так же, как положительные, чтобы лишняя копейка доставалась тем же людям.
  if (total < 0) return allocate(-total, weights).map((p) => -p);
  const exact = weights.map((w) => (total * w) / sum);
  const parts = exact.map(Math.floor);
  let rest = total - parts.reduce((s, p) => s + p, 0);
  const order = exact.map((x, i) => [x - Math.floor(x), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; rest > 0; k = (k + 1) % order.length, rest--) parts[order[k][1]]++;
  return parts;
}

export const toKopecks = (rub: number) => Math.round(rub * 100);

export function itemsTotal(items: BillItem[]): number {
  return items.reduce((s, i) => s + toKopecks(i.price), 0);
}

/**
 * Считает, сколько должен каждый. Позиция делится поровну между отмеченными людьми
 * (или между всеми, если никто не отмечен). Чаевые раскладываются пропорционально доле.
 */
export function computeShares(bill: Bill): Share[] {
  const ids = bill.people.map((p) => p.id);
  const index = new Map(ids.map((id, i) => [id, i]));
  const base = ids.map(() => 0);
  const lines: { name: string; amount: number }[][] = ids.map(() => []);

  for (const item of bill.items) {
    const who = item.assignees.filter((id) => index.has(id));
    const targets = who.length ? who : ids;
    const parts = allocate(toKopecks(item.price), targets.map(() => 1));
    targets.forEach((id, k) => {
      const i = index.get(id)!;
      base[i] += parts[k];
      lines[i].push({ name: targets.length > 1 ? `${item.name} (1/${targets.length})` : item.name, amount: parts[k] });
    });
  }

  const subtotal = base.reduce((s, x) => s + x, 0);
  const tips = allocate(Math.round((subtotal * (bill.tipPercent || 0)) / 100), base);
  return bill.people.map((p, i) => ({
    personId: p.id,
    name: p.name,
    amount: base[i] + tips[i],
    items: tips[i] ? [...lines[i], { name: `Чаевые ${bill.tipPercent}%`, amount: tips[i] }] : lines[i],
  }));
}

export function formatRub(kopecks: number): string {
  const rub = Math.floor(Math.abs(kopecks) / 100);
  const kop = Math.abs(kopecks) % 100;
  const digits = rub.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${kopecks < 0 ? '−' : ''}${digits}${kop ? `,${String(kop).padStart(2, '0')}` : ''} ₽`;
}

/** Текст, который удобно отправить в общий чат. */
export function shareMessage(bill: Bill, shares: Share[], paymentDetails: string, bank: string): string {
  const payer = bill.people.find((p) => p.id === bill.payerId);
  const lines = shares
    .filter((s) => s.personId !== bill.payerId && s.amount > 0)
    .map((s) => `• ${s.name} — ${formatRub(s.amount)}`);
  const total = shares.reduce((s, x) => s + x.amount, 0);
  const parts = [`🧾 ${bill.title}: итого ${formatRub(total)}`, '', ...lines];
  if (payer) {
    const details = [paymentDetails.trim(), bank.trim()].filter(Boolean).join(', ');
    parts.push('', `Переводить: ${payer.name}${details ? `, ${details}` : ''}`);
  }
  return parts.join('\n');
}
