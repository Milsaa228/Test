import { matchScore, normalize } from './textq';

// Фото исполнителей: из открытого каталога Deezer, только картинки (музыку оттуда не берём).
// Ищем по имени, берём точное совпадение с наибольшим числом поклонников.

type Fetch = (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>;

export function pickArtistImage(name: string, results: any[]): string | null {
  const exact = results.filter((a) => a?.name && matchScore(a.name, [name]) === 1 && a.picture_medium && !/\/artist\/\/|images\/artist\/\//.test(a.picture_medium));
  if (!exact.length) return null;
  exact.sort((a, b) => (b.nb_fan ?? 0) - (a.nb_fan ?? 0));
  return exact[0].picture_medium as string;
}

export async function findArtistImage(name: string, fetchFn: Fetch = fetch as unknown as Fetch): Promise<string | null> {
  if (!normalize(name)) return null;
  const res = await fetchFn(`https://api.deezer.com/search/artist?q=${encodeURIComponent(name)}&limit=5`);
  if (!res.ok) return null;
  const json = await res.json();
  return pickArtistImage(name, json?.data ?? []);
}
