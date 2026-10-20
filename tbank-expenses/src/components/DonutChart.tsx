import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

import { colors } from './theme';

interface Slice {
  value: number;
  color: string;
}

interface Props {
  slices: Slice[];
  size?: number;
  stroke?: number;
  centerTitle: string;
  centerSubtitle?: string;
}

export function DonutChart({ slices, size = 200, stroke = 26, centerTitle, centerSubtitle }: Props) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const total = slices.reduce((s, x) => s + x.value, 0);
  // Небольшой зазор между сегментами, но не больше самого сегмента.
  const gap = slices.length > 1 ? 2 : 0;
  let offset = 0;

  return (
    <View style={{ width: size, height: size, alignSelf: 'center' }}>
      <Svg width={size} height={size}>
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.border} strokeWidth={stroke} fill="none" />
          {total > 0 &&
            slices.map((s, i) => {
              const len = (s.value / total) * circumference;
              const visible = Math.max(len - gap, 0.5);
              const el = (
                <Circle
                  key={i}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  stroke={s.color}
                  strokeWidth={stroke}
                  fill="none"
                  strokeDasharray={`${visible} ${circumference - visible}`}
                  strokeDashoffset={-offset}
                />
              );
              offset += len;
              return el;
            })}
        </G>
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit>
          {centerTitle}
        </Text>
        {centerSubtitle ? <Text style={styles.subtitle}>{centerSubtitle}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 13, color: colors.muted, marginTop: 2 },
});
