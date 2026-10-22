import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, type AudioPlayer, type AudioStatus } from 'expo-audio';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import {
  cycleRepeat,
  dropTrack,
  EMPTY_QUEUE,
  nextIndex,
  playNext as queuePlayNext,
  prevIndex,
  removeAt,
  startQueue,
  toggleShuffle as queueToggleShuffle,
  type QueueState,
} from '../lib/queue';
import { loadPlayerPrefs, savePlayerPrefs } from '../lib/storage';
import { isPlayable } from '../lib/library';
import type { Track } from '../lib/types';
import { useLibrary } from './LibraryContext';

type PlayerCtx = {
  queue: QueueState;
  current: Track | undefined;
  /** Откуда запущена очередь (id коллекции), чтобы подсветить её кнопку «Играть». */
  source: string | null;
  playing: boolean;
  status: AudioStatus;
  /** Запускает очередь. Без интернета пропускает нескачанные треки; false — играть нечего. */
  playList: (tracks: Track[], index: number, source: string | null, opts?: { shuffle?: boolean }) => boolean;
  /** Добавляет треки в конец очереди (для «Моей волны»). */
  append: (tracks: Track[]) => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  seek: (seconds: number) => void;
  jumpTo: (index: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  playNext: (track: Track) => void;
  removeFromQueue: (index: number) => void;
  /** Таймер сна: время остановки (мс) или «до конца трека». */
  sleep: { at: number | null; endOfTrack: boolean };
  setSleepTimer: (v: number | 'end' | null) => void;
};

const Ctx = createContext<PlayerCtx | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const library = useLibrary();
  const player = useAudioPlayer(null, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const [queue, setQueueState] = useState<QueueState>(EMPTY_QUEUE);
  const [source, setSource] = useState<string | null>(null);
  const [prefsReady, setPrefsReady] = useState(false);
  const [sleep, setSleep] = useState<{ at: number | null; endOfTrack: boolean }>({ at: null, endOfTrack: false });
  const sleepRef = useRef(sleep);
  useEffect(() => {
    sleepRef.current = sleep;
  }, [sleep]);
  const restoreStarted = useRef(false);

  // Обработчики событий плеера читают актуальную очередь через ref, а не из замыкания.
  const queueRef = useRef(queue);
  const loadedId = useRef<string | null>(null);
  const setQueue = useCallback((q: QueueState) => {
    queueRef.current = q;
    setQueueState(q);
  }, []);

  const { dispatch } = library;
  const current = queue.tracks[queue.index];

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' }).catch(() => {});
  }, []);

  const load = useCallback(
    (p: AudioPlayer, track: Track, autoplay: boolean) => {
      if (loadedId.current === track.id && p.isLoaded) {
        p.seekTo(0);
      } else {
        p.replace({ uri: track.uri });
        loadedId.current = track.id;
        try {
          p.setActiveForLockScreen(true, { title: track.title, artist: track.artist, albumTitle: track.album }, { showSeekBackward: true, showSeekForward: true });
        } catch {
          // экран блокировки поддерживается не везде
        }
      }
      if (autoplay) {
        p.play();
        dispatch({ type: 'played', track, now: Date.now() });
      }
    },
    [dispatch],
  );

  const goTo = useCallback(
    (q: QueueState, index: number, autoplay = true) => {
      const track = q.tracks[index];
      if (!track) return;
      setQueue({ ...q, index });
      load(player, track, autoplay);
    },
    [load, player, setQueue],
  );

  // Восстанавливаем режимы и последний трек (на паузе) после запуска.
  useEffect(() => {
    if (!library.ready || restoreStarted.current) return;
    restoreStarted.current = true;
    loadPlayerPrefs().then((prefs) => {
      const base = { ...EMPTY_QUEUE, shuffle: prefs.shuffle, repeat: prefs.repeat };
      const last = prefs.lastTrackId ? (library.tracks.get(prefs.lastTrackId) ?? library.state.recentTracks.find((t) => t.id === prefs.lastTrackId)) : undefined;
      if (last) goTo(startQueue(base, [last], 0), 0, false);
      else setQueue(base);
      setPrefsReady(true);
    });
  }, [library.ready, library.tracks, library.state.recentTracks, goTo, setQueue]);

  useEffect(() => {
    if (prefsReady) savePlayerPrefs({ shuffle: queue.shuffle, repeat: queue.repeat, lastTrackId: current?.id });
  }, [prefsReady, queue.shuffle, queue.repeat, current?.id]);

  // Таймер сна по времени.
  useEffect(() => {
    if (!sleep.at) return;
    const timer = setTimeout(() => {
      player.pause();
      setSleep({ at: null, endOfTrack: false });
    }, Math.max(0, sleep.at - Date.now()));
    return () => clearTimeout(timer);
  }, [sleep.at, player]);

  // Трек доиграл — переходим к следующему по правилам повтора.
  useEffect(() => {
    if (!status.didJustFinish) return;
    if (sleepRef.current.endOfTrack) {
      player.pause();
      setSleep({ at: null, endOfTrack: false });
      return;
    }
    const q = queueRef.current;
    const i = nextIndex(q, true);
    if (i == null) {
      player.pause();
      player.seekTo(0);
    } else {
      goTo(q, i);
    }
  }, [status.didJustFinish, goTo, player]);

  // Запоминаем длительность, чтобы показывать её в списках.
  useEffect(() => {
    if (current && status.isLoaded && status.duration > 0 && loadedId.current === current.id) {
      dispatch({ type: 'duration', id: current.id, seconds: status.duration });
    }
  }, [current, status.isLoaded, status.duration, dispatch]);

  // Удалённый файл убираем и из очереди (потоки из интернета могут играть и без сохранения в медиатеке).
  useEffect(() => {
    const q = queueRef.current;
    const gone = q.tracks.filter((t) => t.local && !library.tracks.has(t.id));
    if (!gone.length) return;
    const wasCurrent = gone.some((t) => t.id === q.tracks[q.index]?.id);
    const nq = gone.reduce((acc, t) => dropTrack(acc, t.id), q);
    if (wasCurrent) {
      player.pause();
      if (nq.index >= 0) goTo(nq, nq.index, false);
      else {
        loadedId.current = null;
        player.replace(null);
        setQueue(nq);
      }
    } else setQueue(nq);
  }, [library.tracks, goTo, player, setQueue]);

  const offlineRef = useRef(library.offline);
  // Сохранённая версия трека может уже указывать на скачанный файл — берём её.
  const tracksRef = useRef(library.tracks);
  useEffect(() => {
    offlineRef.current = library.offline;
    tracksRef.current = library.tracks;
  }, [library.offline, library.tracks]);

  // Перешли в офлайн: потоковые треки убираем из очереди, а если играл такой трек — останавливаем.
  useEffect(() => {
    if (!library.offline) return;
    const q = queueRef.current;
    if (q.tracks.every((t) => t.local)) return;
    const cur = q.tracks[q.index];
    const tracks = q.tracks.filter((t) => t.local);
    const original = q.original.filter((t) => t.local);
    if (cur && !cur.local) {
      player.pause();
      loadedId.current = null;
      player.replace(null);
      setQueue({ ...q, tracks, original, index: tracks.length ? 0 : -1 });
      if (tracks.length) load(player, tracks[0], false);
      else setSource(null);
    } else {
      setQueue({ ...q, tracks, original, index: cur ? tracks.indexOf(cur) : -1 });
    }
  }, [library.offline, player, setQueue, load]);

  const playList = useCallback(
    (tracks: Track[], index: number, src: string | null, opts?: { shuffle?: boolean }) => {
      const fresh = tracks.map((t) => tracksRef.current.get(t.id) ?? t);
      const chosen = index >= 0 ? fresh[index] : undefined;
      const playable = fresh.filter((t) => isPlayable(t, offlineRef.current));
      if (!playable.length) return false;
      const start = chosen ? playable.indexOf(chosen) : -1;
      if (chosen && start < 0) return false;
      const q = startQueue(queueRef.current, playable, start, opts);
      setSource(src);
      goTo(q, q.index);
      return true;
    },
    [goTo],
  );

  const append = useCallback(
    (tracks: Track[]) => {
      const q = queueRef.current;
      const have = new Set(q.tracks.map((t) => t.id));
      const add = tracks.filter((t) => !have.has(t.id) && isPlayable(t, offlineRef.current));
      if (add.length) setQueue({ ...q, tracks: [...q.tracks, ...add], original: [...q.original, ...add] });
    },
    [setQueue],
  );

  const toggle = useCallback(() => {
    const q = queueRef.current;
    if (!q.tracks[q.index]) return;
    if (player.playing) player.pause();
    else {
      if (!player.isLoaded || loadedId.current !== q.tracks[q.index].id) load(player, q.tracks[q.index], false);
      else if (player.duration > 0 && player.currentTime >= player.duration - 0.25) player.seekTo(0);
      player.play();
    }
  }, [player, load]);

  const next = useCallback(() => {
    const q = queueRef.current;
    const cur = q.tracks[q.index];
    // Переключение в первые 30 секунд считаем пропуском — такие треки реже попадут в подборки.
    if (cur && player.currentTime < 30 && (player.duration || 0) > 45) dispatch({ type: 'skipped', track: cur, now: Date.now() });
    const i = nextIndex(q, false);
    if (i != null) goTo(q, i, true);
  }, [goTo, player, dispatch]);

  const prev = useCallback(() => {
    const q = queueRef.current;
    const i = prevIndex(q, player.currentTime);
    if (i === q.index) {
      player.seekTo(0);
      if (!player.playing) player.play();
    } else if (i >= 0) goTo(q, i, true);
  }, [goTo, player]);

  const value = useMemo<PlayerCtx>(
    () => ({
      queue,
      current,
      source,
      playing: status.playing,
      status,
      playList,
      append,
      toggle,
      next,
      prev,
      seek: (s) => void player.seekTo(s),
      jumpTo: (i) => goTo(queueRef.current, i, true),
      toggleShuffle: () => setQueue(queueToggleShuffle(queueRef.current)),
      cycleRepeat: () => setQueue({ ...queueRef.current, repeat: cycleRepeat(queueRef.current.repeat) }),
      playNext: (t) => {
        const q = queueRef.current;
        if (q.index < 0) void playList([t], 0, null);
        else setQueue(queuePlayNext(q, t));
      },
      removeFromQueue: (i) => setQueue(removeAt(queueRef.current, i)),
      sleep,
      setSleepTimer: (v) =>
        setSleep(v === null ? { at: null, endOfTrack: false } : v === 'end' ? { at: null, endOfTrack: true } : { at: Date.now() + v * 60_000, endOfTrack: false }),
    }),
    [queue, current, source, status, playList, append, toggle, next, prev, player, goTo, setQueue, sleep],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlayer() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePlayer outside PlayerProvider');
  return ctx;
}
