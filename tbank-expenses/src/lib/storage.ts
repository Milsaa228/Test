import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { ChatTurn, Settings, Transaction } from './types';

const TX_KEY = 'transactions.v1';
const SETTINGS_KEY = 'settings.v1';
const TOKEN_KEY = 'tbank_api_token';
const CLAUDE_KEY = 'claude_api_key';
const CHAT_KEY = 'assistant_chat.v1';
/** Сколько последних реплик чата храним (и отправляем модели). */
export const CHAT_LIMIT = 40;

export const DEFAULT_SETTINGS: Settings = { includeTransfers: false };

export async function loadTransactions(): Promise<Transaction[]> {
  const raw = await AsyncStorage.getItem(TX_KEY);
  return raw ? (JSON.parse(raw) as Transaction[]) : [];
}

export async function saveTransactions(txs: Transaction[]): Promise<void> {
  await AsyncStorage.setItem(TX_KEY, JSON.stringify(txs));
}

export async function loadSettings(): Promise<Settings> {
  const raw = await AsyncStorage.getItem(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(raw ? JSON.parse(raw) : {}) };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// Токен храним в Keychain / Keystore. На web SecureStore недоступен — токен не сохраняется.
export async function loadToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function saveToken(token: string | null): Promise<void> {
  if (Platform.OS === 'web') return;
  if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

// Ключ Claude: на iOS/Android — в Keychain / Keystore, на web — только в памяти до перезагрузки страницы.
let webClaudeKey: string | null = null;

export async function loadClaudeKey(): Promise<string | null> {
  if (Platform.OS === 'web') return webClaudeKey;
  return SecureStore.getItemAsync(CLAUDE_KEY);
}

export async function saveClaudeKey(key: string | null): Promise<void> {
  if (Platform.OS === 'web') {
    webClaudeKey = key;
    return;
  }
  if (key) await SecureStore.setItemAsync(CLAUDE_KEY, key);
  else await SecureStore.deleteItemAsync(CLAUDE_KEY);
}

export async function loadChat(): Promise<ChatTurn[]> {
  const raw = await AsyncStorage.getItem(CHAT_KEY);
  return raw ? (JSON.parse(raw) as ChatTurn[]) : [];
}

export async function saveChat(turns: ChatTurn[]): Promise<void> {
  if (turns.length) await AsyncStorage.setItem(CHAT_KEY, JSON.stringify(turns.slice(-CHAT_LIMIT)));
  else await AsyncStorage.removeItem(CHAT_KEY);
}

export async function clearAll(): Promise<void> {
  await AsyncStorage.multiRemove([TX_KEY, SETTINGS_KEY, CHAT_KEY]);
  await saveToken(null);
  await saveClaudeKey(null);
}
