import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useLibrary } from '../context/LibraryContext';
import { usePlayer } from '../context/PlayerContext';
import { Cover } from './Cover';
import { Icon } from './Icon';
import { colors } from './theme';

/** Мини-плеер над нижними вкладками. */
export function MiniPlayer() {
  const { current, playing, status, toggle } = usePlayer();
  const { isLiked, dispatch } = useLibrary();
  if (!current) return null;
  const liked = isLiked(current.id);
  const ratio = status.duration > 0 ? Math.min(1, status.currentTime / status.duration) : 0;

  return (
    <View style={styles.wrap}>
      <Pressable style={[styles.bar, { backgroundColor: current.colors[1] }]} onPress={() => router.push('/player')} accessibilityLabel="Открыть плеер">
        <Cover colors={current.colors} size={40} />
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>
            {current.title}
          </Text>
          <Text style={styles.artist} numberOfLines={1}>
            {status.error ? 'Не удалось воспроизвести' : status.isBuffering && playing ? 'Загрузка…' : current.artist}
          </Text>
        </View>
        <Pressable hitSlop={8} onPress={() => dispatch({ type: 'toggleLike', id: current.id })} accessibilityLabel={liked ? 'Убрать из любимых' : 'В любимые'}>
          <Icon name={liked ? 'heart' : 'heartOutline'} size={24} color={liked ? colors.accent : colors.text} />
        </Pressable>
        <Pressable hitSlop={8} onPress={toggle} style={styles.play} accessibilityLabel={playing ? 'Пауза' : 'Играть'}>
          <Icon name={playing ? 'pause' : 'play'} size={26} color={colors.text} />
        </Pressable>
        <View style={styles.progress}>
          <View style={[styles.fill, { width: `${ratio * 100}%` }]} />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 8, paddingBottom: 4, backgroundColor: 'transparent' },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, paddingBottom: 10, borderRadius: 8, overflow: 'hidden' },
  info: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontWeight: '600', fontSize: 14 },
  artist: { color: 'rgba(255,255,255,0.75)', fontSize: 13 },
  play: { paddingHorizontal: 6 },
  progress: { position: 'absolute', left: 8, right: 8, bottom: 2, height: 2, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.25)' },
  fill: { height: 2, borderRadius: 1, backgroundColor: colors.text },
});
