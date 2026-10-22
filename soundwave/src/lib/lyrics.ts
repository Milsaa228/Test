// Тексты песен из LRCLIB (lrclib.net): открытая база, без ключа. Есть синхронизированные тексты по времени.

export type LyricLine = { t: number; text: string };
export type Lyrics = { plain: string | null; synced: LyricLine[] | null; instrumental: boolean };

type Fetch = (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>;

/** «[01:05.41] строка» → { t: 65.41, text }. Строки без метки времени пропускаются, несколько меток на строку — поддерживаются. */
export function parseSynced(lrc: string): LyricLine[] {
  const out: LyricLine[] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    if (!stamps.length) continue;
    const text = raw.replace(/\[[^\]]*\]/g, '').trim();
    for (const m of stamps) {
      const frac = m[3] ? parseInt(m[3], 10) / Math.pow(10, m[3].length) : 0;
      out.push({ t: parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + frac, text });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Индекс текущей строки для позиции воспроизведения (−1 — ещё до первой строки). */
export function currentLine(lines: LyricLine[], position: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].t <= position + 0.2) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

const toLyrics = (d: any): Lyrics => ({
  plain: d?.plainLyrics || null,
  synced: d?.syncedLyrics ? parseSynced(d.syncedLyrics) : null,
  instrumental: !!d?.instrumental,
});

/** Название без «(Remastered)», «- Live», «feat.» — так LRCLIB находит чаще. */
export function cleanTrackTitle(title: string): string {
  return title
    .replace(/\s*[([].*?(remaster|live|version|edit|mix|feat|ft\.|mono|stereo|demo|bonus).*?[)\]]/gi, '')
    .replace(/\s+-\s+(live|remaster|radio edit|single version).*$/i, '')
    .replace(/\s+(feat|ft)\.?\s.+$/i, '')
    .trim();
}

export async function fetchLyrics(t: { artist: string; title: string; album?: string; duration?: number }, fetchFn: Fetch = fetch as unknown as Fetch): Promise<Lyrics | null> {
  const title = cleanTrackTitle(t.title);
  const params = new URLSearchParams({ artist_name: t.artist, track_name: title });
  if (t.duration) params.set('duration', String(Math.round(t.duration)));
  const res = await fetchFn(`https://lrclib.net/api/get?${params}`);
  if (res.ok) return toLyrics(await res.json());
  if (res.status !== 404) throw new Error(`lrclib.net ответил ${res.status}`);
  // Точного совпадения нет — ищем по названию и исполнителю.
  const search = await fetchFn(`https://lrclib.net/api/search?${new URLSearchParams({ q: `${t.artist} ${title}` })}`);
  if (!search.ok) return null;
  const list: any[] = await search.json();
  const best = list.find((x) => x.syncedLyrics) ?? list.find((x) => x.plainLyrics);
  return best ? toLyrics(best) : null;
}
