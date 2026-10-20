import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from './theme';

export function notify(title: string, message?: string) {
  if (Platform.OS === 'web') window.alert(message ? `${title}\n\n${message}` : title);
  else Alert.alert(title, message);
}

/** Подтверждение действия: Alert на телефоне, window.confirm в браузере. */
export function confirm(title: string, message: string, action: string, onConfirm: () => void, destructive = false) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Отмена', style: 'cancel' },
    { text: action, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
  ]);
}

export function errorText(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

export function Button({ label, onPress, disabled, primary, danger, small }: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
  danger?: boolean;
  small?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        small && styles.small,
        primary && { backgroundColor: colors.accent },
        { opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
      ]}
    >
      <Text style={[styles.buttonText, small && styles.smallText, danger && { color: colors.danger }]}>{label}</Text>
    </Pressable>
  );
}

export function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function Busy({ text }: { text: string }) {
  return (
    <View style={styles.busy}>
      <ActivityIndicator color={colors.text} />
      <Text style={styles.busyText}>{text}</Text>
    </View>
  );
}

export function Empty({ glyph, title, text }: { glyph: string; title: string; text?: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyGlyph}>{glyph}</Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      {text ? <Text style={styles.emptyText}>{text}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  button: { backgroundColor: colors.bg, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 14, alignItems: 'center', marginTop: 6 },
  small: { paddingVertical: 7, paddingHorizontal: 10, borderRadius: 10, marginTop: 0 },
  buttonText: { fontSize: 15, fontWeight: '600', color: colors.text },
  smallText: { fontSize: 13 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7, marginRight: 6, marginBottom: 6 },
  chipActive: { backgroundColor: colors.text, borderColor: colors.text },
  chipText: { fontSize: 14, color: colors.text },
  chipTextActive: { color: colors.card },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.accent, borderRadius: 14, padding: 12, marginBottom: 12 },
  busyText: { fontSize: 14, color: colors.accentText, flex: 1 },
  empty: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24 },
  emptyGlyph: { fontSize: 44, marginBottom: 10 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.text, textAlign: 'center' },
  emptyText: { fontSize: 14, lineHeight: 20, color: colors.muted, textAlign: 'center', marginTop: 6 },
});
