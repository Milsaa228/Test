import { Alert, Platform } from 'react-native';

export function notify(title: string, message?: string) {
  if (Platform.OS === 'web') window.alert(message ? `${title}\n\n${message}` : title);
  else Alert.alert(title, message);
}

/** Подтверждение опасного действия: Alert на телефоне, window.confirm на web. */
export function confirm(title: string, message: string, okLabel: string, onOk: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onOk();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Отмена', style: 'cancel' },
    { text: okLabel, style: 'destructive', onPress: onOk },
  ]);
}

export function errorText(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}
