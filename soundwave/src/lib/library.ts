import { fuzzyIncludes, queryVariants } from './textq';
import type { Collection, Disliked, LibraryState, Playlist, Track } from './types';

export const EMPTY_LIBRARY: LibraryState = {
  liked: [],
  disliked: [],
  playlists: [],
  recentTracks: [],
  localTracks: [],
  durations: {},
  stats: {},
  prefs: { genres: [], artists: [], onboarded: false },
  settings: { offline: false, autoDownloadLiked: false },
};

const RECENT_LIMIT = 30;
const STATS_LIMIT = 500;
const DISLIKED_LIMIT = 300;

const PLAYLIST_COLORS: [string, string][] = [
  ['#7F53AC', '#2A1B3D'],
  ['#0BA360', '#0B3D2A'],
  ['#F857A6', '#4A1030'],
  ['#4776E6', '#1B2350'],
  ['#F09819', '#4F2A00'],
  ['#11998E', '#06312D'],
];

export type LibraryAction =
  | { type: 'load'; state: Partial<LibraryState> }
  | { type: 'toggleLike'; id: string }
  | { type: 'dislike'; track: Track }
  | { type: 'createPlaylist'; id: string; name: string; now: number; trackIds?: string[] }
  | { type: 'renamePlaylist'; id: string; name: string }
  | { type: 'deletePlaylist'; id: string }
  | { type: 'addToPlaylist'; playlistId: string; trackId: string }
  | { type: 'removeFromPlaylist'; playlistId: string; index: number }
  | { type: 'played'; track: Track; now: number }
  | { type: 'skipped'; track: Track; now: number }
  | { type: 'addTracks'; tracks: Track[] }
  | { type: 'removeLocal'; id: string }
  | { type: 'duration'; id: string; seconds: number }
  | { type: 'setPrefs'; genres: string[]; artists: string[] }
  | { type: 'setSettings'; settings: Partial<LibraryState['settings']> }
  | { type: 'clearHistory' };

const brief = (t: Track) => ({ artist: t.artist, tags: t.tags?.slice(0, 8), genre: t.genre });

/** Оставляет в статистике самые свежие записи, чтобы хранилище не росло бесконечно. */
function pruneStats(stats: LibraryState['stats']): LibraryState['stats'] {
  const entries = Object.entries(stats);
  if (entries.length <= STATS_LIMIT) return stats;
  return Object.fromEntries(entries.sort((a, b) => b[1].last - a[1].last).slice(0, STATS_LIMIT));
}

