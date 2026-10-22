import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { colorsFor, EMPTY_LIBRARY, libraryReducer, parseFileName, trackIndex, type LibraryAction } from '../lib/library';
import { loadLibrary, saveLibrary } from '../lib/storage';
import type { LibraryState, Track } from '../lib/types';

type LibraryCtx = {
  state: LibraryState;
  ready: boolean;
  tracks: Map<string, Track>;
  dispatch: (a: LibraryAction) => void;
  isLiked: (id: string) => boolean;
  createPlaylist: (name: string, trackIds?: string[]) => string;
  importFiles: () => Promise<number>;
  removeLocal: (id: string) => void;
};

const Ctx = createContext<LibraryCtx | null>(null);

const MUSIC_DIR = 'music';
const isNative = Platform.OS !== 'web';

/** Путь к папке приложения на iOS меняется после обновлений, поэтому восстанавливаем URI по имени файла. */
function relinkLocal(t: Track): Track {
  if (!t.local || !isNative) return t;
  try {
    const name = decodeURIComponent(t.uri.split('/').pop() ?? '');
    return { ...t, uri: new File(Paths.document, MUSIC_DIR, name).uri };
  } catch {
    return t;
  }
}

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(libraryReducer, EMPTY_LIBRARY);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadLibrary().then((s) => {
      dispatch({ type: 'load', state: { ...s, localTracks: s.localTracks.map(relinkLocal) } });
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (ready) saveLibrary(state);
  }, [state, ready]);

  const tracks = useMemo(() => trackIndex(state), [state]);
  const liked = useMemo(() => new Set(state.liked), [state.liked]);
  const isLiked = useCallback((id: string) => liked.has(id), [liked]);

  const createPlaylist = useCallback((name: string, trackIds?: string[]) => {
    const id = `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    dispatch({ type: 'createPlaylist', id, name, now: Date.now(), trackIds });
    return id;
  }, []);

  const importFiles = useCallback(async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: 'audio/*', multiple: true, copyToCacheDirectory: true });
    if (res.canceled) return 0;
    let dir: Directory | null = null;
    if (isNative) {
      dir = new Directory(Paths.document, MUSIC_DIR);
      if (!dir.exists) dir.create({ intermediates: true });
    }
    const stamp = Date.now().toString(36);
    const added: Track[] = res.assets.map((asset, i) => {
      const meta = parseFileName(asset.name);
      let uri = asset.uri;
      if (dir) {
        // Кэш может очистить система — копируем файл в постоянную папку приложения.
        const safe = asset.name.replace(/[^\p{L}\p{N}._ -]/gu, '_');
        const dest = new File(dir, `${stamp}-${i}-${safe}`);
        new File(asset.uri).copySync(dest);
        uri = dest.uri;
      }
      return {
        id: `local-${stamp}-${i}`,
        title: meta.title,
        artist: meta.artist,
        album: 'Файлы на устройстве',
        uri,
        colors: colorsFor(asset.name),
        local: true,
      };
    });
    dispatch({ type: 'addLocal', tracks: added });
    return added.length;
  }, []);

  const removeLocal = useCallback(
    (id: string) => {
      const t = state.localTracks.find((x) => x.id === id);
      if (t && isNative) {
        try {
          new File(t.uri).delete();
        } catch {
          // файл уже удалён — достаточно убрать запись
        }
      }
      dispatch({ type: 'removeLocal', id });
    },
    [state.localTracks],
  );

  const value = useMemo(
    () => ({ state, ready, tracks, dispatch, isLiked, createPlaylist, importFiles, removeLocal }),
    [state, ready, tracks, isLiked, createPlaylist, importFiles, removeLocal],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLibrary() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useLibrary outside LibraryProvider');
  return ctx;
}
