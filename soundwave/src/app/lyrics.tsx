import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../components/Icon';
import { colors } from '../components/theme';
import { usePlayer } from '../context/PlayerContext';
import { currentLine, fetchLyrics, type Lyrics } from '../lib/lyrics';

const cache = new Map<string, Lyrics | null>();

/** Текст песни: синхронизированный — с подсветкой строки и перемоткой по нажатию, иначе обычный. */
export default function LyricsScreen() {
  const insets = useSafeAreaInsets();
  const { current, status, seek } = usePlayer();
  const [state, setState] = useState<{ id: string; lyrics: Lyrics | null; error?: string } | null>(null);
  const list = useRef<FlatList>(null);

  useEffect(() => {
    if (!current) return;
    if (cache.has(current.id)) return;
    let alive = true;
    fetchLyrics({ artist: current.artist, title: current.title, album: current.album, duration: current.duration })
      .then((lyrics) => {
        cache.set(current.id, lyrics);
        if (alive) setState({ id: current.id, lyrics });
      })
      .catch((e) => alive && setState({ id: current.id, lyrics: null, error: e instanceof Error ? e.message : String(e) }));
    return () => {
      alive = false;
    };
  }, [current]);

  const loaded = current && cache.has(current.id) ? { lyrics: cache.get(current.id) ?? null, error: undefined } : state?.id === current?.id ? state : null;
  const synced = loaded?.lyrics?.synced?.length ? loaded.lyrics.synced : null;
  const line = synced ? currentLine(synced, status.currentTime) : -1;

  useEffect(() => {
    if (synced && line >= 0) list.current?.scrollToIndex({ index: line, viewPosition: 0.35, animated: true });
  }, [line, synced]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8, backgroundColor: current?.colors[1] ?? colors.bg }]}>
      <View style={styles.top}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Закрыть">
          <Icon name="down" size={28} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {current?.title ?? 'Текст песни'}
          </Text>
          <Text style={styles.artist} numberOfLines={1}>
            {current?.artist}
          </Text>
        </View>
      </View>

      {!current ? (
        <Text style={styles.center}>Ничего не играет</Text>
      ) : !loaded ? (
        <ActivityIndicator color={colors.text} size="large" style={{ marginTop: 48 }} />
      ) : loaded.lyrics?.instrumental ? (
        <Text style={styles.center}>Это инструментальная композиция — без слов.</Text>
      ) : synced ? (
        <FlatList
          ref={list}
          data={synced}
          keyExtractor={(l, i) => `${l.t}-${i}`}
          contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 32, paddingBottom: insets.bottom + 200 }}
          onScrollToIndexFailed={() => {}}
          renderItem={({ item, index }) => (
            <Pressable onPress={() => seek(item.t)}>
              <Text style={[styles.line, index === line && styles.lineOn, index < line && styles.linePast]}>{item.text || '♪'}</Text>
            </Pressable>
          )}
        />
      ) : loaded.lyrics?.plain ? (
        <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: insets.bottom + 48 }}>
          <Text style={styles.plain}>{loaded.lyrics.plain}</Text>
        </ScrollView>
      ) : (
        <Text style={styles.center}>{loaded.error ? `Не удалось загрузить текст: ${loaded.error}` : 'Текст этой песни не найден.'}</Text>
      )}
      <Text style={[styles.credit, { paddingBottom: insets.bottom + 8 }]}>Тексты — LRCLIB (lrclib.net)</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, marginBottom: 4 },
  title: { color: colors.text, fontSize: 16, fontWeight: '800' },
  artist: { color: 'rgba(255,255,255,0.75)', fontSize: 13 },
  center: { color: 'rgba(255,255,255,0.8)', fontSize: 16, textAlign: 'center', marginTop: 48, paddingHorizontal: 32 },
  line: { color: 'rgba(255,255,255,0.45)', fontSize: 24, fontWeight: '800', lineHeight: 32, marginVertical: 6 },
  lineOn: { color: '#fff' },
  linePast: { color: 'rgba(255,255,255,0.7)' },
  plain: { color: '#fff', fontSize: 19, fontWeight: '700', lineHeight: 28 },
  credit: { color: 'rgba(255,255,255,0.5)', fontSize: 11, textAlign: 'center' },
});
