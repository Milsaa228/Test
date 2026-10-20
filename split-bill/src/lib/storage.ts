import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { DEFAULT_AI } from './ai';
import type { Bill, Settings } from './types';

const BILLS_KEY = 'bills.v1';
const SETTINGS_KEY = 'settings.v1';
const API_KEY = 'ai_api_key';

export const DEFAULT_SETTINGS: Settings = { myName: 'Я', paymentDetails: '', bank: 'Т-Банк', aiBaseUrl: DEFAULT_AI.baseUrl, aiModel: DEFAULT_AI.model };

export async function loadBills(): Promise<Bill[]> {
  const raw = await AsyncStorage.getItem(BILLS_KEY);
  return raw ? (JSON.parse(raw) as Bill[]) : [];
}

export async function saveBills(bills: Bill[]): Promise<void> {
  await AsyncStorage.setItem(BILLS_KEY, JSON.stringify(bills));
}

export async function loadSettings(): Promise<Settings> {
  const raw = await AsyncStorage.getItem(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(raw ? JSON.parse(raw) : {}) };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// API-ключ храним в Keychain / Keystore. На web SecureStore нет — ключ живёт только до перезагрузки страницы.
let webKey: string | null = null;

export async function loadApiKey(): Promise<string | null> {
  if (Platform.OS === 'web') return webKey;
  return SecureStore.getItemAsync(API_KEY);
}

export async function saveApiKey(key: string | null): Promise<void> {
  if (Platform.OS === 'web') {
    webKey = key;
    return;
  }
  if (key) await SecureStore.setItemAsync(API_KEY, key);
  else await SecureStore.deleteItemAsync(API_KEY);
}

export async function clearAll(): Promise<void> {
  await AsyncStorage.multiRemove([BILLS_KEY, SETTINGS_KEY]);
  await saveApiKey(null);
}
