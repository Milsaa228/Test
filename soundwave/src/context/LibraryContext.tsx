import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { audioExtension, netTrackId } from '../lib/archive';
import { colorsFor, EMPTY_LIBRARY, libraryReducer, parseFileName, trackIndex, type LibraryAction } from '../lib/library';
import { loadLibrary, saveLibrary } from '../lib/storage';
import type { LibraryState, Track } from '../lib/types';

type LibraryCtx = {
  state: LibraryState;
  ready: boolean;
  tracks: Map<string, Track>;
  dispatch: (a: LibraryAction) => void;
  isLiked: (id: string) => boolean;
  /** Лайк с автосохранением: трек из интернета попадает в «Мои треки». */
  toggleLike: (track: Track) => void;
  /** Сохраняет трек в медиатеку, если его там нет (для треков из поиска в интернете). */
  remember: (track: Track) => void;
  createPlaylist: (name: string, trackIds?: string[]) => string;
  importFiles: () => Promise<number>;
  removeLocal: (id: string) => void;
  /** Можно ли скачивать файлы (в браузере — нет, там треки сохраняются как поток). */
  canDownload: boolean;
  /** Прогресс скачиваний: id трека → 0…1. */
  downloads: Record<string, number>;
  download: (track: Track) => Promise<Track>;
  /** Трек по прямой ссылке на аудиофайл. */
  trackFromUrl: (url: string) => Track;
};

const Ctx = createContext<LibraryCtx | null>(null);

const MUSIC_DIR = 'music';
const isNative = Platform.OS !== 'web';

/** Путь к папке приложения на iOS меняется после обновлений, поэтому восстанавливаем URI по имени файла. */
function relinkLocal(t: Track): Track {
  if (!t.local || !isNative || !t.uri.startsWith('file:')) return t;
  try {
    const name = decodeURIComponent(t.uri.split('/').pop() ?? '');
    return { ...t, uri: new File(Paths.document, MUSIC_DIR, name).uri };
  } catch {
    return t;
  }
}

function musicDir(): Directory {
  const dir = new Directory(Paths.document, MUSIC_DIR);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

const safeName = (name: string) => name.replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 80);

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(libraryReducer, EMPTY_LIBRARY);
  const [ready, setReady] = useState(false);
  const [downloads, setDownloads] = useState<Record<string, number>>({});
  const inFlight = useRef(new Map<string, Promise<Track>>());

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

  const remember = useCallback(
    (track: Track) => {
      if (!tracks.has(track.id)) dispatch({ type: 'addTracks', tracks: [track] });
    },
    [tracks],
  );

  const toggleLike = useCallback(
    (track: Track) => {
      remember(track);
      dispatch({ type: 'toggleLike', id: track.id });
    },
    [remember],
  );

  const createPlaylist = useCallback((name: string, trackIds?: string[]) => {
    const id = `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    dispatch({ type: 'createPlaylist', id, name, now: Date.now(), trackIds });
    return id;
  }, []);

  const importFiles = useCallback(async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: 'audio/*', multiple: true, copyToCacheDirectory: true });
    if (res.canceled) return 0;
    const dir = isNative ? musicDir() : null;
    const stamp = Date.now().toString(36);
    const added: Track[] = res.assets.map((asset, i) => {
      const meta = parseFileName(asset.name);
      let uri = asset.uri;
      if (dir) {
        // Кэш может очистить система — копируем файл в постоянную папку приложения.
        const dest = new File(dir, `${stamp}-${i}-${safeName(asset.name)}`);
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
    dispatch({ type: 'addTracks', tracks: added });
    return added.length;
  }, []);

  const download = useCallback((track: Track): Promise<Track> => {
    if (!isNative) {
      // В браузере файл сохранить нельзя — запоминаем трек как поток.
      const t = { ...track, online: true };
      dispatch({ type: 'addTracks', tracks: [t] });
      return Promise.resolve(t);
    }
    const running = inFlight.current.get(track.id);
    if (running) return running;
    const job = (async () => {
      const url = track.uri;
      const dest = new File(musicDir(), `${Date.now().toString(36)}-${safeName(`${track.artist} - ${track.title}`)}.${audioExtension(url)}`);
      setDownloads((d) => ({ ...d, [track.id]: 0 }));
      try {
        const task = File.createDownloadTask(url, dest, {
          onProgress: ({ bytesWritten, totalBytes }) => {
            if (totalBytes > 0) setDownloads((d) => ({ ...d, [track.id]: bytesWritten / totalBytes }));
          },
        });
        const file = await task.downloadAsync();
        if (!file) throw new Error('Загрузка прервана');
        const saved: Track = { ...track, uri: file.uri, local: true, online: false, sourceUrl: track.sourceUrl ?? url };
        dispatch({ type: 'addTracks', tracks: [saved] });
        return saved;
      } catch (e) {
        try {
          if (dest.exists) dest.delete();
        } catch {
          // недокачанный файл не удалился — не критично
        }
        throw e;
      } finally {
        inFlight.current.delete(track.id);
        setDownloads(({ [track.id]: _done, ...rest }) => rest);
      }
    })();
    inFlight.current.set(track.id, job);
    return job;
  }, []);

  const trackFromUrl = useCallback((url: string): Track => {
    const last = decodeURIComponent(url.split(/[?#]/)[0].split('/').pop() || 'Трек');
    const meta = parseFileName(last);
    let host = 'Из интернета';
    try {
      host = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      // некорректный URL отсеется при проверке
    }
    return {
      id: netTrackId(url),
      title: meta.title,
      artist: meta.artist === 'Неизвестный исполнитель' ? host : meta.artist,
      album: 'Из интернета',
      uri: url,
      colors: colorsFor(url),
      online: true,
      sourceUrl: url,
    };
  }, []);

  const removeLocal = useCallback(
    (id: string) => {
      const t = state.localTracks.find((x) => x.id === id);
      if (t?.local && isNative && t.uri.startsWith('file:')) {
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
    () => ({
      state,
      ready,
      tracks,
      dispatch,
      isLiked,
      toggleLike,
      remember,
      createPlaylist,
      importFiles,
      removeLocal,
      canDownload: isNative,
      downloads,
      download,
      trackFromUrl,
    }),
    [state, ready, tracks, isLiked, toggleLike, remember, createPlaylist, importFiles, removeLocal, downloads, download, trackFromUrl],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLibrary() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useLibrary outside LibraryProvider');
  return ctx;
}
