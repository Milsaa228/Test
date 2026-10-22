import { router } from 'expo-router';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Cover } from '../components/Cover';
import { Icon, type IconName } from '../components/Icon';
import { NamePrompt } from '../components/NamePrompt';
import { Sheet } from '../components/Sheet';
import { colors } from '../components/theme';
import { albumKey, tracksLabel } from '../lib/library';
import { openArtist } from '../lib/nav';
import type { Track } from '../lib/types';
import { useLibrary } from './LibraryContext';
import { usePlayer } from './PlayerContext';
import { useReco } from './RecoContext';

type MenuTarget = {
  track: Track;
  /** Пользовательский плейлист и позиция трека в нём — для «Удалить из плейлиста». */
  playlistId?: string;
  index?: number;
};

type Ctx = {
  openTrackMenu: (t: MenuTarget) => void;
  showToast: (text: string) => void;
  /** Добавляет трек по прямой ссылке: в приложении скачивает файл, в браузере сохраняет поток. */
  addFromUrl: (url: string) => Promise<void>;
};

/** Проверка ссылки до скачивания: адрес http(s) и, если сервер ответил на HEAD, — не HTML-страница. */
export async function checkAudioUrl(raw: string): Promise<string> {
  const url = raw.trim();
  if (!/^https?:\/\/\S+$/i.test(url)) throw new Error('Нужна ссылка вида https://…/трек.mp3');
  try {
    const res = await fetch(url, { method: 'HEAD' });
    const type = res.headers.get('content-type') ?? '';
    if (res.ok && /text\/html/i.test(type)) throw new Error('По ссылке веб-страница, а не аудиофайл. Нужна прямая ссылка на MP3, M4A, OGG и т.п.');
    if (res.status === 404) throw new Error('Файл по ссылке не найден (404)');
  } catch (e) {
    // Сеть или CORS могут не пустить HEAD — тогда проверим при скачивании/воспроизведении.
    if (e instanceof Error && /страница|404/.test(e.message)) throw e;
  }
  return url;
}
const TrackMenuCtx = createContext<Ctx | null>(null);

