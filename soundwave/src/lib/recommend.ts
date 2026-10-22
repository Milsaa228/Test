import { ARTISTS, GENRES, genresOfTrack } from './genres';
import type { LibraryState, Track } from './types';

// Рекомендации считаются на устройстве: профиль вкуса → «семена» (исполнители и жанры) →
// кандидаты из Internet Archive → сборка микса или порции «Моей волны».

export type MixKind = 'day' | 'week' | 'month';

export const MIX_INFO: Record<MixKind, { title: string; subtitle: string; short: string; size: number }> = {
  day: { title: 'Микс дня', subtitle: 'Обновляется каждый день', short: 'каждый день', size: 20 },
  week: { title: 'Микс недели', subtitle: 'Обновляется по понедельникам', short: 'по понедельникам', size: 30 },
  month: { title: 'Микс месяца', subtitle: 'Обновляется 1-го числа', short: '1-го числа', size: 40 },
};

/**
 * ПРАВИЛО ПРОДУКТА: миксы дня/недели/месяца почти не содержат понравившихся треков —
 * лайки служат «семенами» для поиска похожего, а в сам микс попадают новые треки.
 * Понравившиеся добавляются только если новых не хватило, и не больше этой доли.
 */
export const MIX_MAX_LIKED_SHARE = 0.1;
/** В «Моей волне» знакомые любимые треки допустимы, но редко. */
export const WAVE_MAX_LIKED_SHARE = 0.2;

export type Seed = { kind: 'artist' | 'genre'; value: string; weight: number };
export type Taste = { artists: Map<string, number>; genres: Map<string, number> };

const DAY = 24 * 3600 * 1000;
const add = (m: Map<string, number>, k: string, w: number) => m.set(k, (m.get(k) ?? 0) + w);

/** Профиль вкуса: стартовые предпочтения, лайки, прослушивания, пропуски и «не нравится». */
export function tasteProfile(s: LibraryState, now = Date.now()): Taste {
  const artists = new Map<string, number>();
  const genres = new Map<string, number>();
  for (const g of s.prefs.genres) add(genres, g, 3);
  for (const a of s.prefs.artists) {
    add(artists, a, 3);
    // Жанр известного исполнителя тоже становится «семенем»: так находятся похожие музыканты.
    const known = ARTISTS.find((x) => x.name === a);
    if (known) add(genres, known.genre, 1);
  }

  const byId = new Map(s.localTracks.map((t) => [t.id, t]));
  for (const id of s.liked) {
    const t = byId.get(id);
    if (!t) continue;
    add(artists, t.artist, 2);
    for (const g of genresOfTrack(t)) add(genres, g, 1.5);
  }
  for (const st of Object.values(s.stats)) {
    // Свежие прослушивания весят больше: за 30 дней вклад падает вдвое.
    const decay = Math.pow(0.5, Math.max(0, now - st.last) / (30 * DAY));
    add(artists, st.artist, (Math.min(st.plays, 5) * 0.3 - st.skips * 0.4) * decay);
    for (const g of genresOfTrack(st)) add(genres, g, Math.min(st.plays, 5) * 0.15 * decay);
  }
  for (const d of s.disliked) {
    add(artists, d.artist, -2);
    for (const g of genresOfTrack(d)) add(genres, g, -0.5);
  }
  return { artists, genres };
}

