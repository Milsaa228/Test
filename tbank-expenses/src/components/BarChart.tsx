import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatMoney } from '../lib/stats';
import { colors } from './theme';

interface Props {
  values: number[];
  labels: string[];
  /** Подписи под столбиками показываются только для индексов, где функция вернёт true. */
  showLabel?: (index: number) => boolean;
  height?: number;
  describe?: (index: number) => string;
  highlightIndex?: number;
  /** Если задан, нажатие на столбик вызывает его вместо показа подсказки. */
  onSelect?: (index: number) => void;
}

export function BarChart({ values, labels, showLabel = () => true, height = 120, describe, highlightIndex, onSelect }: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const max = Math.max(...values, 1);
  const candidate = selected ?? highlightIndex ?? null;
  // После смены месяца выбранный день может выйти за пределы (31 → 30 дней).
  const active = candidate !== null && candidate < values.length ? candidate : null;

  return (
    <View>
      <Text style={styles.caption}>
        {active !== null ? `${describe ? describe(active) : labels[active]}: ${formatMoney(values[active])}` : ' '}
      </Text>
      <View style={[styles.row, { height }]}>
        {values.map((v, i) => (
          <Pressable key={i} style={styles.col} onPress={() => (onSelect ? onSelect(i) : setSelected(selected === i ? null : i))}>
            <View
              style={[
                styles.bar,
                {
                  height: v > 0 ? Math.max((v / max) * height, 3) : 2,
                  backgroundColor: i === active ? colors.accent : v > 0 ? '#C9CBD1' : colors.border,
                },
              ]}
            />
          </Pressable>
        ))}
      </View>
      <View style={styles.row}>
        {labels.map((l, i) => (
          <Text key={i} style={styles.label} numberOfLines={1}>
            {showLabel(i) ? l : ''}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  caption: { fontSize: 13, color: colors.muted, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'flex-end' },
  col: { flex: 1, height: '100%', justifyContent: 'flex-end', paddingHorizontal: 1 },
  bar: { borderRadius: 3 },
  label: { flex: 1, fontSize: 10, color: colors.muted, textAlign: 'center', marginTop: 4 },
});
