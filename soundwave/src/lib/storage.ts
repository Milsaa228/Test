import AsyncStorage from '@react-native-async-storage/async-storage';

import { EMPTY_LIBRARY } from './library';
import type { LibraryState, RepeatMode } from './types';

const LIBRARY_KEY = 'soundwave:library:v1';
const PLAYER_KEY = 'soundwave:player:v1';

export type PlayerPrefs = { shuffle: boolean; repeat: RepeatMode; lastTrackId?: string };

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

export const loadLibrary = () => readJson<LibraryState>(LIBRARY_KEY, EMPTY_LIBRARY);
export const saveLibrary = (s: LibraryState) => AsyncStorage.setItem(LIBRARY_KEY, JSON.stringify(s)).catch(() => {});

export const loadPlayerPrefs = () => readJson<PlayerPrefs>(PLAYER_KEY, { shuffle: false, repeat: 'off' });
export const savePlayerPrefs = (p: PlayerPrefs) => AsyncStorage.setItem(PLAYER_KEY, JSON.stringify(p)).catch(() => {});
