export type Repeat = 'once' | 'always';

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface Position extends LatLng {
  /** Точность в метрах, если известна. */
  accuracy?: number | null;
}

export interface GeoNote extends LatLng {
  id: string;
  text: string;
  emoji: string;
  /** Радиус срабатывания в метрах. */
  radius: number;
  repeat: Repeat;
  createdAt: string;
}

/** Что мы помним о каждой заметке между проверками позиции. */
export interface TriggerEntry {
  inside: boolean;
  lastFiredAt?: number;
}

export type TriggerState = Record<string, TriggerEntry>;

export interface Settings {
  backgroundEnabled: boolean;
  cooldownMinutes: number;
}
