import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../components/Icon';
import { TrackRow } from '../components/TrackRow';
import { colors } from '../components/theme';
import { useLibrary } from '../context/LibraryContext';
import { usePlayer } from '../context/PlayerContext';

export default function QueueScreen() {
  const insets = useSafeAreaInsets();
  const p = usePlayer();
  const { isLiked, tracks } = useLibrary();
  const { queue } = p;
  const withDur = (i: number) => {
    const t = queue.tracks[i];
    return { ...t, duration: tracks.get(t.id)?.duration ?? t.duration };
  };
  const upcoming = queue.tracks.map((_, i) => i).filter((i) => i > queue.index);
  const repeatLabel = queue.repeat === 'all' ? ' · повтор очереди' : queue.repeat === 'one' ? ' · повтор трека' : '';

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.top}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Закрыть">
          <Icon name="down" size={28} color={colors.text} />
        </Pressable>
        <Text style={styles.heading}>Очередь</Text>
        <View style={{ width: 28 }} />
      </View>

      <FlatList
        data={upcoming}
        keyExtractor={(i) => `${queue.tracks[i].id}-${i}`}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        ListHeaderComponent={
          <>
            {p.current && (
              <>
                <Text style={styles.section}>Сейчас играет</Text>
                <TrackRow track={withDur(queue.index)} active liked={isLiked(p.current.id)} onPress={p.toggle} />
              </>
            )}
            <Text style={styles.section}>
              Далее{queue.shuffle ? ' · перемешано' : ''}
              {repeatLabel}
            </Text>
          </>
        }
        ListEmptyComponent={<Text style={styles.empty}>В очереди больше ничего нет</Text>}
        renderItem={({ item: i }) => (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <TrackRow track={withDur(i)} liked={isLiked(queue.tracks[i].id)} onPress={() => p.jumpTo(i)} />
            </View>
            <Pressable onPress={() => p.removeFromQueue(i)} hitSlop={8} style={styles.remove} accessibilityLabel="Убрать из очереди">
              <Icon name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 8 },
  heading: { color: colors.text, fontSize: 16, fontWeight: '700' },
  section: { color: colors.text, fontSize: 17, fontWeight: '700', marginHorizontal: 16, marginTop: 20, marginBottom: 6 },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 24 },
  row: { flexDirection: 'row', alignItems: 'center', paddingRight: 12 },
  remove: { padding: 4 },
});
