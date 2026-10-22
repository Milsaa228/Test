import type { Playlist, Track } from './types';

// Демо-треки: свободные примеры с soundhelix.com (сгенерированная музыка, разрешено использовать как образцы).
const sh = (n: number) => `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-${n}.mp3`;

type Seed = [title: string, artist: string, album: string, genre: string, colors: [string, string]];

const SEEDS: Seed[] = [
  ['Неоновый закат', 'Helix Drive', 'Ночной город', 'Электроника', ['#FF5F6D', '#5B247A']],
  ['Пульс мегаполиса', 'Helix Drive', 'Ночной город', 'Электроника', ['#F7971E', '#7B2FF7']],
  ['Тихая гавань', 'Lumen', 'Отражения', 'Эмбиент', ['#43CEA2', '#185A9D']],
  ['Северное сияние', 'Lumen', 'Отражения', 'Эмбиент', ['#00C9FF', '#1B2A6B']],
  ['Ретроволна', 'Synth Echo', '1986', 'Синтвейв', ['#FC466B', '#3F5EFB']],
  ['Кассета', 'Synth Echo', '1986', 'Синтвейв', ['#EE0979', '#2B1055']],
  ['Утренний кофе', 'Mono Lisa', 'Будни', 'Лоу-фай', ['#C79081', '#4B3B2F']],
  ['Дождь за окном', 'Mono Lisa', 'Будни', 'Лоу-фай', ['#757F9A', '#2C3E50']],
  ['Взлёт', 'Orbit Seven', 'Стратосфера', 'Рок', ['#F00000', '#3A0000']],
  ['Гравитация', 'Orbit Seven', 'Стратосфера', 'Рок', ['#FF8008', '#5A1E00']],
  ['Джазовый вечер', 'Blue Room', 'Вечер у камина', 'Джаз', ['#2193B0', '#0B1F3A']],
  ['Саксофон в метро', 'Blue Room', 'Вечер у камина', 'Джаз', ['#4568DC', '#2A0845']],
  ['Танцпол', 'Kilohertz', 'Клубная серия', 'Электроника', ['#F953C6', '#3A0CA3']],
  ['До рассвета', 'Kilohertz', 'Клубная серия', 'Электроника', ['#8E2DE2', '#1A0B3B']],
  ['Дорога домой', 'Field Notes', 'Акустика', 'Инди', ['#A8E063', '#2F5D11']],
  ['Последний поезд', 'Field Notes', 'Акустика', 'Инди', ['#F2C94C', '#6B4E00']],
];

export const CATALOG: Track[] = SEEDS.map(([title, artist, album, genre, colors], i) => ({
  id: `sh${i + 1}`,
  title,
  artist,
  album,
  genre,
  colors,
  uri: sh(i + 1),
}));

const byId = new Map(CATALOG.map((t) => [t.id, t]));
export const catalogTrack = (id: string) => byId.get(id);

const pick = (...ids: number[]) => ids.map((n) => `sh${n}`);

export const FEATURED: Playlist[] = [
  { id: 'f-mix', name: 'Микс дня', description: 'Электроника, синтвейв и немного рока', trackIds: pick(1, 5, 13, 9, 2, 6, 14), colors: ['#7B2FF7', '#1A0B3B'], createdAt: 0 },
  { id: 'f-focus', name: 'Фокус', description: 'Спокойный фон для работы и учёбы', trackIds: pick(3, 4, 7, 8, 11), colors: ['#185A9D', '#0B1F3A'], createdAt: 0 },
  { id: 'f-drive', name: 'В дорогу', description: 'Энергичные треки для поездок', trackIds: pick(9, 10, 2, 13, 15, 16), colors: ['#F00000', '#3A0000'], createdAt: 0 },
  { id: 'f-chill', name: 'Вечерний чилл', description: 'Джаз и лоу-фай под вечер', trackIds: pick(11, 12, 7, 8, 3), colors: ['#C79081', '#2C3E50'], createdAt: 0 },
  { id: 'f-80s', name: 'Назад в 80-е', description: 'Синтезаторы и неон', trackIds: pick(5, 6, 1, 14), colors: ['#FC466B', '#3F5EFB'], createdAt: 0 },
  { id: 'f-indie', name: 'Инди-находки', description: 'Акустика и живой звук', trackIds: pick(15, 16, 10, 12), colors: ['#A8E063', '#2F5D11'], createdAt: 0 },
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

export const GENRES: { name: string; color: string }[] = [
  ...new Set(CATALOG.map((t) => t.genre!)),
].map((name, i) => ({ name, color: ['#E13300', '#1E3264', '#8D67AB', '#E8115B', '#148A08', '#BA5D07', '#503750'][i % 7] }));
