import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatTime } from '../lib/queue';
import type { Track } from '../lib/types';
import { Cover } from './Cover';
import { Icon } from './Icon';
import { colors } from './theme';

type Props = {
  track: Track;
  active?: boolean;
  liked?: boolean;
  number?: number;
  /** Прогресс скачивания 0…1. */
  progress?: number;
  /** Недоступен сейчас (офлайн, не скачан) — показываем приглушённым. */
  disabled?: boolean;
  onPress: () => void;
  onMore?: () => void;
};

export function TrackRow({ track, active, liked, number, progress, disabled, onPress, onMore }: Props) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onMore}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.elevated }, disabled && { opacity: 0.4 }]}
      accessibilityRole="button"
      accessibilityLabel={`${track.title}, ${track.artist}`}
    >
      {number != null ? <Text style={[styles.num, active && { color: colors.accent }]}>{number}</Text> : <Cover colors={track.colors} size={48} />}
      <View style={styles.info}>
        <Text style={[styles.title, active && { color: colors.accent }]} numberOfLines={1}>
          {track.title}
        </Text>
        <View style={styles.sub}>
          {liked && <Icon name="heart" size={12} color={colors.accent} />}
          {track.local && <Icon name="download" size={12} color={colors.accent} />}
          {track.online && !track.local && <Icon name="cloud" size={12} color={colors.muted} />}
          <Text style={styles.artist} numberOfLines={1}>
            {track.artist}
          </Text>
        </View>
      </View>
      {progress != null ? (
        <Text style={[styles.dur, { color: colors.accent }]}>{Math.round(progress * 100)}%</Text>
      ) : (
        track.duration != null && <Text style={styles.dur}>{formatTime(track.duration)}</Text>
      )}
      {onMore && (
        <Pressable onPress={onMore} hitSlop={10} style={styles.more} accessibilityLabel="Действия с треком">
          <Icon name="more" size={20} color={colors.muted} />
        </Pressable>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 7, gap: 12 },
  num: { width: 24, textAlign: 'center', color: colors.muted, fontSize: 15 },
  info: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontSize: 16, fontWeight: '500' },
  sub: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  artist: { color: colors.muted, fontSize: 13, flexShrink: 1 },
  dur: { color: colors.muted, fontSize: 13, fontVariant: ['tabular-nums'] },
  more: { padding: 4 },
});
