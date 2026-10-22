import type { Playlist, Track } from './types';

// Встроенный офлайн-каталог: треки Kevin MacLeod (incompetech.com), лицензия CC BY 4.0.
// Файлы лежат в assets/music (скачаны workflow soundwave-fetch-music), require-карта — в musicAssets.ts.
export const CC_BY_4 = 'https://creativecommons.org/licenses/by/4.0/';
export const ARTIST = 'Kevin MacLeod';

type Seed = [file: string, title: string, genre: string, duration: number, colors: [string, string]];

const SEEDS: Seed[] = [
  ['local-forecast-elevator', 'Local Forecast - Elevator', 'Лаунж', 189, ['#43CEA2', '#185A9D']],
  ['monkeys-spinning-monkeys', 'Monkeys Spinning Monkeys', 'Поп', 125, ['#F7971E', '#7B2FF7']],
  ['bossa-antigua', 'Bossa Antigua', 'Джаз', 283, ['#C79081', '#4B3B2F']],
  ['itty-bitty-8-bit', 'Itty Bitty 8 Bit', 'Чиптюн', 194, ['#FC466B', '#3F5EFB']],
  ['gymnopedie-no-1', 'Gymnopedie No 1', 'Классика', 187, ['#757F9A', '#2C3E50']],
  ['hyperfun', 'Hyperfun', 'Электроника', 233, ['#F953C6', '#3A0CA3']],
  ['galway', 'Galway', 'Фолк', 220, ['#A8E063', '#2F5D11']],
  ['sneaky-snitch', 'Sneaky Snitch', 'Саундтрек', 137, ['#F2C94C', '#6B4E00']],
  ['funky-chunk', 'Funky Chunk', 'Фанк', 239, ['#FF8008', '#5A1E00']],
  ['night-on-the-docks-sax', 'Night on the Docks - Sax', 'Джаз', 174, ['#4568DC', '#2A0845']],
  ['volatile-reaction', 'Volatile Reaction', 'Рок', 165, ['#F00000', '#3A0000']],
  ['dreamer', 'Dreamer', 'Эмбиент', 204, ['#00C9FF', '#1B2A6B']],
];

const sourceUrl = (title: string) => `https://incompetech.com/music/royalty-free/mp3-royaltyfree/${encodeURIComponent(title)}.mp3`;

export const CATALOG: Track[] = SEEDS.map(([file, title, genre, duration, colors]) => ({
  id: `km-${file}`,
  title,
  artist: ARTIST,
  album: 'incompetech.com',
  genre,
  duration,
  colors,
  uri: `asset:${file}.mp3`,
  license: CC_BY_4,
  sourceUrl: sourceUrl(title),
}));

const byId = new Map(CATALOG.map((t) => [t.id, t]));
export const catalogTrack = (id: string) => byId.get(id);

const pick = (...files: string[]) => files.map((f) => `km-${f}`);

export const FEATURED: Playlist[] = [
  { id: 'f-mix', name: 'Микс дня', description: 'Бодрая электроника, фанк и рок', trackIds: pick('hyperfun', 'funky-chunk', 'monkeys-spinning-monkeys', 'volatile-reaction', 'itty-bitty-8-bit', 'sneaky-snitch'), colors: ['#7B2FF7', '#1A0B3B'], createdAt: 0 },
  { id: 'f-focus', name: 'Фокус', description: 'Спокойный фон для работы и учёбы', trackIds: pick('gymnopedie-no-1', 'dreamer', 'local-forecast-elevator', 'bossa-antigua'), colors: ['#185A9D', '#0B1F3A'], createdAt: 0 },
  { id: 'f-jazz', name: 'Вечерний джаз', description: 'Саксофон, босса-нова и лаунж', trackIds: pick('night-on-the-docks-sax', 'bossa-antigua', 'local-forecast-elevator', 'gymnopedie-no-1'), colors: ['#C79081', '#2C3E50'], createdAt: 0 },
  { id: 'f-energy', name: 'Энергия', description: 'Для тренировки и дороги', trackIds: pick('volatile-reaction', 'hyperfun', 'funky-chunk', 'itty-bitty-8-bit'), colors: ['#F00000', '#3A0000'], createdAt: 0 },
  { id: 'f-fun', name: 'Хорошее настроение', description: 'Весёлые и озорные мелодии', trackIds: pick('monkeys-spinning-monkeys', 'sneaky-snitch', 'galway', 'itty-bitty-8-bit'), colors: ['#F7971E', '#7B2FF7'], createdAt: 0 },
  { id: 'f-calm', name: 'Спокойствие', description: 'Эмбиент, классика и фолк', trackIds: pick('dreamer', 'gymnopedie-no-1', 'galway', 'night-on-the-docks-sax'), colors: ['#00C9FF', '#1B2A6B'], createdAt: 0 },
];

export const featuredPlaylist = (id: string) => FEATURED.find((p) => p.id === id);

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

const GENRE_COLORS = ['#E13300', '#1E3264', '#8D67AB', '#E8115B', '#148A08', '#BA5D07', '#503750', '#0D73EC', '#AF2896', '#27856A', '#B49BC8'];
export const GENRES: { name: string; color: string }[] = [...new Set(CATALOG.map((t) => t.genre!))].map((name, i) => ({
  name,
  color: GENRE_COLORS[i % GENRE_COLORS.length],
}));
