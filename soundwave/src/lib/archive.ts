import { colorsFor } from './library';
import { queryVariants } from './textq';
import type { Track } from './types';

// Internet Archive (archive.org): открытый каталог свободной музыки, без ключа API.
const BASE = 'https://archive.org';

export type NetItem = { id: string; title: string; creator: string; license?: string; tags?: string[] };

type Fetch = (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>;

const first = (v: unknown): string | undefined => (Array.isArray(v) ? v.map(String).join(', ') : v == null ? undefined : String(v));

/**
 * Общий фильтр: аудио в MP3 со свободной лицензией (Creative Commons или общественное достояние),
 * без аудиокниг, подкастов, радиопередач и прочих речевых записей.
 */
export const MUSIC_FILTER =
  'mediatype:(audio) AND format:(MP3 OR "VBR MP3") AND licenseurl:(*creativecommons.org* OR *publicdomain*)' +
  ' AND -collection:(librivoxaudio OR podcasts OR radioprograms OR oldtimeradio)' +
  ' AND -subject:(podcast OR audiobook OR lecture OR sermon OR speech OR interview OR quran OR talk)';

const cleanText = (text: string) => text.replace(/[()":\\]/g, ' ').trim().replace(/\s+/g, ' ');

/**
 * Поисковый запрос по тексту пользователя: исходный текст и его варианты
 * (транслит, исправленная раскладка, имя из словаря) через OR — «Металлика» найдёт Metallica.
 */
export function buildArchiveQuery(text: string): string {
  const variants = queryVariants(text).map(cleanText).filter(Boolean);
  const expr = variants.length > 1 ? variants.map((v) => `(${v})`).join(' OR ') : (variants[0] ?? cleanText(text));
  return `(${expr}) AND ${MUSIC_FILTER}`;
}

/** Исполнители по запросу (поле creator), с вариантами написания — для поиска на стартовом экране. */
export function creatorSearchQuery(text: string): string {
  const variants = queryVariants(text).map(cleanText).filter(Boolean);
  return `(${variants.map((v) => `creator:(${v})`).join(' OR ')}) AND ${MUSIC_FILTER}`;
}

/** Запрос по исполнителю (точная фраза в поле creator). */
export const artistQuery = (name: string) => `creator:("${cleanText(name)}") AND ${MUSIC_FILTER}`;
/** Запрос по готовому выражению жанра из genres.ts. */
export const genreQuery = (expr: string) => `(${expr}) AND ${MUSIC_FILTER}`;

export function archiveQueryUrl(query: string, opts: { rows?: number; page?: number } = {}): string {
  const params = [
    `q=${encodeURIComponent(query)}`,
    ...['identifier', 'title', 'creator', 'licenseurl', 'subject'].map((f) => `fl[]=${f}`),
    'sort[]=downloads+desc',
    `rows=${opts.rows ?? 30}`,
    `page=${opts.page ?? 1}`,
    'output=json',
  ];
  return `${BASE}/advancedsearch.php?${params.join('&')}`;
}

export const archiveSearchUrl = (text: string, rows = 30) => archiveQueryUrl(buildArchiveQuery(text), { rows });

/** Темы (subject) архива → короткий список тегов в нижнем регистре. */
export function parseTags(v: unknown): string[] {
  const raw = Array.isArray(v) ? v.map(String) : v == null ? [] : String(v).split(/[;,]/);
  return [...new Set(raw.map((x) => x.trim().toLowerCase()).filter((x) => x && x.length < 40))].slice(0, 12);
}

export function parseArchiveSearch(json: any): NetItem[] {
  const docs: any[] = json?.response?.docs ?? [];
  return docs
    .filter((d) => d?.identifier)
    .map((d) => ({
      id: String(d.identifier),
      title: first(d.title) ?? String(d.identifier),
      creator: first(d.creator) ?? 'Неизвестный исполнитель',
      license: first(d.licenseurl),
      tags: parseTags(d.subject),
    }));
}

export async function queryArchive(query: string, opts: { rows?: number; page?: number } = {}, fetchFn: Fetch = fetch as unknown as Fetch): Promise<NetItem[]> {
  const res = await fetchFn(archiveQueryUrl(query, opts));
  if (!res.ok) throw new Error(`archive.org ответил ${res.status}`);
  return parseArchiveSearch(await res.json());
}

export async function searchArchive(text: string, fetchFn: Fetch = fetch as unknown as Fetch): Promise<NetItem[]> {
  if (!cleanText(text)) return [];
  return queryArchive(buildArchiveQuery(text), { rows: 30 }, fetchFn);
}

/** «123.45» или «2:03» / «1:02:03» → секунды. */
export function parseLength(v: unknown): number | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(parseFloat(s));
  if (/^\d+(:\d{1,2}){1,2}$/.test(s)) return s.split(':').reduce((acc, p) => acc * 60 + parseInt(p, 10), 0);
  return undefined;
}

const MP3_FORMATS = new Set(['VBR MP3', 'MP3', '128Kbps MP3', '64Kbps MP3', '256Kbps MP3', '320Kbps MP3']);

/** Простой стабильный хэш строки для id трека. */
export function hashId(s: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = (Math.imul(h2, 31) + c) >>> 0;
  }
  return h1.toString(36) + h2.toString(36);
}

export const netTrackId = (url: string) => `net-${hashId(url)}`;

/**
 * Убирает номер дорожки из названия: «01 Oasis», «7. Moon», «02_ I - Allegro».
 * Число без разделителя и без ведущего нуля убираем, только если оно совпадает с номером дорожки —
 * чтобы не испортить «99 Luftballons» или «1,000,000».
 */
export function cleanTitle(title: string, track?: unknown): string {
  const m = title.match(/^\s*(\d{1,3})\s*([-._)]*)\s+(?=\S)/);
  if (!m) return title.trim();
  const isTrackNo = m[2] !== '' || m[1].startsWith('0') || (track != null && parseInt(String(track), 10) === parseInt(m[1], 10));
  return isTrackNo ? title.slice(m[0].length).trim() : title.trim();
}

