import AsyncStorage from '@react-native-async-storage/async-storage';

import type { GeoNote, Settings, TriggerState } from './types';

const NOTES_KEY = 'notes.v1';
const SETTINGS_KEY = 'settings.v1';
const TRIGGERS_KEY = 'triggers.v1';

export const DEFAULT_SETTINGS: Settings = { backgroundEnabled: false, cooldownMinutes: 60 };

async function load<T>(key: string, fallback: T): Promise<T> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export const loadNotes = () => load<GeoNote[]>(NOTES_KEY, []);
export const saveNotes = (notes: GeoNote[]) => AsyncStorage.setItem(NOTES_KEY, JSON.stringify(notes));

export async function loadSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...(await load<Partial<Settings>>(SETTINGS_KEY, {})) };
}
export const saveSettings = (s: Settings) => AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(s));

// Состояние срабатываний пишут и экран, и фоновая задача — поэтому оно тоже в хранилище.
export const loadTriggers = () => load<TriggerState>(TRIGGERS_KEY, {});
export const saveTriggers = (s: TriggerState) => AsyncStorage.setItem(TRIGGERS_KEY, JSON.stringify(s));

export async function clearAll(): Promise<void> {
  await AsyncStorage.multiRemove([NOTES_KEY, SETTINGS_KEY, TRIGGERS_KEY]);
}
