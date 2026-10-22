import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Cover } from '../../components/Cover';
import { Icon } from '../../components/Icon';
import { MiniPlayer } from '../../components/MiniPlayer';
import { TrackRow } from '../../components/TrackRow';
import { colors } from '../../components/theme';
import { useLibrary } from '../../context/LibraryContext';
import { usePlayer } from '../../context/PlayerContext';
import { useTrackMenu } from '../../context/TrackMenuContext';
import { archiveTracks, licenseLabel } from '../../lib/archive';
import { colorsFor, tracksLabel } from '../../lib/library';
import type { Track } from '../../lib/types';

type Loaded = { title: string; creator: string; license?: string; tracks: Track[] };

/** Альбом или запись из Internet Archive: слушать потоком, сохранить, скачать. */
export default function NetItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const library = useLibrary();
  const player = usePlayer();
  const { openTrackMenu, showToast } = useTrackMenu();
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    archiveTracks(id)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [id]);

  const source = `net:${id}`;
  // Сохранённые треки берём из медиатеки — там уже может быть путь к скачанному файлу.
  const tracks = (data?.tracks ?? []).map((t) => library.tracks.get(t.id) ?? t);
  const playingHere = player.source === source && player.playing;
  const allSaved = tracks.length > 0 && tracks.every((t) => library.tracks.has(t.id));

  const back = (
    <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/search'))} style={[styles.back, { top: insets.top + 6 }]} hitSlop={8} accessibilityLabel="Назад">
      <Icon name="back" size={22} color={colors.text} />
    </Pressable>
  );

  if (!data) {
    return (
      <View style={[styles.root, styles.center]}>
        {back}
        {error ? (
          <>
            <Text style={styles.title}>Не удалось загрузить</Text>
            <Text style={styles.muted}>{error}</Text>
          </>
        ) : (
          <ActivityIndicator color={colors.accent} size="large" />
        )}
      </View>
    );
  }

  const saveAll = () => {
    for (const t of tracks) library.remember(t);
    showToast(`Сохранено в «Мои треки»: ${tracksLabel(tracks.length)}`);
  };

  const downloadAll = async () => {
    const todo = tracks.filter((t) => !t.local && library.downloads[t.id] == null);
    if (!todo.length) return;
    showToast(`Скачиваем ${tracksLabel(todo.length)}`);
    let ok = 0;
    for (const t of todo) {
      try {
        await library.download(t);
        ok++;
      } catch {
        // ошибку одного трека пропускаем, остальные продолжаем
      }
    }
    showToast(ok === todo.length ? 'Всё скачано' : `Скачано ${ok} из ${todo.length}`);
  };

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + 56 }]}>
      <Cover colors={colorsFor(id ?? '')} size={180} icon="globe" />
      <Text style={styles.title} numberOfLines={3}>
        {data.title}
      </Text>
      <Text style={styles.muted}>
        {data.creator} · {tracksLabel(tracks.length)}
      </Text>
      <Pressable onPress={() => Linking.openURL(`https://archive.org/details/${encodeURIComponent(id ?? '')}`).catch(() => {})}>
        <Text style={styles.license}>
          Internet Archive · {licenseLabel(data.license) ?? 'лицензия не указана — проверьте на странице источника'}
        </Text>
      </Pressable>
      <View style={styles.actions}>
        <Pressable onPress={saveAll} disabled={allSaved || !tracks.length} style={[styles.pill, (allSaved || !tracks.length) && { opacity: 0.5 }]}>
          <Icon name={allSaved ? 'check' : 'plus'} size={18} color={colors.text} />
          <Text style={styles.pillText}>{allSaved ? 'Сохранено' : 'Сохранить'}</Text>
        </Pressable>
        {library.canDownload && (
          <Pressable onPress={downloadAll} disabled={!tracks.length} style={[styles.pill, !tracks.length && { opacity: 0.5 }]}>
            <Icon name="download" size={18} color={colors.text} />
            <Text style={styles.pillText}>Скачать всё</Text>
          </Pressable>
        )}
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={() => (player.source === source && player.current ? player.toggle() : player.playList(tracks, 0, source, { shuffle: false }))}
          disabled={!tracks.length}
          style={[styles.play, !playingHere && { paddingLeft: 3 }, !tracks.length && { opacity: 0.4 }]}
          accessibilityLabel={playingHere ? 'Пауза' : 'Слушать'}
        >
          <Icon name={playingHere ? 'pause' : 'play'} size={28} color={colors.accentText} />
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      <FlatList
        data={tracks}
        keyExtractor={(t) => t.id}
        ListHeaderComponent={header}
        ListEmptyComponent={<Text style={[styles.muted, { textAlign: 'center', marginTop: 24 }]}>В этой записи нет MP3-файлов</Text>}
        contentContainerStyle={{ paddingBottom: insets.bottom + (player.current ? 88 : 24) }}
        renderItem={({ item, index }) => (
          <TrackRow
            track={item}
            active={player.current?.id === item.id}
            liked={library.isLiked(item.id)}
            progress={library.downloads[item.id]}
            onPress={() => player.playList(tracks, index, source, { shuffle: false })}
            onMore={() => openTrackMenu({ track: item })}
          />
        )}
      />
      {back}
      <View style={[styles.mini, { paddingBottom: insets.bottom }]}>
        <MiniPlayer />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  back: { position: 'absolute', left: 12, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: 16, alignItems: 'center', gap: 6, paddingBottom: 8 },
  title: { color: colors.text, fontSize: 22, fontWeight: '800', textAlign: 'center', marginTop: 12 },
  muted: { color: colors.muted, fontSize: 14, textAlign: 'center' },
  license: { color: colors.faint, fontSize: 12, textAlign: 'center', textDecorationLine: 'underline' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'stretch', marginTop: 10 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.faint, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8 },
  pillText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  play: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  mini: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
