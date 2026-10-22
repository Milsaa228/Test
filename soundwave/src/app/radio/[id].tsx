import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ArtistAvatar } from '../../components/ArtistAvatar';
import { Cover } from '../../components/Cover';
import { Icon } from '../../components/Icon';
import { MiniPlayer } from '../../components/MiniPlayer';
import { TrackRow } from '../../components/TrackRow';
import { colors } from '../../components/theme';
import { useLibrary } from '../../context/LibraryContext';
import { usePlayer } from '../../context/PlayerContext';
import { useReco } from '../../context/RecoContext';
import { useTrackMenu } from '../../context/TrackMenuContext';
import { isPlayable, tracksLabel } from '../../lib/library';
import type { Track } from '../../lib/types';

/** «Плейлист по треку» и «Плейлист по исполнителю». */
export default function RadioScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const reco = useReco();
  const library = useLibrary();
  const player = usePlayer();
  const { openTrackMenu, showToast } = useTrackMenu();
  const seed = id ? reco.radioSeed(id) : undefined;
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const { makeRadio } = reco;

  useEffect(() => {
    if (!seed || library.offline) return;
    let alive = true;
    makeRadio(seed)
      .then((list) => alive && (setTracks(list), setError(null)))
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [seed, makeRadio, attempt, library.offline]);

  const refresh = useCallback(() => {
    setTracks(null);
    setAttempt((n) => n + 1);
  }, []);

  const source = `radio:${id}`;
  const title = !seed ? 'Плейлист' : seed.kind === 'track' ? `По треку «${seed.track.title}»` : `По исполнителю ${seed.name}`;
  const list = (tracks ?? []).map((t) => library.tracks.get(t.id) ?? t);
  const playingHere = player.source === source && player.playing;

  const back = (
    <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={[styles.back, { top: insets.top + 6 }]} hitSlop={8} accessibilityLabel="Назад">
      <Icon name="back" size={22} color={colors.text} />
    </Pressable>
  );

  const header = seed ? (
    <View style={[styles.header, { paddingTop: insets.top + 56 }]}>
      {seed.kind === 'artist' ? <ArtistAvatar name={seed.name} size={160} /> : <Cover colors={seed.track.colors} size={160} icon="wave" />}
      <Text style={styles.title} numberOfLines={2}>
        {title}
      </Text>
      <Text style={styles.sub}>{tracks ? `${tracksLabel(list.length)} · похожая музыка` : 'Подбираем похожую музыку…'}</Text>
      <View style={styles.actions}>
        <Pressable onPress={refresh} disabled={!tracks} style={[styles.pill, !tracks && { opacity: 0.4 }]} accessibilityLabel="Подобрать заново">
          <Icon name="repeat" size={16} color={colors.text} />
          <Text style={styles.pillText}>Заново</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            for (const t of list) library.remember(t);
            library.createPlaylist(title, list.map((t) => t.id));
            showToast('Плейлист сохранён в медиатеку');
          }}
          disabled={!list.length}
          style={[styles.pill, !list.length && { opacity: 0.4 }]}
        >
          <Icon name="plus" size={16} color={colors.text} />
          <Text style={styles.pillText}>В медиатеку</Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={() => (player.source === source && player.current ? player.toggle() : player.playList(list, 0, source, { shuffle: false }))}
          disabled={!list.length}
          style={[styles.play, !playingHere && { paddingLeft: 3 }, !list.length && { opacity: 0.4 }]}
          accessibilityLabel={playingHere ? 'Пауза' : 'Слушать'}
        >
          <Icon name={playingHere ? 'pause' : 'play'} size={28} color={colors.accentText} />
        </Pressable>
      </View>
    </View>
  ) : undefined;

  return (
    <View style={styles.root}>
      {!seed ? (
        <View style={styles.center}>
          <Text style={styles.title}>Плейлист устарел</Text>
          <Text style={styles.sub}>Откройте его снова из плеера или со страницы исполнителя.</Text>
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(t) => t.id}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <View style={styles.center}>
              {library.offline ? (
                <Text style={styles.sub}>Нужен интернет, чтобы подобрать похожую музыку.</Text>
              ) : error ? (
                <>
                  <Text style={styles.sub}>{error}</Text>
                  <Pressable style={styles.retry} onPress={refresh}>
                    <Text style={styles.retryText}>Попробовать снова</Text>
                  </Pressable>
                </>
              ) : (
                <ActivityIndicator color={colors.accent} size="large" />
              )}
            </View>
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + (player.current ? 88 : 24) }}
          renderItem={({ item, index }) => (
            <TrackRow
              track={item}
              active={player.current?.id === item.id}
              liked={library.isLiked(item.id)}
              disabled={!isPlayable(item, library.offline)}
              onPress={() => player.playList(list, index, source, { shuffle: false })}
              onMore={() => openTrackMenu({ track: item })}
            />
          )}
        />
      )}
      {back}
      <View style={[styles.mini, { paddingBottom: insets.bottom }]}>
        <MiniPlayer />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32, flexGrow: 1 },
  back: { position: 'absolute', left: 12, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  header: { alignItems: 'center', paddingHorizontal: 16, gap: 6, paddingBottom: 8 },
  title: { color: colors.text, fontSize: 22, fontWeight: '800', textAlign: 'center', marginTop: 12 },
  sub: { color: colors.muted, fontSize: 14, textAlign: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'stretch', marginTop: 10 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.faint, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8 },
  pillText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  play: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  retry: { borderWidth: 1, borderColor: colors.faint, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 9 },
  retryText: { color: colors.text, fontWeight: '600' },
  mini: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
