import { isValidLatLng, RADII } from './geo';
import type { GeoNote, LatLng } from './types';

export const IMPORT_URL = 'geonotes://import';
export const MAX_TEXT = 500;

// Свой UTF-8 + base64url: в Hermes нет Buffer, а btoa не умеет кириллицу.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function utf8Encode(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const c = ch.codePointAt(0) as number;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

export function utf8Decode(bytes: number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i];
    let c: number;
    let n: number;
    if (b < 0x80) [c, n] = [b, 1];
    else if (b >= 0xf0) [c, n] = [b & 7, 4];
    else if (b >= 0xe0) [c, n] = [b & 15, 3];
    else if (b >= 0xc0) [c, n] = [b & 31, 2];
    else throw new Error('Повреждённые данные');
    for (let k = 1; k < n; k++) {
      const cont = bytes[i + k];
      if (cont === undefined || (cont & 0xc0) !== 0x80) throw new Error('Повреждённые данные');
      c = (c << 6) | (cont & 63);
    }
    out += String.fromCodePoint(c);
    i += n;
  }
  return out;
}

export function base64UrlEncode(bytes: number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b, c] = [bytes[i], bytes[i + 1], bytes[i + 2]];
    out += ALPHABET[a >> 2] + ALPHABET[((a & 3) << 4) | ((b ?? 0) >> 4)];
    if (b !== undefined) out += ALPHABET[((b & 15) << 2) | ((c ?? 0) >> 6)];
    if (c !== undefined) out += ALPHABET[c & 63];
  }
  return out;
}

export function base64UrlDecode(text: string): number[] {
  // Принимаем и обычный base64 (+/ и =), если ссылку переделал мессенджер.
  const clean = text.replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const out: number[] = [];
  let buf = 0;
  let bits = 0;
  for (const ch of clean) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) throw new Error('Ссылка повреждена: недопустимые символы');
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buf >> bits) & 0xff);
    }
  }
  return out;
}

// Компактный формат: короткие ключи, координаты до 6 знаков (~10 см).
interface Packed {
  i: string;
  t: string;
  e: string;
  a: number;
  o: number;
  r: number;
  p: 0 | 1;
  c?: string;
}

const round6 = (x: number) => Math.round(x * 1e6) / 1e6;

export function encodeNotes(notes: GeoNote[]): string {
  const packed: Packed[] = notes.map((n) => ({
    i: n.id,
    t: n.text,
    e: n.emoji,
    a: round6(n.latitude),
    o: round6(n.longitude),
    r: n.radius,
    p: n.repeat === 'once' ? 1 : 0,
    c: n.createdAt,
  }));
  return base64UrlEncode(utf8Encode(JSON.stringify({ v: 1, n: packed })));
}

export function buildImportLink(notes: GeoNote[]): string {
  return `${IMPORT_URL}?data=${encodeNotes(notes)}`;
}

/** Достаёт data= из ссылки любого вида или принимает «голый» код. */
export function extractData(input: string): string {
  const trimmed = input.trim();
  const m = trimmed.match(/[?&#]data=([A-Za-z0-9_\-+/%=]+)/);
  const raw = m ? m[1] : trimmed;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // оставляем как есть — ниже всё равно проверим символы
  }
  return decoded.replace(/\s+/g, '');
}

/** Разбирает ссылку или код. Бросает понятную ошибку на русском. */
export function decodeNotes(input: string): GeoNote[] {
  const data = extractData(input);
  if (!data) throw new Error('Ссылка пустая');
  const bytes = base64UrlDecode(data);
  let parsed: unknown;
  try {
    parsed = JSON.parse(utf8Decode(bytes));
  } catch {
    throw new Error('Не удалось прочитать ссылку: возможно, она обрезана при копировании');
  }
  const list = (parsed as { v?: number; n?: unknown })?.n;
  if ((parsed as { v?: number })?.v !== 1 || !Array.isArray(list)) throw new Error('Неизвестный формат ссылки');
  const notes: GeoNote[] = [];
  for (const raw of list as Partial<Packed>[]) {
    const point = { latitude: raw?.a, longitude: raw?.o };
    if (typeof raw?.i !== 'string' || !raw.i || typeof raw.t !== 'string' || !isValidLatLng(point)) continue;
    notes.push({
      id: raw.i.slice(0, 64),
      text: raw.t.slice(0, MAX_TEXT),
      emoji: typeof raw.e === 'string' && raw.e ? raw.e.slice(0, 8) : '📍',
      latitude: point.latitude,
      longitude: point.longitude,
      radius: typeof raw.r === 'number' && raw.r > 0 ? Math.min(raw.r, 5000) : RADII[1],
      repeat: raw.p === 1 ? 'once' : 'always',
      createdAt: typeof raw.c === 'string' ? raw.c : new Date(0).toISOString(),
    });
  }
  if (!notes.length) throw new Error('В ссылке нет заметок');
  return notes;
}

/** Слияние без дублей: заметки с уже существующим id пропускаются (локальная версия главнее). */
export function mergeNotes(existing: GeoNote[], incoming: GeoNote[]): { merged: GeoNote[]; added: GeoNote[]; skipped: number } {
  const ids = new Set(existing.map((n) => n.id));
  const added: GeoNote[] = [];
  for (const n of incoming) {
    if (ids.has(n.id)) continue;
    ids.add(n.id);
    added.push(n);
  }
  return { merged: [...existing, ...added], added, skipped: incoming.length - added.length };
}

export function yandexMapsUrl(p: LatLng): string {
  return `https://yandex.ru/maps/?pt=${round6(p.longitude)},${round6(p.latitude)}&z=17&l=map`;
}

export function geoUri(p: LatLng, label?: string): string {
  const ll = `${round6(p.latitude)},${round6(p.longitude)}`;
  return `geo:${ll}?q=${ll}${label ? `(${encodeURIComponent(label)})` : ''}`;
}

export function appleMapsUrl(p: LatLng, label?: string): string {
  const ll = `${round6(p.latitude)},${round6(p.longitude)}`;
  return `https://maps.apple.com/?ll=${ll}&q=${encodeURIComponent(label || ll)}`;
}

/** Текст для «Поделиться»: читается и без приложения. */
export function shareText(notes: GeoNote[]): string {
  const lines =
    notes.length === 1
      ? [`${notes[0].emoji} ${notes[0].text}`, yandexMapsUrl(notes[0])]
      : [`Гео-заметки (${notes.length}):`, ...notes.map((n) => `${n.emoji} ${n.text} — ${yandexMapsUrl(n)}`)];
  return [...lines, '', 'Открыть в «Гео-заметках»:', buildImportLink(notes)].join('\n');
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
