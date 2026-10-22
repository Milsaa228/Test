import { router, useLocalSearchParams } from 'expo-router';
import { useId, useState } from 'react';
import { Alert, FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { Cover } from '../../components/Cover';
import { Icon } from '../../components/Icon';
import { MiniPlayer } from '../../components/MiniPlayer';
import { NamePrompt } from '../../components/NamePrompt';
import { Sheet } from '../../components/Sheet';
import { TrackRow } from '../../components/TrackRow';
import { colors } from '../../components/theme';
import { useLibrary } from '../../context/LibraryContext';
import { usePlayer } from '../../context/PlayerContext';
import { useTrackMenu } from '../../context/TrackMenuContext';
import { resolveCollection } from '../../lib/library';
import { formatTotal } from '../../lib/queue';

const ICONS = { liked: 'heart', local: 'download', artist: 'user', album: 'disc', playlist: 'note', genre: 'note' } as const;

function confirm(title: string, message: string, onOk: () => void) {
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(`${title}\n${message}`)) onOk();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Отмена', style: 'cancel' },
    { text: 'Удалить', style: 'destructive', onPress: onOk },
  ]);
}

export default function CollectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const library = useLibrary();
  const player = usePlayer();
  const { openTrackMenu } = useTrackMenu();
  const [menu, setMenu] = useState(false);
  const [rename, setRename] = useState(false);
  const gradientId = `hero${useId().replace(/:/g, '')}`;

  const col = id ? resolveCollection(id, library.state) : null;

  const back = (
    <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={[styles.back, { top: insets.top + 6 }]} hitSlop={8} accessibilityLabel="Назад">
      <Icon name="back" size={22} color={colors.text} />
    </Pressable>
  );

  if (!col) {
    return (
      <View style={[styles.root, styles.center]}>
        {back}
        <Text style={styles.emptyTitle}>{library.ready ? 'Не найдено' : 'Загрузка…'}</Text>
      </View>
    );
  }

  const playlistId = col.editable ? col.id.slice(3) : undefined;
  const isSource = player.source === col.id;
  const playingHere = isSource && player.playing;
  // Общую длительность показываем, только когда известны длительности всех треков.
  const total = col.tracks.every((t) => t.duration != null) ? col.tracks.reduce((s, t) => s + (t.duration ?? 0), 0) : 0;

  const onPlay = () => {
    if (isSource && player.current) player.toggle();
    else if (col.tracks.length) player.playList(col.tracks, -1, col.id);
  };

  const header = (
    <View>
      <View style={[styles.hero, { paddingTop: insets.top + 48 }]}>
        <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 1 1">
          <Defs>
            <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={col.colors[0]} stopOpacity={0.85} />
              <Stop offset="1" stopColor={colors.bg} />
            </LinearGradient>
          </Defs>
          <Rect width={1} height={1} fill={`url(#${gradientId})`} />
        </Svg>
        <View style={styles.coverShadow}>
          <Cover colors={col.colors} size={200} round={col.kind === 'artist'} icon={ICONS[col.kind]} />
        </View>
      </View>
      <View style={styles.meta}>
        <Text style={styles.title} numberOfLines={2}>
          {col.title}
        </Text>
        <Text style={styles.subtitle}>
          {col.subtitle}
          {total >= 60 ? ` · ${formatTotal(total)}` : ''}
        </Text>
        <View style={styles.actions}>
          {col.editable && (
            <Pressable onPress={() => setMenu(true)} hitSlop={8} accessibilityLabel="Действия с плейлистом">
              <Icon name="more" size={24} color={colors.muted} />
            </Pressable>
          )}
          <View style={{ flex: 1 }} />
          <Pressable onPress={player.toggleShuffle} hitSlop={8} accessibilityLabel="Перемешать" accessibilityState={{ selected: player.queue.shuffle }}>
            <Icon name="shuffle" size={26} color={player.queue.shuffle ? colors.accent : colors.muted} />
          </Pressable>
          <Pressable
            onPress={onPlay}
            disabled={!col.tracks.length}
            style={[styles.play, !playingHere && { paddingLeft: 3 }, !col.tracks.length && { opacity: 0.4 }]}
            accessibilityLabel={playingHere ? 'Пауза' : 'Слушать'}
          >
            <Icon name={playingHere ? 'pause' : 'play'} size={28} color={colors.accentText} />
          </Pressable>
        </View>
      </View>
    </View>
  );

  const empty =
    col.kind === 'liked' ? (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>Здесь будут любимые треки</Text>
        <Text style={styles.emptyText}>Нажимайте ♥ в плеере или в меню трека.</Text>
      </View>
    ) : col.kind === 'local' ? (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>Здесь будут ваши треки</Text>
        <Text style={styles.emptyText}>Скачайте музыку из интернета или добавьте файлы с устройства в разделе «Медиатека».</Text>
        <Pressable style={styles.findBtn} onPress={() => router.navigate({ pathname: '/search', params: { mode: 'net' } })}>
          <Text style={styles.findText}>Найти в интернете</Text>
        </Pressable>
      </View>
    ) : (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>Добавим треки в плейлист?</Text>
        <Text style={styles.emptyText}>Найдите трек, откройте меню «⋯» и выберите «Добавить в плейлист».</Text>
        <Pressable style={styles.findBtn} onPress={() => router.navigate('/search')}>
          <Text style={styles.findText}>Найти треки</Text>
        </Pressable>
      </View>
    );

  return (
    <View style={styles.root}>
      <FlatList
        data={col.tracks}
        keyExtractor={(t, i) => `${t.id}-${i}`}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        contentContainerStyle={{ paddingBottom: insets.bottom + (player.current ? 88 : 24) }}
        renderItem={({ item, index }) => (
          <TrackRow
            track={item}
            number={col.kind === 'album' ? index + 1 : undefined}
            active={player.current?.id === item.id}
            liked={col.kind !== 'liked' && library.isLiked(item.id)}
            onPress={() => player.playList(col.tracks, index, col.id, { shuffle: false })}
            onMore={() => openTrackMenu({ track: item, playlistId, index })}
          />
        )}
      />
      {back}
      <View style={[styles.mini, { paddingBottom: insets.bottom }]}>
        <MiniPlayer />
      </View>

      <Sheet visible={menu} onClose={() => setMenu(false)}>
        <Pressable
          style={styles.menuItem}
          onPress={() => {
            setMenu(false);
            setRename(true);
          }}
        >
          <Icon name="edit" size={22} color={colors.muted} />
          <Text style={styles.menuText}>Переименовать</Text>
        </Pressable>
        <Pressable
          style={styles.menuItem}
          onPress={() => {
            setMenu(false);
            confirm('Удалить плейлист?', `«${col.title}» будет удалён из медиатеки.`, () => {
              library.dispatch({ type: 'deletePlaylist', id: playlistId! });
              router.back();
            });
          }}
        >
          <Icon name="trash" size={22} color={colors.danger} />
          <Text style={[styles.menuText, { color: colors.danger }]}>Удалить плейлист</Text>
        </Pressable>
      </Sheet>
      <NamePrompt
        visible={rename}
        title="Переименовать плейлист"
        initial={col.title}
        confirmLabel="Сохранить"
        onCancel={() => setRename(false)}
        onSubmit={(name) => {
          library.dispatch({ type: 'renamePlaylist', id: playlistId!, name });
          setRename(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  back: { position: 'absolute', left: 12, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  hero: { alignItems: 'center', paddingBottom: 20 },
  coverShadow: { shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 12 },
  meta: { paddingHorizontal: 16 },
  title: { color: colors.text, fontSize: 26, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: 13, marginTop: 6 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 22, marginTop: 12, marginBottom: 8 },
  play: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingHorizontal: 32, paddingTop: 32, gap: 8 },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  emptyText: { color: colors.muted, fontSize: 14, textAlign: 'center' },
  findBtn: { marginTop: 12, backgroundColor: colors.text, borderRadius: 24, paddingHorizontal: 24, paddingVertical: 12 },
  findText: { color: colors.bg, fontWeight: '700' },
  mini: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 16, paddingVertical: 14 },
  menuText: { color: colors.text, fontSize: 16 },
});
