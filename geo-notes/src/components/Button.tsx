import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors } from './theme';

export function Button({ label, onPress, disabled, primary, danger, style }: { label: string; onPress: () => void; disabled?: boolean; primary?: boolean; danger?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        primary && { backgroundColor: colors.accent },
        { opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
        style,
      ]}
    >
      <Text style={[styles.text, danger && { color: colors.danger }]}>{label}</Text>
    </Pressable>
  );
}

export function Segment<T extends string | number>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={styles.segment}>
      {options.map((o) => (
        <Pressable key={String(o.value)} style={[styles.segmentItem, value === o.value && styles.segmentActive]} onPress={() => onChange(o.value)}>
          <Text style={styles.segmentText}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  button: { backgroundColor: colors.bg, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 16, alignItems: 'center', marginTop: 6 },
  text: { fontSize: 15, fontWeight: '600', color: colors.text },
  segment: { flexDirection: 'row', backgroundColor: colors.bg, borderRadius: 12, padding: 3, marginBottom: 6 },
  segmentItem: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10 },
  segmentActive: { backgroundColor: colors.card },
  segmentText: { fontSize: 14, color: colors.text },
});
