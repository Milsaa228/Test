import { albumsOf, artistsOf, CATALOG, featuredPlaylist } from './catalog';
import type { Collection, LibraryState, Playlist, Track } from './types';

export const EMPTY_LIBRARY: LibraryState = { liked: [], playlists: [], recent: [], localTracks: [], durations: {} };

const RECENT_LIMIT = 20;

const PLAYLIST_COLORS: [string, string][] = [
  ['#7F53AC', '#2A1B3D'],
  ['#0BA360', '#0B3D2A'],
  ['#F857A6', '#4A1030'],
  ['#4776E6', '#1B2350'],
  ['#F09819', '#4F2A00'],
  ['#11998E', '#06312D'],
];

export type LibraryAction =
  | { type: 'load'; state: LibraryState }
  | { type: 'toggleLike'; id: string }
  | { type: 'createPlaylist'; id: string; name: string; now: number; trackIds?: string[] }
  | { type: 'renamePlaylist'; id: string; name: string }
  | { type: 'deletePlaylist'; id: string }
  | { type: 'addToPlaylist'; playlistId: string; trackId: string }
  | { type: 'removeFromPlaylist'; playlistId: string; index: number }
  | { type: 'played'; id: string }
  | { type: 'addTracks'; tracks: Track[] }
  | { type: 'removeLocal'; id: string }
  | { type: 'duration'; id: string; seconds: number };

export function libraryReducer(s: LibraryState, a: LibraryAction): LibraryState {
  switch (a.type) {
    case 'load':
      return { ...EMPTY_LIBRARY, ...a.state };
    case 'toggleLike':
      return { ...s, liked: s.liked.includes(a.id) ? s.liked.filter((x) => x !== a.id) : [a.id, ...s.liked] };
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
    case 'played':
      return { ...s, recent: [a.id, ...s.recent.filter((x) => x !== a.id)].slice(0, RECENT_LIMIT) };
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
        recent: drop(s.recent),
        playlists: s.playlists.map((p) => ({ ...p, trackIds: drop(p.trackIds) })),
        durations,
      };
    }
    case 'duration':
      if (!(a.seconds > 0) || s.durations[a.id] === Math.round(a.seconds)) return s;
      return { ...s, durations: { ...s.durations, [a.id]: Math.round(a.seconds) } };
  }
}

export function allTracks(s: LibraryState): Track[] {
  return [...CATALOG, ...s.localTracks];
}

export function trackIndex(s: LibraryState): Map<string, Track> {
  return new Map(allTracks(s).map((t) => [t.id, { ...t, duration: t.duration ?? s.durations[t.id] }]));
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

/**
 * Коллекция по id из адреса экрана:
 * liked · local · pl:<id> · album:<artist>::<album> · artist:<name> · genre:<name>.
 */
export function resolveCollection(id: string, s: LibraryState): Collection | null {
  const index = trackIndex(s);
  const all = [...index.values()];
  if (id === 'liked') {
    return { id, kind: 'liked', title: 'Любимые треки', subtitle: tracksLabel(s.liked.length), colors: ['#5038ED', '#8FBCE6'], tracks: resolveIds(s.liked, index), editable: false };
  }
  if (id === 'local') {
    const tracks = s.localTracks.map((t) => index.get(t.id)!);
    return { id, kind: 'local', title: 'Мои треки', subtitle: `С устройства и из интернета · ${tracksLabel(tracks.length)}`, colors: ['#F2994A', '#4F2A00'], tracks, editable: false };
  }
  const [prefix, ...restParts] = id.split(':');
  const rest = restParts.join(':');
  if (prefix === 'pl') {
    const own = s.playlists.find((p) => p.id === rest);
    const p = own ?? featuredPlaylist(rest);
    if (!p) return null;
    const tracks = resolveIds(p.trackIds, index);
    return {
      id,
      kind: 'playlist',
      title: p.name,
      subtitle: own ? `Ваш плейлист · ${tracksLabel(tracks.length)}` : `${p.description ?? 'Подборка'} · ${tracksLabel(tracks.length)}`,
      colors: p.colors,
      tracks,
      editable: !!own,
    };
  }
  if (prefix === 'album') {
    const [artist, album] = rest.split('::');
    const a = albumsOf(all).find((x) => x.artist === artist && x.name === album);
    if (!a) return null;
    return { id, kind: 'album', title: a.name, subtitle: `Альбом · ${a.artist}`, colors: a.colors, tracks: resolveIds(a.trackIds, index), editable: false };
  }
  if (prefix === 'artist') {
    const a = artistsOf(all).find((x) => x.name === rest);
    if (!a) return null;
    return { id, kind: 'artist', title: a.name, subtitle: `Исполнитель · ${tracksLabel(a.trackIds.length)}`, colors: a.colors, tracks: resolveIds(a.trackIds, index), editable: false };
  }
  if (prefix === 'genre') {
    const tracks = all.filter((t) => t.genre === rest);
    if (!tracks.length) return null;
    return { id, kind: 'genre', title: rest, subtitle: `Жанр · ${tracksLabel(tracks.length)}`, colors: tracks[0].colors, tracks, editable: false };
  }
  return null;
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').trim();

export function search(query: string, tracks: Track[]) {
  const q = norm(query);
  if (!q) return { tracks: [], artists: [], albums: [] };
  const words = q.split(/\s+/);
  const hit = (...fields: string[]) => {
    const hay = norm(fields.join(' '));
    return words.every((w) => hay.includes(w));
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
