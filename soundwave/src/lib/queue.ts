import type { RepeatMode, Track } from './types';

export type QueueState = {
  /** Порядок воспроизведения (с учётом перемешивания). */
  tracks: Track[];
  /** Исходный порядок, чтобы вернуть его при выключении перемешивания. */
  original: Track[];
  index: number;
  shuffle: boolean;
  repeat: RepeatMode;
};

export const EMPTY_QUEUE: QueueState = { tracks: [], original: [], index: -1, shuffle: false, repeat: 'off' };

export function shuffled<T>(items: T[], rand: () => number = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Текущий трек остаётся первым, остальные перемешиваются. */
function shuffleAround(tracks: Track[], index: number, rand: () => number): Track[] {
  if (index < 0) return shuffled(tracks, rand);
  const rest = tracks.filter((_, i) => i !== index);
  return [tracks[index], ...shuffled(rest, rand)];
}

export function startQueue(
  prev: QueueState,
  tracks: Track[],
  startIndex: number,
  opts: { shuffle?: boolean; rand?: () => number } = {},
): QueueState {
  const shuffle = opts.shuffle ?? prev.shuffle;
  if (tracks.length === 0) return { ...EMPTY_QUEUE, shuffle, repeat: prev.repeat };
  // «Перемешать» без выбранного трека начинает со случайного.
  const rand = opts.rand ?? Math.random;
  const start = startIndex < 0 ? (shuffle ? Math.floor(rand() * tracks.length) : 0) : Math.min(startIndex, tracks.length - 1);
  return {
    original: tracks,
    tracks: shuffle ? shuffleAround(tracks, start, rand) : tracks,
    index: shuffle ? 0 : start,
    shuffle,
    repeat: prev.repeat,
  };
}

export function toggleShuffle(q: QueueState, rand: () => number = Math.random): QueueState {
  if (q.shuffle) {
    const current = q.tracks[q.index];
    // Ищем по позиции среди одинаковых id: берём первое вхождение — для очереди этого достаточно.
    const idx = current ? q.original.findIndex((t) => t.id === current.id) : -1;
    return { ...q, shuffle: false, tracks: q.original, index: idx };
  }
  return { ...q, shuffle: true, tracks: shuffleAround(q.tracks, q.index, rand), index: q.tracks.length ? 0 : -1 };
}

export function cycleRepeat(mode: RepeatMode): RepeatMode {
  return mode === 'off' ? 'all' : mode === 'all' ? 'one' : 'off';
}

/**
 * Индекс следующего трека или null, если очередь закончилась.
 * auto = трек доиграл сам (тогда «повтор одного» повторяет его), иначе пользователь нажал «вперёд».
 */
export function nextIndex(q: QueueState, auto: boolean): number | null {
  if (q.tracks.length === 0) return null;
  if (auto && q.repeat === 'one') return q.index;
  if (q.index + 1 < q.tracks.length) return q.index + 1;
  return q.repeat === 'off' ? null : 0;
}

/** Как в популярных плеерах: если трек играет дольше 3 секунд, «назад» перематывает его в начало. */
export function prevIndex(q: QueueState, currentTime: number): number {
  if (q.tracks.length === 0) return -1;
  if (currentTime > 3) return q.index;
  if (q.index > 0) return q.index - 1;
  return q.repeat === 'all' ? q.tracks.length - 1 : 0;
}

/** «Играть следующим»: вставляет трек сразу после текущего. */
export function playNext(q: QueueState, track: Track): QueueState {
  if (q.index < 0) return { ...q, tracks: [track], original: [track], index: 0 };
  const tracks = [...q.tracks.slice(0, q.index + 1), track, ...q.tracks.slice(q.index + 1)];
  const cur = q.tracks[q.index];
  const oi = q.original.findIndex((t) => t.id === cur.id);
  const original = [...q.original.slice(0, oi + 1), track, ...q.original.slice(oi + 1)];
  return { ...q, tracks, original };
}

export function removeAt(q: QueueState, i: number): QueueState {
  if (i === q.index || i < 0 || i >= q.tracks.length) return q;
  const removed = q.tracks[i];
  const tracks = q.tracks.filter((_, k) => k !== i);
  const oi = q.original.findIndex((t) => t.id === removed.id);
  const original = q.original.filter((_, k) => k !== oi);
  return { ...q, tracks, original, index: i < q.index ? q.index - 1 : q.index };
}

/** Убирает трек (например, удалённый локальный файл) из очереди целиком. */
export function dropTrack(q: QueueState, id: string): QueueState {
  const current = q.tracks[q.index];
  const tracks = q.tracks.filter((t) => t.id !== id);
  const original = q.original.filter((t) => t.id !== id);
  if (!current) return { ...q, tracks, original };
  if (current.id === id) return { ...q, tracks, original, index: tracks.length ? Math.min(q.index, tracks.length - 1) : -1 };
  const before = q.tracks.slice(0, q.index).filter((t) => t.id === id).length;
  return { ...q, tracks, original, index: q.index - before };
}

export function formatTime(seconds: number | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '–:––';
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export function formatTotal(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} мин`;
  return `${Math.floor(m / 60)} ч ${m % 60} мин`;
}