export function TrackMenuProvider({ children }: { children: ReactNode }) {
  const library = useLibrary();
  const player = usePlayer();
  const reco = useReco();
  const [target, setTarget] = useState<MenuTarget | null>(null);
  const [mode, setMode] = useState<'menu' | 'playlists' | 'new'>('menu');
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((text: string) => {
    setToast(text);
    setTimeout(() => setToast((t) => (t === text ? null : t)), 2200);
  }, []);

  const openTrackMenu = useCallback((t: MenuTarget) => {
    setMode('menu');
    setTarget(t);
  }, []);

  const close = () => setTarget(null);
  const track = target?.track;
  const liked = track ? library.isLiked(track.id) : false;
  const saved = track ? library.tracks.get(track.id) : undefined;
  const downloading = track ? library.downloads[track.id] != null : false;

  const startDownload = (t: typeof track) => {
    if (!t) return;
    showToast('Скачивание началось');
    library
      .download(t)
      .then(() => showToast(`«${t.title}» сохранён на устройстве`))
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        if (Platform.OS === 'web') showToast('Не удалось скачать трек');
        else Alert.alert('Не удалось скачать трек', msg);
      });
  };

  const go = (href: string) => {
    close();
    router.push({ pathname: '/collection/[id]', params: { id: href } });
  };

  const actions: { icon: IconName; label: string; onPress: () => void; color?: string }[] = track
    ? [
        {
          icon: liked ? 'heart' : 'heartOutline',
          label: liked ? 'Удалить из любимых' : 'Добавить в любимые',
          color: liked ? colors.accent : undefined,
          onPress: () => {
            library.toggleLike(track);
            showToast(liked ? 'Удалено из любимых' : 'Добавлено в любимые');
            close();
          },
        },
        { icon: 'plus', label: 'Добавить в плейлист', onPress: () => setMode('playlists') },
        ...(track.online && !saved
          ? [
              {
                icon: 'library' as const,
                label: 'Сохранить в «Мои треки»',
                onPress: () => {
                  library.remember(track);
                  showToast('Сохранено в «Мои треки»');
                  close();
                },
              },
            ]
          : []),
        ...(track.online && !(saved ?? track).local && library.canDownload
          ? [
              {
                icon: 'download' as const,
                label: downloading ? 'Скачивается…' : 'Скачать на устройство',
                onPress: () => {
                  if (!downloading) startDownload(saved ?? track);
                  close();
                },
              },
            ]
          : []),
        {
          icon: 'addQueue',
          label: 'Играть следующим',
          onPress: () => {
            player.playNext(track);
            showToast('Трек будет следующим');
            close();
          },
        },
        ...(target?.playlistId != null && target.index != null
          ? [
              {
                icon: 'trash' as const,
                label: 'Удалить из этого плейлиста',
                onPress: () => {
                  library.dispatch({ type: 'removeFromPlaylist', playlistId: target.playlistId!, index: target.index! });
                  close();
                },
              },
            ]
          : []),
        {
          icon: 'thumbDown',
          label: 'Не нравится',
          onPress: () => {
            reco.dislike(track);
            showToast('Больше не будем предлагать этот трек');
            close();
          },
        },
        ...(!library.offline
          ? [
              {
                icon: 'wave' as const,
                label: 'Плейлист по треку',
                onPress: () => {
                  close();
                  reco.openRadio({ kind: 'track', track });
                },
              },
              {
                icon: 'wave' as const,
                label: 'Плейлист по исполнителю',
                onPress: () => {
                  close();
                  reco.openRadio({ kind: 'artist', name: track.artist, tags: track.tags });
                },
              },
            ]
          : []),
        {
          icon: 'user' as const,
          label: 'К исполнителю',
          onPress: () => {
            close();
            openArtist(track.artist);
          },
        },
        ...(saved && !track.local && !track.online
          ? [{ icon: 'disc' as const, label: 'К альбому', onPress: () => go(albumKey(track.artist, track.album)) }]
          : []),
        ...(track.sourceUrl
          ? [
              {
                icon: 'globe' as const,
                label: 'Страница источника',
                onPress: () => {
                  close();
                  Linking.openURL(track.sourceUrl!).catch(() => {});
                },
              },
            ]
          : []),
        ...(saved && (track.local || track.online)
          ? [
              {
                icon: 'trash' as const,
                label: saved.local ? 'Удалить файл из приложения' : 'Удалить из «Мои треки»',
                color: colors.danger,
                onPress: () => {
                  library.removeLocal(track.id);
                  close();
                },
              },
            ]
          : []),
      ]
    : [];

  const addTo = (playlistId: string, name: string) => {
    if (!track) return;
    library.remember(track);
    const p = library.state.playlists.find((x) => x.id === playlistId);
    if (p?.trackIds.includes(track.id)) showToast(`Уже есть в «${name}»`);
    else {
      library.dispatch({ type: 'addToPlaylist', playlistId, trackId: track.id });
      showToast(`Добавлено в «${name}»`);
    }
    close();
  };

  const { trackFromUrl, download, remember, canDownload } = library;
  const addFromUrl = useCallback(
    async (raw: string) => {
      const url = await checkAudioUrl(raw);
      const t = trackFromUrl(url);
      if (!canDownload) {
        remember(t);
        showToast(`«${t.title}» добавлен в «Мои треки»`);
        return;
      }
      showToast('Скачивание началось');
      await download(t);
      showToast(`«${t.title}» сохранён на устройстве`);
    },
    [trackFromUrl, download, remember, canDownload, showToast],
  );

  const value = useMemo(() => ({ openTrackMenu, showToast, addFromUrl }), [openTrackMenu, showToast, addFromUrl]);

  return (
    <TrackMenuCtx.Provider value={value}>
      {children}
      <Sheet visible={!!track && mode !== 'new'} onClose={close}>
        {track && (
          <View style={styles.head}>
            <Cover colors={track.colors} size={48} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={1}>
                {track.title}
              </Text>
              <Text style={styles.sub} numberOfLines={1}>
                {track.artist}
              </Text>
            </View>
          </View>
        )}
        {mode === 'menu' ? (
          <ScrollView>
            {actions.map((a) => (
              <Pressable key={a.label} onPress={a.onPress} style={({ pressed }) => [styles.item, pressed && { backgroundColor: colors.card }]}>
                <Icon name={a.icon} size={22} color={a.color ?? colors.muted} />
                <Text style={[styles.itemText, a.color === colors.danger && { color: colors.danger }]}>{a.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <ScrollView>
            <Pressable onPress={() => setMode('new')} style={({ pressed }) => [styles.item, pressed && { backgroundColor: colors.card }]}>
              <View style={styles.newIcon}>
                <Icon name="plus" size={22} color={colors.text} />
              </View>
              <Text style={styles.itemText}>Новый плейлист</Text>
            </Pressable>
            {library.state.playlists.map((p) => (
              <Pressable key={p.id} onPress={() => addTo(p.id, p.name)} style={({ pressed }) => [styles.item, pressed && { backgroundColor: colors.card }]}>
                <Cover colors={p.colors} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemText} numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Text style={styles.sub}>{tracksLabel(p.trackIds.length)}</Text>
                </View>
                {track && p.trackIds.includes(track.id) && <Icon name="check" size={20} color={colors.accent} />}
              </Pressable>
            ))}
          </ScrollView>
        )}
      </Sheet>
      <NamePrompt
        visible={!!track && mode === 'new'}
        title="Новый плейлист"
        onCancel={() => setMode('playlists')}
        onSubmit={(name) => {
          if (!track) return;
          library.remember(track);
          library.createPlaylist(name, [track.id]);
          showToast('Плейлист создан');
          close();
        }}
      />
      {toast && (
        <View pointerEvents="none" style={styles.toastWrap}>
          <Text style={styles.toast}>{toast}</Text>
        </View>
      )}
    </TrackMenuCtx.Provider>
  );
}

export function useTrackMenu() {
  const ctx = useContext(TrackMenuCtx);
  if (!ctx) throw new Error('useTrackMenu outside TrackMenuProvider');
  return ctx;
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border, marginBottom: 4 },
  title: { color: colors.text, fontSize: 16, fontWeight: '600' },
  sub: { color: colors.muted, fontSize: 13, marginTop: 2 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 16, paddingVertical: 13 },
  itemText: { color: colors.text, fontSize: 16 },
  newIcon: { width: 40, height: 40, borderRadius: 4, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  toastWrap: { position: 'absolute', left: 16, right: 16, bottom: 140, alignItems: 'center' },
  toast: { backgroundColor: colors.text, color: colors.bg, fontWeight: '600', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, overflow: 'hidden' },
});