/** Длинный список авторов («a ; b ; c») сокращаем до первого. */
export function shortCreator(creator: string): string {
  const parts = creator.split(/\s*;\s*/).filter(Boolean);
  const head = parts[0] ?? creator;
  return parts.length > 1 ? `${head} и др.` : head.length > 60 ? `${head.slice(0, 57)}…` : head;
}

/** Треки элемента архива: по одному MP3 на исходный файл, в порядке номеров треков. */
export function parseArchiveMetadata(id: string, json: any): Track[] {
  const meta = json?.metadata ?? {};
  const files: any[] = Array.isArray(json?.files) ? json.files : [];
  const album = first(meta.title) ?? id;
  const albumArtist = first(meta.creator) ?? 'Неизвестный исполнитель';
  const license = first(meta.licenseurl);
  const tags = parseTags(meta.subject);

  const mp3 = files.filter((f) => f?.name && (MP3_FORMATS.has(f.format) || /\.mp3$/i.test(f.name)));
  // Один и тот же трек часто лежит и оригиналом, и производной копией — оставляем одну, предпочитая VBR MP3.
  const byOriginal = new Map<string, any>();
  for (const f of mp3) {
    const key = String(f.original ?? f.name).replace(/\.[^./]+$/, '');
    const prev = byOriginal.get(key);
    if (!prev || (f.format === 'VBR MP3' && prev.format !== 'VBR MP3')) byOriginal.set(key, f);
  }
  const picked = [...byOriginal.values()].sort((a, b) => {
    const ta = parseInt(a.track, 10);
    const tb = parseInt(b.track, 10);
    if (!Number.isNaN(ta) && !Number.isNaN(tb) && ta !== tb) return ta - tb;
    return String(a.name).localeCompare(String(b.name), undefined, { numeric: true });
  });

  return picked.map((f) => {
    const url = `${BASE}/download/${encodeURIComponent(id)}/${String(f.name).split('/').map(encodeURIComponent).join('/')}`;
    const fileTitle = first(f.title) ?? String(f.name).split('/').pop()!.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
    return {
      id: netTrackId(url),
      title: cleanTitle(fileTitle, f.track),
      artist: shortCreator(first(f.creator) ?? first(f.artist) ?? albumArtist),
      album,
      uri: url,
      duration: parseLength(f.length),
      colors: colorsFor(id),
      online: true,
      license,
      tags,
      sourceUrl: `${BASE}/details/${encodeURIComponent(id)}`,
    };
  });
}

export async function archiveTracks(id: string, fetchFn: Fetch = fetch as unknown as Fetch): Promise<{ title: string; creator: string; license?: string; tracks: Track[] }> {
  const res = await fetchFn(`${BASE}/metadata/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`archive.org ответил ${res.status}`);
  const json = await res.json();
  return {
    title: first(json?.metadata?.title) ?? id,
    creator: first(json?.metadata?.creator) ?? 'Неизвестный исполнитель',
    license: first(json?.metadata?.licenseurl),
    tracks: parseArchiveMetadata(id, json),
  };
}

const AUDIO_EXT = ['mp3', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'wav', 'flac'];

/** Расширение файла для скачанного трека по URL (по умолчанию mp3). */
export function audioExtension(url: string): string {
  const path = url.split(/[?#]/)[0];
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return AUDIO_EXT.includes(ext) ? ext : 'mp3';
}

/** Человекочитаемое название лицензии по ссылке. */
export function licenseLabel(url?: string): string | undefined {
  if (!url) return undefined;
  if (/publicdomain\/(zero|mark)/.test(url)) return 'Общественное достояние';
  const m = url.match(/creativecommons\.org\/licenses\/([a-z-]+)\/([\d.]+)/);
  if (m) return `CC ${m[1].toUpperCase()} ${m[2]}`;
  return 'Лицензия указана на странице источника';
}
