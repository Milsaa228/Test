import { Alert, Platform, Pressable, StyleSheet, Text } from 'react-native';

import { colors } from './theme';

export function notify(title: string, message?: string) {
  if (Platform.OS === 'web') window.alert(message ? `${title}\n\n${message}` : title);
  else Alert.alert(title, message);
}

export function confirm(title: string, message: string, action: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Отмена', style: 'cancel' },
    { text: action, style: 'destructive', onPress: onConfirm },
  ]);
}

export function errorText(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

export function Button({ label, onPress, disabled, primary, danger }: { label: string; onPress: () => void; disabled?: boolean; primary?: boolean; danger?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        primary && { backgroundColor: colors.accent },
        { opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
      ]}
    >
      <Text style={[styles.buttonText, danger && { color: colors.danger }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { backgroundColor: colors.bg, borderRadius: 14, paddingVertical: 13, alignItems: 'center', marginTop: 6 },
  buttonText: { fontSize: 15, fontWeight: '600', color: colors.text },
});
