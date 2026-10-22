import { archiveTracks, artistQuery, genreQuery, queryArchive, type NetItem } from './archive';
import { genreById, genresOfTrack } from './genres';
import {
  assembleMix,
  MIX_INFO,
  MIX_MAX_LIKED_SHARE,
  periodKey,
  pickSeeds,
  seededRandom,
  shuffleWith,
  tasteProfile,
  WAVE_MAX_LIKED_SHARE,
  type MixKind,
  type Seed,
} from './recommend';
import type { LibraryState, Track } from './types';

type Fetch = Parameters<typeof queryArchive>[2];

export const seedQuery = (seed: Pick<Seed, 'kind' | 'value'>) =>
  seed.kind === 'artist' ? artistQuery(seed.value) : genreQuery(genreById(seed.value)?.query ?? `subject:(${seed.value})`);

/** Выполняет задачи не больше чем по limit одновременно; ошибки отдельных задач не прерывают остальные. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = { status: 'fulfilled', value: await fn(items[i]) };
      } catch (reason) {
        out[i] = { status: 'rejected', reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export type GatherOptions = {
  rand: () => number;
  itemsPerSeed: number;
  tracksPerItem: number;
  fetchFn?: Fetch;
};

/** Кандидаты: по каждому «семени» — несколько записей архива, из каждой — пара треков подходящей длины. */
export async function gatherCandidates(seeds: Seed[], o: GatherOptions): Promise<Track[]> {
  // Разные страницы выдачи дают разнообразие между периодами; для исполнителей с малым числом записей откатываемся на первую.
  const searches = await mapLimit(seeds, 4, async (seed) => {
    const page = 1 + Math.floor(o.rand() * 3);
    let items = await queryArchive(seedQuery(seed), { rows: 30, page }, o.fetchFn);
    if (!items.length && page > 1) items = await queryArchive(seedQuery(seed), { rows: 30, page: 1 }, o.fetchFn);
    return { seed, items: shuffleWith(items, o.rand).slice(0, o.itemsPerSeed) };
  });
  const picked: { seed: Seed; item: NetItem }[] = [];
  for (const r of searches) if (r.status === 'fulfilled') for (const item of r.value.items) picked.push({ seed: r.value.seed, item });
  if (!picked.length && searches.every((r) => r.status === 'rejected')) throw new Error('Нет связи с archive.org');

  const metas = await mapLimit(picked, 4, async ({ seed, item }) => {
    const { tracks } = await archiveTracks(item.id, o.fetchFn);
    // Слишком короткие (заставки) и слишком длинные (целый альбом одним файлом) треки пропускаем.
    const ok = tracks.filter((t) => t.duration == null || (t.duration >= 60 && t.duration <= 900));
    return shuffleWith(ok, o.rand)
      .slice(0, o.tracksPerItem)
      .map((t) => ({ ...t, tags: t.tags?.length ? t.tags : item.tags, genre: seed.kind === 'genre' && !genresOfTrack(t).length ? seed.value : t.genre }));
  });
  return metas.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}

const MIX_PLAN: Record<MixKind, { seeds: number; itemsPerSeed: number; tracksPerItem: number }> = {
  day: { seeds: 6, itemsPerSeed: 3, tracksPerItem: 2 },
  week: { seeds: 8, itemsPerSeed: 3, tracksPerItem: 2 },
  month: { seeds: 10, itemsPerSeed: 3, tracksPerItem: 2 },
};

export type Mix = { kind: MixKind; key: string; tracks: Track[]; createdAt: number };

/**
 * Микс периода. Понравившиеся треки служат только «семенами»: в пул кандидатов их не добавляем,
 * а если они всё же нашлись в архиве, assembleMix ставит их последними и не больше MIX_MAX_LIKED_SHARE.
 */
export async function buildMix(kind: MixKind, s: LibraryState, o: { now?: Date; avoidIds?: Set<string>; fetchFn?: Fetch } = {}): Promise<Mix> {
  const key = periodKey(kind, o.now);
  const rand = seededRandom(`${kind}:${key}:${s.prefs.genres.join(',')}:${s.prefs.artists.join(',')}`);
  const plan = MIX_PLAN[kind];
  const seeds = pickSeeds(tasteProfile(s), plan.seeds, rand);
  // Если «семян» мало (выбран один жанр), берём больше записей на каждое, чтобы микс был полным.
  const itemsPerSeed = Math.ceil((plan.seeds * plan.itemsPerSeed) / Math.max(1, seeds.length));
  const candidates = await gatherCandidates(seeds, { rand, itemsPerSeed, tracksPerItem: plan.tracksPerItem, fetchFn: o.fetchFn });
  const avoid = new Set([...(o.avoidIds ?? []), ...s.recentTracks.map((t) => t.id)]);
  const tracks = assembleMix(candidates, {
    size: MIX_INFO[kind].size,
    likedIds: new Set(s.liked),
    maxLikedShare: MIX_MAX_LIKED_SHARE,
    avoidIds: avoid,
    dislikedIds: new Set(s.disliked.map((d) => d.id)),
    perArtist: 2,
    rand,
  });
  if (!tracks.length) throw new Error('Не удалось подобрать треки');
  return { kind, key, tracks, createdAt: Date.now() };
}

/** Порция «Моей волны»: похожее на любимое, без повторов из очереди и недавнего, изредка — любимые треки. */
export async function waveBatch(s: LibraryState, o: { exclude: Set<string>; size?: number; rand?: () => number; fetchFn?: Fetch }): Promise<Track[]> {
  const rand = o.rand ?? Math.random;
  const seeds = pickSeeds(tasteProfile(s), 3, rand);
  const candidates = await gatherCandidates(seeds, { rand, itemsPerSeed: Math.ceil(6 / Math.max(1, seeds.length)), tracksPerItem: 2, fetchFn: o.fetchFn });
  const likedTracks = s.localTracks.filter((t) => s.liked.includes(t.id));
  return assembleMix([...candidates, ...shuffleWith(likedTracks, rand).slice(0, 3)], {
    size: o.size ?? 8,
    likedIds: new Set(s.liked),
    maxLikedShare: WAVE_MAX_LIKED_SHARE,
    avoidIds: new Set([...o.exclude, ...s.recentTracks.map((t) => t.id)]),
    dislikedIds: new Set([...s.disliked.map((d) => d.id), ...o.exclude]),
    perArtist: 1,
    rand,
  });
}

/** Подборка записей для полки «Для вас» на главной. */
export async function shelfItems(seed: Pick<Seed, 'kind' | 'value'>, fetchFn?: Fetch): Promise<NetItem[]> {
  return queryArchive(seedQuery(seed), { rows: 12 }, fetchFn);
}
