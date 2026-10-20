import * as Location from 'expo-location';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Linking, Platform } from 'react-native';

import { syncGeofences } from '../lib/background';
import { distanceMeters, isSpent, nearbyTriggers, type Fired } from '../lib/geo';
import { ensureNotificationPermission, notifyNote } from '../lib/notifications';
import { mergeNotes, newId } from '../lib/share';
import * as storage from '../lib/storage';
import type { GeoNote, Position, Settings, TriggerState } from '../lib/types';

/** pending — ещё не спрашивали; blocked — отказано навсегда, помогут только настройки. */
export type LocationStatus = 'pending' | 'granted' | 'denied' | 'blocked' | 'unavailable';

export type NoteInput = Omit<GeoNote, 'id' | 'createdAt'>;

interface NotesContextValue {
  ready: boolean;
  notes: GeoNote[];
  settings: Settings;
  triggers: TriggerState;
  position: Position | null;
  locationStatus: LocationStatus;
  banner: Fired[];
  requestLocation: () => Promise<void>;
  addNote: (input: NoteInput) => Promise<GeoNote>;
  updateNote: (id: string, input: NoteInput) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  importNotes: (incoming: GeoNote[]) => Promise<{ added: number; skipped: number }>;
  rearmNote: (id: string) => Promise<void>;
  resetTriggers: () => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  clear: () => Promise<void>;
  dismissBanner: () => void;
}

const NotesContext = createContext<NotesContextValue | null>(null);

