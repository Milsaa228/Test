import { router } from 'expo-router';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Cover } from '../components/Cover';
import { Icon, type IconName } from '../components/Icon';
import { NamePrompt } from '../components/NamePrompt';
import { Sheet } from '../components/Sheet';
import { colors } from '../components/theme';
import { albumKey, tracksLabel } from '../lib/library';
import type { Track } from '../lib/types';
import { useLibrary } from './LibraryContext';
import { usePlayer } from './PlayerContext';

type MenuTarget = {
  track: Track;
  /** Пользовательский плейлист и позиция трека в нём — для «Удалить из плейлиста». */
  playlistId?: string;
  index?: number;
};

type Ctx = { openTrackMenu: (t: MenuTarget) => void; showToast: (text: string) => void };
const TrackMenuCtx = createContext<Ctx | null>(null);

export function TrackMenuProvider({ children }: { children: ReactNode }) {
  const library = useLibrary();
  const player = usePlayer();
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
            library.dispatch({ type: 'toggleLike', id: track.id });
            showToast(liked ? 'Удалено из любимых' : 'Добавлено в любимые');
            close();
          },
        },
        { icon: 'plus', label: 'Добавить в плейлист', onPress: () => setMode('playlists') },
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
        { icon: 'user', label: 'К исполнителю', onPress: () => go(`artist:${track.artist}`) },
        ...(!track.local ? [{ icon: 'disc' as const, label: 'К альбому', onPress: () => go(albumKey(track.artist, track.album)) }] : []),
        ...(track.local
          ? [
              {
                icon: 'trash' as const,
                label: 'Удалить файл из приложения',
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
    const p = library.state.playlists.find((x) => x.id === playlistId);
    if (p?.trackIds.includes(track.id)) showToast(`Уже есть в «${name}»`);
    else {
      library.dispatch({ type: 'addToPlaylist', playlistId, trackId: track.id });
      showToast(`Добавлено в «${name}»`);
    }
    close();
  };

  const value = useMemo(() => ({ openTrackMenu, showToast }), [openTrackMenu, showToast]);

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
