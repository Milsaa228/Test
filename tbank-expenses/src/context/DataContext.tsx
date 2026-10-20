import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { importTbankCsv } from '../lib/csvImport';
import { generateDemo } from '../lib/demo';
import { decodeText, base64ToBytes } from '../lib/encoding';
import { mergeTransactions, monthKey } from '../lib/stats';
import * as storage from '../lib/storage';
import { fetchStatement } from '../lib/tbankApi';
import type { Settings, Transaction } from '../lib/types';

interface DataContextValue {
  ready: boolean;
  transactions: Transaction[];
  settings: Settings;
  month: string;
  setMonth: (month: string) => void;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  importCsvBase64: (base64: string) => Promise<{ added: number; skipped: number }>;
  syncApi: (token: string, accountNumber: string, monthsBack: number, onProgress?: (n: number) => void) => Promise<number>;
  loadDemo: () => Promise<void>;
  clear: () => Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [settings, setSettings] = useState<Settings>(storage.DEFAULT_SETTINGS);
  const [month, setMonth] = useState(() => monthKey(new Date()));

  // Актуальные значения для асинхронных действий; меняются только вместе с setState ниже.
  const txRef = useRef<Transaction[]>([]);
  const settingsRef = useRef<Settings>(storage.DEFAULT_SETTINGS);

  useEffect(() => {
    Promise.all([storage.loadTransactions(), storage.loadSettings()])
      .then(([txs, s]) => {
        txRef.current = txs;
        settingsRef.current = s;
        setTransactions(txs);
        setSettings(s);
      })
      .finally(() => setReady(true));
  }, []);

  /** Сохраняет операции. Реальные данные не смешиваем с демо: при импорте демо удаляется. */
  const commit = useCallback(async (incoming: Transaction[], replace = false) => {
    const base = replace ? [] : txRef.current.filter((t) => t.source !== 'demo');
    const { merged, added } = mergeTransactions(base, incoming);
    txRef.current = merged;
    setTransactions(merged);
    await storage.saveTransactions(merged);
    return added;
  }, []);

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setSettings(next);
    await storage.saveSettings(next);
  }, []);

  const importCsvBase64 = useCallback(
    async (base64: string) => {
      const { transactions: parsed, skipped } = importTbankCsv(decodeText(base64ToBytes(base64)));
      const added = await commit(parsed);
      return { added, skipped };
    },
    [commit],
  );

  const syncApi = useCallback(
    async (token: string, accountNumber: string, monthsBack: number, onProgress?: (n: number) => void) => {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth() - monthsBack + 1, 1);
      const ops = await fetchStatement(token, accountNumber, from, now, onProgress);
      const added = await commit(ops);
      await updateSettings({ accountNumber, lastSyncAt: now.toISOString() });
      return added;
    },
    [commit, updateSettings],
  );

  const loadDemo = useCallback(async () => {
    await commit(generateDemo(), true);
  }, [commit]);

  const clear = useCallback(async () => {
    await storage.clearAll();
    txRef.current = [];
    settingsRef.current = storage.DEFAULT_SETTINGS;
    setTransactions([]);
    setSettings(storage.DEFAULT_SETTINGS);
  }, []);

  const value = useMemo(
    () => ({ ready, transactions, settings, month, setMonth, updateSettings, importCsvBase64, syncApi, loadDemo, clear }),
    [ready, transactions, settings, month, updateSettings, importCsvBase64, syncApi, loadDemo, clear],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside DataProvider');
  return ctx;
}