export function NotesProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [notes, setNotes] = useState<GeoNote[]>([]);
  const [settings, setSettings] = useState<Settings>(storage.DEFAULT_SETTINGS);
  const [triggers, setTriggers] = useState<TriggerState>({});
  const [position, setPosition] = useState<Position | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('pending');
  const [banner, setBanner] = useState<Fired[]>([]);

  // Актуальные значения для колбэка слежения; меняются только вместе с setState.
  const notesRef = useRef<GeoNote[]>([]);
  const settingsRef = useRef<Settings>(storage.DEFAULT_SETTINGS);
  const triggersRef = useRef<TriggerState>({});
  const positionRef = useRef<Position | null>(null);
  const watchRef = useRef<Location.LocationSubscription | null>(null);

  const commitTriggers = useCallback(async (next: TriggerState) => {
    triggersRef.current = next;
    setTriggers(next);
    await storage.saveTriggers(next);
  }, []);

  const commitNotes = useCallback(async (next: GeoNote[]) => {
    notesRef.current = next;
    setNotes(next);
    await storage.saveNotes(next);
  }, []);

  const onPosition = useCallback(
    (loc: Location.LocationObject) => {
      const pos: Position = { latitude: loc.coords.latitude, longitude: loc.coords.longitude, accuracy: loc.coords.accuracy };
      positionRef.current = pos;
      setPosition(pos);
      const res = nearbyTriggers(notesRef.current, pos, triggersRef.current, Date.now(), settingsRef.current.cooldownMinutes * 60_000);
      if (JSON.stringify(res.state) !== JSON.stringify(triggersRef.current)) commitTriggers(res.state);
      if (res.fired.length) {
        setBanner(res.fired);
        for (const f of res.fired) notifyNote(f.note, f.distance);
      }
    },
    [commitTriggers],
  );

  const stopWatch = useCallback(() => {
    watchRef.current?.remove();
    watchRef.current = null;
  }, []);

  const startWatch = useCallback(async () => {
    if (watchRef.current) return;
    try {
      watchRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 5000 },
        onPosition,
        () => setLocationStatus('unavailable'),
      );
    } catch {
      setLocationStatus('unavailable');
    }
  }, [onPosition]);

  const applyPermission = useCallback(
    async (perm: Location.LocationPermissionResponse) => {
      if (perm.granted) {
        setLocationStatus('granted');
        await startWatch();
        ensureNotificationPermission();
      } else if (perm.status === Location.PermissionStatus.UNDETERMINED) {
        setLocationStatus('pending');
      } else {
        setLocationStatus(perm.canAskAgain ? 'denied' : 'blocked');
      }
    },
    [startWatch],
  );

  const requestLocation = useCallback(async () => {
    if (locationStatus === 'blocked' && Platform.OS !== 'web') {
      await Linking.openSettings();
      return;
    }
    try {
      await applyPermission(await Location.requestForegroundPermissionsAsync());
    } catch {
      setLocationStatus('unavailable');
    }
  }, [applyPermission, locationStatus]);

  useEffect(() => {
    Promise.all([storage.loadNotes(), storage.loadSettings(), storage.loadTriggers()])
      .then(([n, s, t]) => {
        notesRef.current = n;
        settingsRef.current = s;
        triggersRef.current = t;
        setNotes(n);
        setSettings(s);
        setTriggers(t);
      })
      .finally(() => setReady(true));
  }, []);

  // Разрешение: если ещё не спрашивали — спросим сразу при первом запуске.
  useEffect(() => {
    if (!ready) return;
    Location.getForegroundPermissionsAsync()
      .then((perm) => (perm.granted || !perm.canAskAgain ? perm : Location.requestForegroundPermissionsAsync()))
      .then(applyPermission)
      .catch(() => setLocationStatus('unavailable'));
    return stopWatch;
  }, [ready, applyPermission, stopWatch]);

  // В фоне слежение снимаем (это работа геозон), при возврате перечитываем состояние — его могла менять фоновая задача.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') stopWatch();
      if (state === 'active' && locationStatus === 'granted') {
        storage.loadTriggers().then((t) => {
          triggersRef.current = t;
          setTriggers(t);
          startWatch();
        });
      }
    });
    return () => sub.remove();
  }, [locationStatus, startWatch, stopWatch]);

  // Геозоны зависят от набора заметок и от того, какие «одноразовые» уже сработали.
  const spentKey = notes.filter((n) => isSpent(n, triggers)).map((n) => n.id).join(',');
  useEffect(() => {
    if (ready) syncGeofences(settings.backgroundEnabled, positionRef.current);
  }, [ready, notes, spentKey, settings.backgroundEnabled]);

  /** Чтобы заметка, созданная прямо на месте, не сработала мгновенно — считаем, что мы уже внутри. */
  const armNote = useCallback(
    async (note: GeoNote) => {
      const pos = positionRef.current;
      const inside = !!pos && distanceMeters(pos, note) <= note.radius;
      await commitTriggers({ ...triggersRef.current, [note.id]: { inside } });
    },
    [commitTriggers],
  );

  const addNote = useCallback(
    async (input: NoteInput) => {
      const note: GeoNote = { ...input, id: newId(), createdAt: new Date().toISOString() };
      await commitNotes([note, ...notesRef.current]);
      await armNote(note);
      return note;
    },
    [commitNotes, armNote],
  );

  const updateNote = useCallback(
    async (id: string, input: NoteInput) => {
      const old = notesRef.current.find((n) => n.id === id);
      if (!old) return;
      const next = { ...old, ...input };
      await commitNotes(notesRef.current.map((n) => (n.id === id ? next : n)));
      const moved = old.latitude !== next.latitude || old.longitude !== next.longitude || old.radius !== next.radius;
      if (moved || old.repeat !== next.repeat) await armNote(next);
    },
    [commitNotes, armNote],
  );

  const deleteNote = useCallback(
    async (id: string) => {
      await commitNotes(notesRef.current.filter((n) => n.id !== id));
      const { [id]: _removed, ...rest } = triggersRef.current;
      await commitTriggers(rest);
      setBanner((b) => b.filter((f) => f.note.id !== id));
    },
    [commitNotes, commitTriggers],
  );

  const importNotes = useCallback(
    async (incoming: GeoNote[]) => {
      const { merged, added, skipped } = mergeNotes(notesRef.current, incoming);
      await commitNotes(merged);
      return { added: added.length, skipped };
    },
    [commitNotes],
  );

  const rearmNote = useCallback(
    async (id: string) => {
      const note = notesRef.current.find((n) => n.id === id);
      if (note) await armNote(note);
    },
    [armNote],
  );

  const resetTriggers = useCallback(async () => {
    const next: TriggerState = {};
    for (const [id, e] of Object.entries(triggersRef.current)) next[id] = { inside: e.inside };
    await commitTriggers(next);
  }, [commitTriggers]);

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setSettings(next);
    await storage.saveSettings(next);
  }, []);

  const clear = useCallback(async () => {
    await storage.clearAll();
    notesRef.current = [];
    triggersRef.current = {};
    settingsRef.current = storage.DEFAULT_SETTINGS;
    setNotes([]);
    setTriggers({});
    setSettings(storage.DEFAULT_SETTINGS);
    setBanner([]);
  }, []);

  const dismissBanner = useCallback(() => setBanner([]), []);

  const value = useMemo(
    () => ({
      ready, notes, settings, triggers, position, locationStatus, banner,
      requestLocation, addNote, updateNote, deleteNote, importNotes, rearmNote, resetTriggers, updateSettings, clear, dismissBanner,
    }),
    [
      ready, notes, settings, triggers, position, locationStatus, banner,
      requestLocation, addNote, updateNote, deleteNote, importNotes, rearmNote, resetTriggers, updateSettings, clear, dismissBanner,
    ],
  );

  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>;
}

export function useNotes(): NotesContextValue {
  const ctx = useContext(NotesContext);
  if (!ctx) throw new Error('useNotes must be used inside NotesProvider');
  return ctx;
}
