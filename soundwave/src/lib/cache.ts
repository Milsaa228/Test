import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'soundwave:cache:';

/** Значение из кэша, если оно моложе maxAgeMs; иначе загружает и сохраняет. При ошибке сети отдаёт устаревшее. */
export async function cached<T>(key: string, maxAgeMs: number, loader: () => Promise<T>): Promise<T> {
  let stale: T | undefined;
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    if (raw) {
      const { at, value } = JSON.parse(raw) as { at: number; value: T };
      if (Date.now() - at < maxAgeMs) return value;
      stale = value;
    }
  } catch {
    // повреждённый кэш просто перезапишем
  }
  try {
    const value = await loader();
    AsyncStorage.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), value })).catch(() => {});
    return value;
  } catch (e) {
    if (stale !== undefined) return stale;
    throw e;
  }
}

export async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export const writeJson = (key: string, value: unknown) => AsyncStorage.setItem(PREFIX + key, JSON.stringify(value)).catch(() => {});
export const removeKey = (key: string) => AsyncStorage.removeItem(PREFIX + key).catch(() => {});
