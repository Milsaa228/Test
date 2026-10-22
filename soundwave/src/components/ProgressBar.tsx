import { useRef, useState } from 'react';
import { StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';

import { formatTime } from '../lib/queue';
import { colors } from './theme';

type Props = {
  position: number;
  duration: number;
  onSeek: (seconds: number) => void;
};

/** Полоса перемотки: тап или перетаскивание, время обновляется во время жеста. */
export function ProgressBar({ position, duration, onSeek }: Props) {
  const width = useRef(1);
  // Смещение полосы на экране: считаем по pageX, чтобы не зависеть от элемента под пальцем.
  const originX = useRef(0);
  const [drag, setDrag] = useState<number | null>(null);

  const ratioAt = (e: GestureResponderEvent) => Math.min(1, Math.max(0, (e.nativeEvent.pageX - originX.current) / width.current));

  const ratio = drag ?? (duration > 0 ? Math.min(1, position / duration) : 0);
  const shown = drag != null ? drag * duration : position;

  return (
    <View>
      <View
        style={styles.touch}
        onLayout={(e) => (width.current = Math.max(1, e.nativeEvent.layout.width))}
        onStartShouldSetResponder={() => duration > 0}
        onMoveShouldSetResponder={() => duration > 0}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(e) => {
          originX.current = e.nativeEvent.pageX - e.nativeEvent.locationX;
          setDrag(ratioAt(e));
        }}
        onResponderMove={(e) => setDrag(ratioAt(e))}
        onResponderRelease={(e) => {
          onSeek(ratioAt(e) * duration);
          setDrag(null);
        }}
        onResponderTerminate={() => setDrag(null)}
        accessibilityRole="adjustable"
        accessibilityLabel="Позиция воспроизведения"
        accessibilityValue={{ min: 0, max: Math.round(duration), now: Math.round(shown) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => {
          const step = e.nativeEvent.actionName === 'increment' ? 10 : -10;
          onSeek(Math.min(duration, Math.max(0, position + step)));
        }}
      >
        <View style={styles.track} pointerEvents="none">
          <View style={[styles.fill, { width: `${ratio * 100}%` }]} />
        </View>
        <View pointerEvents="none" style={[styles.thumb, { left: `${ratio * 100}%` }, drag != null && styles.thumbActive]} />
      </View>
      <View style={styles.times}>
        <Text style={styles.time}>{formatTime(shown)}</Text>
        <Text style={styles.time}>{duration > 0 ? `-${formatTime(Math.max(0, duration - shown))}` : formatTime(undefined)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  touch: { height: 28, justifyContent: 'center' },
  track: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  fill: { height: 4, backgroundColor: colors.text },
  thumb: { position: 'absolute', width: 12, height: 12, borderRadius: 6, marginLeft: -6, backgroundColor: colors.text },
  thumbActive: { width: 16, height: 16, borderRadius: 8, marginLeft: -8 },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
  time: { color: colors.muted, fontSize: 12, fontVariant: ['tabular-nums'] },
});