export function libraryReducer(s: LibraryState, a: LibraryAction): LibraryState {
  switch (a.type) {
    case 'load': {
      const st = { ...EMPTY_LIBRARY, ...a.state, prefs: { ...EMPTY_LIBRARY.prefs, ...a.state.prefs }, settings: { ...EMPTY_LIBRARY.settings, ...a.state.settings } };
      // Ссылки на треки, которых больше нет в медиатеке (например, прежний встроенный каталог), убираем.
      const known = new Set(st.localTracks.map((t) => t.id));
      return {
        ...st,
        liked: st.liked.filter((id) => known.has(id)),
        playlists: st.playlists.map((p) => ({ ...p, trackIds: p.trackIds.filter((id) => known.has(id)) })),
        recentTracks: (st.recentTracks ?? []).filter((t) => !t.uri.startsWith('asset:')),
      };
    }
    case 'toggleLike':
      return { ...s, liked: s.liked.includes(a.id) ? s.liked.filter((x) => x !== a.id) : [a.id, ...s.liked] };
    case 'dislike': {
      const d: Disliked = { id: a.track.id, ...brief(a.track) };
      return {
        ...s,
        disliked: [d, ...s.disliked.filter((x) => x.id !== d.id)].slice(0, DISLIKED_LIMIT),
        liked: s.liked.filter((x) => x !== d.id),
      };
    }
    case 'createPlaylist': {
      const name = a.name.trim() || `Мой плейлист № ${s.playlists.length + 1}`;
      const p: Playlist = { id: a.id, name, trackIds: a.trackIds ?? [], colors: PLAYLIST_COLORS[s.playlists.length % PLAYLIST_COLORS.length], createdAt: a.now };
      return { ...s, playlists: [p, ...s.playlists] };
    }
    case 'renamePlaylist':
      return { ...s, playlists: s.playlists.map((p) => (p.id === a.id && a.name.trim() ? { ...p, name: a.name.trim() } : p)) };
    case 'deletePlaylist':
      return { ...s, playlists: s.playlists.filter((p) => p.id !== a.id) };
    case 'addToPlaylist':
      return {
        ...s,
        playlists: s.playlists.map((p) =>
          p.id === a.playlistId && !p.trackIds.includes(a.trackId) ? { ...p, trackIds: [...p.trackIds, a.trackId] } : p,
        ),
      };
    case 'removeFromPlaylist':
      return {
        ...s,
        playlists: s.playlists.map((p) => (p.id === a.playlistId ? { ...p, trackIds: p.trackIds.filter((_, i) => i !== a.index) } : p)),
      };
    case 'played': {
      const prev = s.stats[a.track.id];
      return {
        ...s,
        recentTracks: [a.track, ...s.recentTracks.filter((t) => t.id !== a.track.id)].slice(0, RECENT_LIMIT),
        stats: pruneStats({ ...s.stats, [a.track.id]: { ...brief(a.track), plays: (prev?.plays ?? 0) + 1, skips: prev?.skips ?? 0, last: a.now } }),
      };
    }
    case 'skipped': {
      const prev = s.stats[a.track.id];
      return { ...s, stats: pruneStats({ ...s.stats, [a.track.id]: { ...brief(a.track), plays: prev?.plays ?? 0, skips: (prev?.skips ?? 0) + 1, last: a.now } }) };
    }
    case 'addTracks': {
      // Повторное добавление обновляет трек (например, поток из интернета после скачивания становится файлом).
      const incoming = new Map(a.tracks.map((t) => [t.id, t]));
      const updated = s.localTracks.map((t) => incoming.get(t.id) ?? t);
      const known = new Set(s.localTracks.map((t) => t.id));
      return { ...s, localTracks: [...updated, ...a.tracks.filter((t) => !known.has(t.id))] };
    }
    case 'removeLocal': {
      const drop = (ids: string[]) => ids.filter((x) => x !== a.id);
      const { [a.id]: _gone, ...durations } = s.durations;
      return {
        ...s,
        localTracks: s.localTracks.filter((t) => t.id !== a.id),
        liked: drop(s.liked),
        playlists: s.playlists.map((p) => ({ ...p, trackIds: drop(p.trackIds) })),
        durations,
      };
    }
    case 'duration':
      if (!(a.seconds > 0) || s.durations[a.id] === Math.round(a.seconds)) return s;
      return { ...s, durations: { ...s.durations, [a.id]: Math.round(a.seconds) } };
    case 'setPrefs':
      return { ...s, prefs: { genres: [...new Set(a.genres)], artists: [...new Set(a.artists.map((x) => x.trim()).filter(Boolean))], onboarded: true } };
    case 'setSettings':
      return { ...s, settings: { ...s.settings, ...a.settings } };
    case 'clearHistory':
      return { ...s, recentTracks: [], stats: {}, disliked: [] };
  }
}

export function trackIndex(s: LibraryState): Map<string, Track> {
  return new Map(s.localTracks.map((t) => [t.id, { ...t, duration: t.duration ?? s.durations[t.id] }]));
}

const resolveIds = (ids: string[], index: Map<string, Track>) => ids.map((id) => index.get(id)).filter((t): t is Track => !!t);

export const albumKey = (artist: string, album: string) => `album:${artist}::${album}`;

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};
export const tracksLabel = (n: number) => `${n} ${plural(n, 'трек', 'трека', 'треков')}`;

export type AlbumInfo = { name: string; artist: string; colors: [string, string]; trackIds: string[] };
export type ArtistInfo = { name: string; colors: [string, string]; trackIds: string[] };

export function albumsOf(tracks: Track[]): AlbumInfo[] {
  const map = new Map<string, AlbumInfo>();
  for (const t of tracks) {
    const key = `${t.artist}\u0000${t.album}`;
    const a = map.get(key) ?? { name: t.album, artist: t.artist, colors: t.colors, trackIds: [] };
    a.trackIds.push(t.id);
    map.set(key, a);
  }
  return [...map.values()];
}