/** Взвешенный выбор без повторов. */
function weightedPick<T extends { weight: number }>(items: T[], count: number, rand: () => number): T[] {
  const pool = items.filter((i) => i.weight > 0);
  const out: T[] = [];
  while (out.length < count && pool.length) {
    const total = pool.reduce((s, i) => s + i.weight, 0);
    let r = rand() * total;
    let idx = pool.findIndex((i) => (r -= i.weight) <= 0);
    if (idx < 0) idx = pool.length - 1;
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

const DEFAULT_GENRES = ['jazz', 'electronic', 'classical', 'ambient', 'rock', 'lofi'];

/**
 * «Семена» для поиска: смесь жанров (дают новых исполнителей) и исполнителей (дают похожее звучание).
 * Жанров берём не меньше половины — так в миксы попадает больше незнакомой музыки.
 */
export function pickSeeds(taste: Taste, count: number, rand: () => number): Seed[] {
  const genreSeeds: Seed[] = [...taste.genres].filter(([id]) => GENRES.some((g) => g.id === id)).map(([value, weight]) => ({ kind: 'genre', value, weight }));
  const artistSeeds: Seed[] = [...taste.artists].map(([value, weight]) => ({ kind: 'artist', value, weight }));
  if (!genreSeeds.some((s) => s.weight > 0) && !artistSeeds.some((s) => s.weight > 0)) {
    for (const g of DEFAULT_GENRES) genreSeeds.push({ kind: 'genre', value: g, weight: 1 });
  }
  const nGenres = Math.max(Math.ceil(count / 2), count - artistSeeds.filter((s) => s.weight > 0).length);
  const picked = [...weightedPick(genreSeeds, nGenres, rand), ...weightedPick(artistSeeds, count - Math.min(nGenres, genreSeeds.length), rand)];
  // Если жанров не хватило — добираем исполнителями и наоборот.
  if (picked.length < count) {
    const rest = [...genreSeeds, ...artistSeeds].filter((s) => !picked.includes(s));
    picked.push(...weightedPick(rest, count - picked.length, rand));
  }
  return picked.slice(0, count);
}

export type AssembleOptions = {
  size: number;
  likedIds: Set<string>;
  maxLikedShare: number;
  /** Нежелательные треки (недавно слушали, уже в другом миксе): берутся в последнюю очередь. */
  avoidIds?: Set<string>;
  dislikedIds?: Set<string>;
  perArtist?: number;
  rand: () => number;
};

export function shuffleWith<T>(items: T[], rand: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Переставляет треки так, чтобы один исполнитель не шёл подряд, если есть выбор. */
/** Исполнитель для сравнения: «AYANKOKO» и «ayankoko» — один и тот же. */
export const artistKey = (artist: string) => artist.toLowerCase().replace(/\s+/g, ' ').trim();

export function spreadArtists(tracks: Track[]): Track[] {
  const rest = [...tracks];
  const out: Track[] = [];
  while (rest.length) {
    const prev = out.length ? artistKey(out[out.length - 1].artist) : undefined;
    const i = rest.findIndex((t) => artistKey(t.artist) !== prev);
    out.push(rest.splice(i < 0 ? 0 : i, 1)[0]);
  }
  return out;
}

/** Сборка микса: новые треки в приоритете, понравившиеся — только добором и не больше доли maxLikedShare. */
export function assembleMix(candidates: Track[], o: AssembleOptions): Track[] {
  const perArtist = o.perArtist ?? 2;
  const seen = new Set<string>();
  const unique = candidates.filter((t) => !seen.has(t.id) && !o.dislikedIds?.has(t.id) && seen.add(t.id));
  const fresh = shuffleWith(unique.filter((t) => !o.likedIds.has(t.id)), o.rand);
  const liked = shuffleWith(unique.filter((t) => o.likedIds.has(t.id)), o.rand);
  const preferred = fresh.filter((t) => !o.avoidIds?.has(t.id));
  const avoided = fresh.filter((t) => o.avoidIds?.has(t.id));

  const out: Track[] = [];
  const perArtistCount = new Map<string, number>();
  const take = (pool: Track[], limit: number, cap: number) => {
    for (const t of pool) {
      if (out.length >= limit) break;
      const key = artistKey(t.artist);
      if (out.includes(t) || (perArtistCount.get(key) ?? 0) >= cap) continue;
      out.push(t);
      perArtistCount.set(key, (perArtistCount.get(key) ?? 0) + 1);
    }
  };
  take(preferred, o.size, perArtist);
  take(avoided, o.size, perArtist);
  // Если исполнителей мало, ослабляем ограничение, но всё ещё только новыми треками.
  take(preferred, o.size, perArtist * 2);
  take(avoided, o.size, perArtist * 2);
  const likedLimit = Math.floor(o.size * o.maxLikedShare);
  if (likedLimit > 0) take(liked, Math.min(o.size, out.length + likedLimit), perArtist * 2);
  return spreadArtists(out);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Ключ периода в местном времени: день YYYY-MM-DD, неделя YYYY-Www (ISO, с понедельника), месяц YYYY-MM. */
export function periodKey(kind: MixKind, d = new Date()): string {
  if (kind === 'day') return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (kind === 'month') return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (t.getDay() + 6) % 7; // понедельник = 0
  t.setDate(t.getDate() - dow + 3); // четверг этой недели определяет год
  const firstThu = new Date(t.getFullYear(), 0, 4);
  const week = 1 + Math.round(((t.getTime() - firstThu.getTime()) / DAY - 3 + ((firstThu.getDay() + 6) % 7)) / 7);
  return `${t.getFullYear()}-W${pad(week)}`;
}

/** Детерминированный генератор случайных чисел: один и тот же ключ периода → одна и та же подборка. */
export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Порция для «Моей волны» из уже имеющихся треков (офлайн): по вкусу, без недавних и неприятных. */
export function offlineWave(tracks: Track[], s: LibraryState, size: number, rand: () => number, avoid: Set<string>): Track[] {
  const taste = tasteProfile(s);
  const disliked = new Set(s.disliked.map((d) => d.id));
  const scored = tracks
    .filter((t) => !disliked.has(t.id))
    .map((t) => {
      const score = (taste.artists.get(t.artist) ?? 0) + genresOfTrack(t).reduce((acc, g) => acc + (taste.genres.get(g) ?? 0), 0);
      return { t, w: Math.max(0.2, 1 + score) * (avoid.has(t.id) ? 0.1 : 1) };
    });
  return weightedPick(scored.map((x) => ({ ...x, weight: x.w })), size, rand).map((x) => x.t);
}
