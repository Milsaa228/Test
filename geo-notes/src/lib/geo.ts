import type { GeoNote, LatLng, Position, TriggerEntry, TriggerState } from './types';

export const RADII = [50, 100, 300];
export const EARTH_RADIUS_M = 6371008.8;
/** Позиции хуже этой точности не используем для срабатываний: слишком много ложных. */
export const MAX_ACCURACY_M = 250;

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Расстояние по большому кругу (haversine), в метрах. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** «≈ 120 м», «≈ 1,2 км», «≈ 15 км». */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `≈ ${Math.max(10, Math.round(meters / 10) * 10)} м`;
  if (meters < 10000) return `≈ ${(Math.round(meters / 100) / 10).toFixed(1).replace('.', ',')} км`;
  return `≈ ${Math.round(meters / 1000)} км`;
}

/**
 * Запас на выход из зоны: чтобы GPS-дрожание на границе не вызывало «вошёл-вышел-вошёл».
 * Выходом считаем удаление дальше radius + margin.
 */
export function exitMargin(radius: number): number {
  return Math.max(20, radius * 0.2);
}

export function sortByDistance<T extends LatLng>(items: T[], from: LatLng | null): { item: T; distance: number | null }[] {
  const rows = items.map((item) => ({ item, distance: from ? distanceMeters(from, item) : null }));
  if (from) rows.sort((a, b) => (a.distance as number) - (b.distance as number));
  return rows;
}

/** Может ли заметка сработать сейчас (без учёта геометрии). */
export function canFire(note: GeoNote, entry: TriggerEntry | undefined, now: number, cooldownMs: number): boolean {
  const last = entry?.lastFiredAt;
  if (last === undefined) return true;
  if (note.repeat === 'once') return false;
  return now - last >= cooldownMs;
}

function withEntry(state: TriggerState, id: string, entry: TriggerEntry): TriggerState {
  const clean: TriggerEntry = { inside: entry.inside };
  if (entry.lastFiredAt !== undefined) clean.lastFiredAt = entry.lastFiredAt;
  return { ...state, [id]: clean };
}

export interface Fired {
  note: GeoNote;
  distance: number;
}

/**
 * Решает, какие заметки сработали при новой позиции.
 * Срабатывание только на входе в зону (снаружи → внутри), с учётом паузы между повторами
 * и режима «один раз». Возвращает новое состояние; записи удалённых заметок отбрасываются.
 */
export function nearbyTriggers(
  notes: GeoNote[],
  position: Position,
  state: TriggerState,
  now: number,
  cooldownMs: number,
): { fired: Fired[]; state: TriggerState } {
  if (position.accuracy != null && position.accuracy > MAX_ACCURACY_M) return { fired: [], state };
  let next: TriggerState = {};
  const fired: Fired[] = [];
  for (const note of notes) {
    const prev = state[note.id];
    const wasInside = prev?.inside ?? false;
    const d = distanceMeters(position, note);
    const inside = wasInside ? d <= note.radius + exitMargin(note.radius) : d <= note.radius;
    let lastFiredAt = prev?.lastFiredAt;
    if (inside && !wasInside && canFire(note, prev, now, cooldownMs)) {
      lastFiredAt = now;
      fired.push({ note, distance: d });
    }
    next = withEntry(next, note.id, { inside, lastFiredAt });
  }
  fired.sort((a, b) => a.distance - b.distance);
  return { fired, state: next };
}

/** То же решение для событий фоновой геозоны (ОС сама сообщает о входе и выходе). */
export function applyGeofenceEvent(
  note: GeoNote,
  event: 'enter' | 'exit',
  state: TriggerState,
  now: number,
  cooldownMs: number,
): { fire: boolean; state: TriggerState } {
  const prev = state[note.id];
  if (event === 'exit') return { fire: false, state: withEntry(state, note.id, { ...prev, inside: false }) };
  if (prev?.inside) return { fire: false, state };
  const fire = canFire(note, prev, now, cooldownMs);
  return { fire, state: withEntry(state, note.id, { inside: true, lastFiredAt: fire ? now : prev?.lastFiredAt }) };
}

/** Заметка «один раз», которая уже сработала. */
export function isSpent(note: GeoNote, state: TriggerState): boolean {
  return note.repeat === 'once' && state[note.id]?.lastFiredAt !== undefined;
}

export interface GeofenceRegion extends LatLng {
  identifier: string;
  radius: number;
  notifyOnEnter: boolean;
  notifyOnExit: boolean;
}

/** iOS следит максимум за 20 регионами на приложение — берём ближайшие активные. */
export function pickGeofenceRegions(notes: GeoNote[], state: TriggerState, from: LatLng | null, limit = 20): GeofenceRegion[] {
  const active = notes.filter((n) => !isSpent(n, state));
  return sortByDistance(active, from)
    .slice(0, limit)
    .map(({ item }) => ({
      identifier: item.id,
      latitude: item.latitude,
      longitude: item.longitude,
      radius: item.radius,
      notifyOnEnter: true,
      notifyOnExit: true,
    }));
}

export function isValidLatLng(p: Partial<LatLng> | null | undefined): p is LatLng {
  return (
    !!p &&
    typeof p.latitude === 'number' &&
    typeof p.longitude === 'number' &&
    Number.isFinite(p.latitude) &&
    Number.isFinite(p.longitude) &&
    Math.abs(p.latitude) <= 90 &&
    Math.abs(p.longitude) <= 180
  );
}
