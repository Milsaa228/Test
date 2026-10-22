import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { readJson, removeKey, writeJson } from '../lib/cache';
import { genreById } from '../lib/genres';
import { buildMix, waveBatch, type Mix } from '../lib/reco';
import { MIX_INFO, offlineWave, periodKey, type MixKind } from '../lib/recommend';
import type { Track } from '../lib/types';
import { useLibrary } from './LibraryContext';
import { usePlayer } from './PlayerContext';

export const WAVE_SOURCE = 'wave';
const MIX_KINDS: MixKind[] = ['day', 'week', 'month'];

type MixState = { mix: Mix | null; loading: boolean; error: string | null };
type Shelf = { kind: 'genre' | 'artist'; value: string; title: string };

type RecoCtx = {
  mixes: Record<MixKind, MixState>;
  refreshMixes: () => void;
  /** Полки «Для вас» на главной — по выбранным жанрам и исполнителям. */
  shelves: Shelf[];
  waveActive: boolean;
  waveLoading: boolean;
  waveError: string | null;
  startWave: () => Promise<void>;
  /** «Не нравится»: трек больше не попадёт в рекомендации; если играет — переключаем дальше. */
  dislike: (track: Track) => void;
};

const Ctx = createContext<RecoCtx | null>(null);
const emptyMix: MixState = { mix: null, loading: false, error: null };
const mixCacheKey = (kind: MixKind) => `mix:${kind}`;

export function RecoProvider({ children }: { children: ReactNode }) {
  const library = useLibrary();
  const player = usePlayer();
  const [mixes, setMixes] = useState<Record<MixKind, MixState>>({ day: emptyMix, week: emptyMix, month: emptyMix });
  const [generation, setGeneration] = useState(0);
  const [waveLoading, setWaveLoading] = useState(false);
  const [waveError, setWaveError] = useState<string | null>(null);
  const waveFetching = useRef(false);

  // Актуальное состояние медиатеки для асинхронных задач, не перезапускающих эффекты на каждый лайк.
  const stateRef = useRef(library.state);
  useEffect(() => {
    stateRef.current = library.state;
  }, [library.state]);

  const { ready, offline } = library;
  const onboarded = library.state.prefs.onboarded;
  const prefsKey = `${library.state.prefs.genres.join(',')}|${library.state.prefs.artists.join(',')}`;

  // Миксы: берём сохранённый для текущего периода, иначе собираем заново (по очереди, чтобы миксы не повторяли друг друга).
  useEffect(() => {
    if (!ready || !onboarded) return;
    let alive = true;
    (async () => {
      const used = new Set<string>();
      for (const kind of MIX_KINDS) {
        const key = periodKey(kind);
        const saved = await readJson<Mix & { prefsKey?: string }>(mixCacheKey(kind));
        if (saved && saved.key === key && saved.prefsKey === prefsKey) {
          saved.tracks.forEach((t) => used.add(t.id));
          if (alive) setMixes((m) => ({ ...m, [kind]: { mix: saved, loading: false, error: null } }));
          continue;
        }
        if (offline) {
          if (alive) setMixes((m) => ({ ...m, [kind]: { mix: saved ?? null, loading: false, error: saved ? null : 'Нужен интернет' } }));
          continue;
        }
        if (alive) setMixes((m) => ({ ...m, [kind]: { ...m[kind], loading: true, error: null } }));
        try {
          const mix = await buildMix(kind, stateRef.current, { avoidIds: used });
          mix.tracks.forEach((t) => used.add(t.id));
          await writeJson(mixCacheKey(kind), { ...mix, prefsKey });
          if (alive) setMixes((m) => ({ ...m, [kind]: { mix, loading: false, error: null } }));
        } catch (e) {
          if (alive) setMixes((m) => ({ ...m, [kind]: { mix: saved ?? null, loading: false, error: e instanceof Error ? e.message : String(e) } }));
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [ready, onboarded, offline, prefsKey, generation]);

  const refreshMixes = useCallback(() => {
    Promise.all(MIX_KINDS.map((k) => removeKey(mixCacheKey(k)))).then(() => setGeneration((g) => g + 1));
  }, []);

  const shelves = useMemo<Shelf[]>(() => {
    const { genres, artists } = library.state.prefs;
    const out: Shelf[] = [];
    // Чередуем жанры и исполнителей, не больше 6 полок.
    for (let i = 0; out.length < 6 && (i < genres.length || i < artists.length); i++) {
      const g = genres[i] && genreById(genres[i]);
      if (g) out.push({ kind: 'genre', value: g.id, title: g.name });
      if (artists[i] && out.length < 6) out.push({ kind: 'artist', value: artists[i], title: artists[i] });
    }
    return out;
  }, [library.state.prefs]);

  const fetchWave = useCallback(
    async (exclude: Set<string>): Promise<Track[]> => {
      const s = stateRef.current;
      if (offline) {
        const local = s.localTracks.filter((t) => t.local);
        return offlineWave(local, s, 10, Math.random, exclude);
      }
      return waveBatch(s, { exclude });
    },
    [offline],
  );

  const startWave = useCallback(async () => {
    if (player.source === WAVE_SOURCE && player.current) {
      player.toggle();
      return;
    }
    setWaveLoading(true);
    setWaveError(null);
    try {
      const batch = await fetchWave(new Set());
      if (!batch.length || !player.playList(batch, 0, WAVE_SOURCE, { shuffle: false })) {
        setWaveError(offline ? 'Нет скачанных треков — подключитесь к интернету' : 'Не удалось подобрать треки');
      }
    } catch (e) {
      setWaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setWaveLoading(false);
    }
  }, [fetchWave, player, offline]);

  // Волна бесконечна: когда до конца очереди осталось мало треков, подгружаем следующую порцию.
  const { queue, source, append } = player;
  useEffect(() => {
    if (source !== WAVE_SOURCE || waveFetching.current) return;
    if (queue.tracks.length - queue.index > 3) return;
    waveFetching.current = true;
    fetchWave(new Set(queue.tracks.map((t) => t.id)))
      .then(append)
      .catch(() => {})
      .finally(() => {
        waveFetching.current = false;
      });
  }, [source, queue.index, queue.tracks, fetchWave, append]);

  const { dispatch } = library;
  const { current, next } = player;
  const dislike = useCallback(
    (track: Track) => {
      dispatch({ type: 'dislike', track });
      if (current?.id === track.id) next();
    },
    [dispatch, current, next],
  );

  const value = useMemo(
    () => ({
      mixes,
      refreshMixes,
      shelves,
      waveActive: player.source === WAVE_SOURCE,
      waveLoading,
      waveError,
      startWave,
      dislike,
    }),
    [mixes, refreshMixes, shelves, player.source, waveLoading, waveError, startWave, dislike],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useReco() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useReco outside RecoProvider');
  return ctx;
}

export const mixTitle = (kind: MixKind) => MIX_INFO[kind].title;
