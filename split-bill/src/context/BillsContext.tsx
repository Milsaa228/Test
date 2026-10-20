import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import type { AiConfig } from '../lib/ai';
import { newId } from '../lib/split';
import * as storage from '../lib/storage';
import type { Bill, Settings } from '../lib/types';

interface BillsContextValue {
  ready: boolean;
  bills: Bill[];
  settings: Settings;
  apiKey: string;
  /** Готовые настройки для запросов к модели. */
  ai: AiConfig;
  createBill: (patch?: Partial<Bill>) => Promise<Bill>;
  updateBill: (id: string, patch: Partial<Bill> | ((bill: Bill) => Partial<Bill>)) => Promise<void>;
  deleteBill: (id: string) => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  setApiKey: (key: string) => Promise<void>;
  clear: () => Promise<void>;
}

const BillsContext = createContext<BillsContextValue | null>(null);

export function BillsProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [bills, setBills] = useState<Bill[]>([]);
  const [settings, setSettings] = useState<Settings>(storage.DEFAULT_SETTINGS);
  const [apiKey, setKey] = useState('');

  // Актуальные значения для асинхронных действий; меняются только вместе с setState ниже.
  const billsRef = useRef<Bill[]>([]);
  const settingsRef = useRef<Settings>(storage.DEFAULT_SETTINGS);

  useEffect(() => {
    Promise.all([storage.loadBills(), storage.loadSettings(), storage.loadApiKey()])
      .then(([b, s, k]) => {
        billsRef.current = b;
        settingsRef.current = s;
        setBills(b);
        setSettings(s);
        setKey(k ?? '');
      })
      .finally(() => setReady(true));
  }, []);

  const commit = useCallback(async (next: Bill[]) => {
    billsRef.current = next;
    setBills(next);
    await storage.saveBills(next);
  }, []);

  const createBill = useCallback(
    async (patch: Partial<Bill> = {}) => {
      const me = { id: newId(), name: settingsRef.current.myName.trim() || 'Я' };
      const bill: Bill = {
        id: newId(),
        title: 'Новый счёт',
        createdAt: new Date().toISOString(),
        people: [me],
        items: [],
        tipPercent: 0,
        payerId: me.id,
        ...patch,
      };
      await commit([bill, ...billsRef.current]);
      return bill;
    },
    [commit],
  );

  const updateBill = useCallback(
    async (id: string, patch: Partial<Bill> | ((bill: Bill) => Partial<Bill>)) => {
      await commit(billsRef.current.map((b) => (b.id === id ? { ...b, ...(typeof patch === 'function' ? patch(b) : patch) } : b)));
    },
    [commit],
  );

  const deleteBill = useCallback(async (id: string) => commit(billsRef.current.filter((b) => b.id !== id)), [commit]);

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setSettings(next);
    await storage.saveSettings(next);
  }, []);

  const setApiKey = useCallback(async (key: string) => {
    const value = key.trim();
    setKey(value);
    await storage.saveApiKey(value || null);
  }, []);

  const clear = useCallback(async () => {
    await storage.clearAll();
    billsRef.current = [];
    settingsRef.current = storage.DEFAULT_SETTINGS;
    setBills([]);
    setSettings(storage.DEFAULT_SETTINGS);
    setKey('');
  }, []);

  const ai = useMemo(() => ({ apiKey, baseUrl: settings.aiBaseUrl, model: settings.aiModel }), [apiKey, settings.aiBaseUrl, settings.aiModel]);

  const value = useMemo(
    () => ({ ready, bills, settings, apiKey, ai, createBill, updateBill, deleteBill, updateSettings, setApiKey, clear }),
    [ready, bills, settings, apiKey, ai, createBill, updateBill, deleteBill, updateSettings, setApiKey, clear],
  );

  return <BillsContext.Provider value={value}>{children}</BillsContext.Provider>;
}

export function useBills(): BillsContextValue {
  const ctx = useContext(BillsContext);
  if (!ctx) throw new Error('useBills must be used inside BillsProvider');
  return ctx;
}
