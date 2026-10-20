import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { Product, Recipe, Settings } from './types';

const PRODUCTS_KEY = 'products.v1';
const SUGGESTIONS_KEY = 'suggestions.v1';
const FAVORITES_KEY = 'favorites.v1';
const SETTINGS_KEY = 'settings.v1';
const API_KEY = 'anthropic_api_key';

export const DEFAULT_SETTINGS: Settings = {
  diet: 'обычная',
  exclusions: '',
  maxMinutes: 30,
  servings: 2,
  notifications: false,
};

async function loadJson<T>(key: string, fallback: T): Promise<T> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export const loadProducts = () => loadJson<Product[]>(PRODUCTS_KEY, []);
export const saveProducts = (v: Product[]) => AsyncStorage.setItem(PRODUCTS_KEY, JSON.stringify(v));
export const loadSuggestions = () => loadJson<Recipe[]>(SUGGESTIONS_KEY, []);
export const saveSuggestions = (v: Recipe[]) => AsyncStorage.setItem(SUGGESTIONS_KEY, JSON.stringify(v));
export const loadFavorites = () => loadJson<Recipe[]>(FAVORITES_KEY, []);
export const saveFavorites = (v: Recipe[]) => AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(v));

export async function loadSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...(await loadJson<Partial<Settings>>(SETTINGS_KEY, {})) };
}

export const saveSettings = (v: Settings) => AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(v));

// Ключ храним в Keychain / Keystore. На web SecureStore недоступен, поэтому ключ лежит в localStorage
// (через AsyncStorage) — это менее надёжно, web-версия нужна в основном для разработки.
export async function loadApiKey(): Promise<string | null> {
  if (Platform.OS === 'web') return AsyncStorage.getItem(API_KEY);
  return SecureStore.getItemAsync(API_KEY);
}

export async function saveApiKey(key: string | null): Promise<void> {
  if (Platform.OS === 'web') {
    if (key) await AsyncStorage.setItem(API_KEY, key);
    else await AsyncStorage.removeItem(API_KEY);
    return;
  }
  if (key) await SecureStore.setItemAsync(API_KEY, key);
  else await SecureStore.deleteItemAsync(API_KEY);
}

export async function clearAll(): Promise<void> {
  await AsyncStorage.multiRemove([PRODUCTS_KEY, SUGGESTIONS_KEY, FAVORITES_KEY, SETTINGS_KEY]);
  await saveApiKey(null);
}
