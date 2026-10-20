import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { DEFAULT_AI, type AiConfig } from '../lib/ai';
import { consumeIngredients, consumeOne, mergeProducts } from '../lib/inventory';
import { rescheduleDigest } from '../lib/notifications';
import * as storage from '../lib/storage';
import type { Product, Recipe, Settings } from '../lib/types';

interface DataContextValue {
  ready: boolean;
  products: Product[];
  suggestions: Recipe[];
  favorites: Recipe[];
  settings: Settings;
  apiKey: string;
  /** Готовые настройки для запросов к нейросети. */
  ai: AiConfig;
  setApiKey: (key: string) => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  addProducts: (incoming: Product[]) => Promise<{ added: number; updated: number }>;
  saveProduct: (product: Product) => Promise<void>;
  removeProduct: (id: string) => Promise<void>;
  markUsed: (id: string) => Promise<void>;
  cook: (recipe: Recipe) => Promise<{ removed: string[]; decreased: string[] }>;
  setSuggestions: (recipes: Recipe[]) => Promise<void>;
  toggleFavorite: (recipe: Recipe) => Promise<void>;
  findRecipe: (id: string) => Recipe | undefined;
  clear: () => Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [suggestions, setSuggestionsState] = useState<Recipe[]>([]);
  const [favorites, setFavorites] = useState<Recipe[]>([]);
  const [settings, setSettings] = useState<Settings>(storage.DEFAULT_SETTINGS);
  const [apiKey, setApiKeyState] = useState('');

  // Актуальные значения для асинхронных действий; меняются только вместе с setState ниже.
  const productsRef = useRef<Product[]>([]);
  const favoritesRef = useRef<Recipe[]>([]);
  const settingsRef = useRef<Settings>(storage.DEFAULT_SETTINGS);

  useEffect(() => {
    Promise.all([storage.loadProducts(), storage.loadSuggestions(), storage.loadFavorites(), storage.loadSettings(), storage.loadApiKey()])
      .then(([p, s, f, st, key]) => {
        productsRef.current = p;
        favoritesRef.current = f;
        settingsRef.current = st;
        setProducts(p);
        setSuggestionsState(s);
        setFavorites(f);
        setSettings(st);
        setApiKeyState(key ?? '');
      })
      .catch((e) => console.warn('Не удалось загрузить данные', e))
      .finally(() => setReady(true));
  }, []);

  // Напоминание перепланируется при запуске и при любом изменении продуктов или настроек.
  useEffect(() => {
    if (ready) rescheduleDigest(products, settings.notifications);
  }, [ready, products, settings.notifications]);

  const commitProducts = useCallback(async (next: Product[]) => {
    productsRef.current = next;
    setProducts(next);
    await storage.saveProducts(next);
  }, []);

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setSettings(next);
    await storage.saveSettings(next);
  }, []);

  const setApiKey = useCallback(async (key: string) => {
    const trimmed = key.trim();
    await storage.saveApiKey(trimmed || null);
    setApiKeyState(trimmed);
  }, []);

  const addProducts = useCallback(
    async (incoming: Product[]) => {
      const { merged, added, updated } = mergeProducts(productsRef.current, incoming);
      await commitProducts(merged);
      return { added, updated };
    },
    [commitProducts],
  );

  const saveProduct = useCallback(
    async (product: Product) => {
      const exists = productsRef.current.some((p) => p.id === product.id);
      await commitProducts(exists ? productsRef.current.map((p) => (p.id === product.id ? product : p)) : [...productsRef.current, product]);
    },
    [commitProducts],
  );

  const removeProduct = useCallback(
    (id: string) => commitProducts(productsRef.current.filter((p) => p.id !== id)),
    [commitProducts],
  );

  const markUsed = useCallback((id: string) => commitProducts(consumeOne(productsRef.current, id)), [commitProducts]);

  const cook = useCallback(
    async (recipe: Recipe) => {
      const res = consumeIngredients(productsRef.current, recipe.uses);
      await commitProducts(res.products);
      return { removed: res.removed, decreased: res.decreased };
    },
    [commitProducts],
  );

  const setSuggestions = useCallback(async (recipes: Recipe[]) => {
    setSuggestionsState(recipes);
    await storage.saveSuggestions(recipes);
  }, []);

  const toggleFavorite = useCallback(async (recipe: Recipe) => {
    const has = favoritesRef.current.some((r) => r.id === recipe.id);
    const next = has ? favoritesRef.current.filter((r) => r.id !== recipe.id) : [recipe, ...favoritesRef.current];
    favoritesRef.current = next;
    setFavorites(next);
    await storage.saveFavorites(next);
  }, []);

  const findRecipe = useCallback(
    (id: string) => suggestions.find((r) => r.id === id) ?? favorites.find((r) => r.id === id),
    [suggestions, favorites],
  );

  const clear = useCallback(async () => {
    await storage.clearAll();
    productsRef.current = [];
    favoritesRef.current = [];
    settingsRef.current = storage.DEFAULT_SETTINGS;
    setProducts([]);
    setSuggestionsState([]);
    setFavorites([]);
    setSettings(storage.DEFAULT_SETTINGS);
    setApiKeyState('');
  }, []);

  // Пустые поля «Для продвинутых» означают настройки по умолчанию (OpenRouter, автовыбор модели).
  const ai = useMemo(
    () => ({ apiKey, baseUrl: settings.aiBaseUrl || DEFAULT_AI.baseUrl, model: settings.aiModel || DEFAULT_AI.model }),
    [apiKey, settings.aiBaseUrl, settings.aiModel],
  );

  const value = useMemo(
    () => ({
      ready, products, suggestions, favorites, settings, apiKey, ai, setApiKey, updateSettings, addProducts, saveProduct,
      removeProduct, markUsed, cook, setSuggestions, toggleFavorite, findRecipe, clear,
    }),
    [ready, products, suggestions, favorites, settings, apiKey, ai, setApiKey, updateSettings, addProducts, saveProduct,
      removeProduct, markUsed, cook, setSuggestions, toggleFavorite, findRecipe, clear],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside DataProvider');
  return ctx;
}