export function artistsOf(tracks: Track[]): ArtistInfo[] {
  const map = new Map<string, ArtistInfo>();
  for (const t of tracks) {
    const a = map.get(t.artist) ?? { name: t.artist, colors: t.colors, trackIds: [] };
    a.trackIds.push(t.id);
    map.set(t.artist, a);
  }
  return [...map.values()];
}

/**
 * Коллекция медиатеки по id из адреса экрана:
 * liked · local · recent · pl:<id> · album:<artist>::<album> · artist:<name>.
 * Миксы (mix:day|week|month) собираются в RecoContext.
 */
export function resolveCollection(id: string, s: LibraryState): Collection | null {
  const index = trackIndex(s);
  if (id === 'liked') {
    return { id, kind: 'liked', title: 'Любимые треки', subtitle: tracksLabel(s.liked.length), colors: ['#5038ED', '#8FBCE6'], tracks: resolveIds(s.liked, index), editable: false };
  }
  if (id === 'local') {
    const tracks = [...index.values()];
    return { id, kind: 'local', title: 'Мои треки', subtitle: `Сохранённые и скачанные · ${tracksLabel(tracks.length)}`, colors: ['#F2994A', '#4F2A00'], tracks, editable: false };
  }
  if (id === 'recent') {
    const tracks = s.recentTracks.map((t) => index.get(t.id) ?? t);
    return { id, kind: 'recent', title: 'Недавно прослушанные', subtitle: tracksLabel(tracks.length), colors: ['#434343', '#141414'], tracks, editable: false };
  }
  const [prefix, ...restParts] = id.split(':');
  const rest = restParts.join(':');
  if (prefix === 'pl') {
    const p = s.playlists.find((x) => x.id === rest);
    if (!p) return null;
    const tracks = resolveIds(p.trackIds, index);
    return { id, kind: 'playlist', title: p.name, subtitle: `Ваш плейлист · ${tracksLabel(tracks.length)}`, colors: p.colors, tracks, editable: true };
  }
  if (prefix === 'album') {
    const [artist, album] = rest.split('::');
    const a = albumsOf([...index.values()]).find((x) => x.artist === artist && x.name === album);
    if (!a) return null;
    return { id, kind: 'album', title: a.name, subtitle: `Альбом · ${a.artist}`, colors: a.colors, tracks: resolveIds(a.trackIds, index), editable: false };
  }
  if (prefix === 'artist') {
    const a = artistsOf([...index.values()]).find((x) => x.name === rest);
    if (!a) return null;
    return { id, kind: 'artist', title: a.name, subtitle: `Исполнитель · ${tracksLabel(a.trackIds.length)}`, colors: a.colors, tracks: resolveIds(a.trackIds, index), editable: false };
  }
  return null;
}

/** Поиск по медиатеке с учётом транслита, раскладки и русских написаний («металлика» → Metallica). */
export function search(query: string, tracks: Track[]) {
  const variants = queryVariants(query);
  if (!variants.length) return { tracks: [], artists: [], albums: [] };
  const hit = (...fields: string[]) => {
    const hay = fields.join(' ');
    return variants.some((v) => fuzzyIncludes(hay, v));
  };
  return {
    tracks: tracks.filter((t) => hit(t.title, t.artist, t.album)),
    artists: artistsOf(tracks).filter((a) => hit(a.name)),
    albums: albumsOf(tracks).filter((a) => hit(a.name, a.artist)),
  };
}

/** Метаданные из имени файла: «Исполнитель - Название.mp3» → { artist, title }. */
export function parseFileName(name: string): { title: string; artist: string } {
  const base = name.replace(/\.[^.]+$/, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  const m = base.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (m) return { artist: m[1].trim(), title: m[2].trim() };
  return { artist: 'Неизвестный исполнитель', title: base || 'Без названия' };
}

/** Детерминированный цвет обложки по строке. */
export function colorsFor(seed: string): [string, string] {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PLAYLIST_COLORS[h % PLAYLIST_COLORS.length];
}

/** Можно ли сейчас воспроизвести трек: без интернета — только файлы на устройстве. */
export const isPlayable = (t: Track, offline: boolean) => !offline || !!t.local;
