import { colorsFor } from './library';
import type { Track } from './types';

// Internet Archive (archive.org): открытый каталог свободной музыки, без ключа API.
const BASE = 'https://archive.org';

export type NetItem = { id: string; title: string; creator: string; license?: string };

type Fetch = (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>;

const first = (v: unknown): string | undefined => (Array.isArray(v) ? v.map(String).join(', ') : v == null ? undefined : String(v));

/** Поисковый запрос: только аудио с MP3, без аудиокниг и радиопередач. */
export function buildArchiveQuery(text: string): string {
  const q = text.replace(/[()":\\]/g, ' ').trim().replace(/\s+/g, ' ');
  return `(${q}) AND mediatype:(audio) AND format:(MP3 OR "VBR MP3") AND -collection:(librivoxaudio OR podcasts OR radioprograms)`;
}

export function archiveSearchUrl(text: string, rows = 30): string {
  const params = [
    `q=${encodeURIComponent(buildArchiveQuery(text))}`,
    ...['identifier', 'title', 'creator', 'licenseurl'].map((f) => `fl[]=${f}`),
    'sort[]=downloads+desc',
    `rows=${rows}`,
    'output=json',
  ];
  return `${BASE}/advancedsearch.php?${params.join('&')}`;
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
    }));
}

export async function searchArchive(text: string, fetchFn: Fetch = fetch as unknown as Fetch): Promise<NetItem[]> {
  if (!text.trim()) return [];
  const res = await fetchFn(archiveSearchUrl(text));
  if (!res.ok) throw new Error(`archive.org ответил ${res.status}`);
  return parseArchiveSearch(await res.json());
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

/** Треки элемента архива: по одному MP3 на исходный файл, в порядке номеров треков. */
export function parseArchiveMetadata(id: string, json: any): Track[] {
  const meta = json?.metadata ?? {};
  const files: any[] = Array.isArray(json?.files) ? json.files : [];
  const album = first(meta.title) ?? id;
  const albumArtist = first(meta.creator) ?? 'Неизвестный исполнитель';
  const license = first(meta.licenseurl);

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
      title: fileTitle,
      artist: first(f.creator) ?? first(f.artist) ?? albumArtist,
      album,
      uri: url,
      duration: parseLength(f.length),
      colors: colorsFor(id),
      online: true,
      license,
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
