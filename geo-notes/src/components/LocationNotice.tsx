import { Platform, StyleSheet, Text, View } from 'react-native';

import { useNotes } from '../context/NotesContext';
import { Button } from './Button';
import { card, colors } from './theme';

const TEXTS = {
  pending: {
    title: 'Нужен доступ к геолокации',
    text: 'Без него приложение не узнает, что вы рядом с заметкой. Координаты не покидают телефон.',
    action: 'Разрешить',
  },
  denied: {
    title: 'Геолокация не разрешена',
    text: 'Заметки можно создавать, выбирая место на карте, но напоминания «рядом» работать не будут.',
    action: 'Разрешить',
  },
  blocked: {
    title: 'Геолокация запрещена в настройках',
    text:
      Platform.OS === 'web'
        ? 'Разрешите доступ к местоположению для этого сайта в настройках браузера и обновите страницу.'
        : 'Повторно спросить система не даст. Откройте настройки, раздел «Геопозиция» / «Местоположение», и выберите «При использовании».',
    action: Platform.OS === 'web' ? null : 'Открыть настройки',
  },
  unavailable: {
    title: 'Не удаётся определить местоположение',
    text: 'Проверьте, что геолокация включена на устройстве, и попробуйте ещё раз.',
    action: 'Повторить',
  },
};

/** Пояснение, почему нет геолокации, с кнопкой исправить. Ничего не показывает, если всё хорошо. */
export function LocationNotice({ compact }: { compact?: boolean }) {
  const { locationStatus, requestLocation } = useNotes();
  if (locationStatus === 'granted') return null;
  const t = TEXTS[locationStatus];
  return (
    <View style={[card, compact && styles.compact]}>
      <Text style={styles.title}>📍 {t.title}</Text>
      <Text style={styles.text}>{t.text}</Text>
      {t.action && <Button label={t.action} onPress={requestLocation} primary />}
    </View>
  );
}

const styles = StyleSheet.create({
  compact: { marginBottom: 0 },
  title: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 4 },
  text: { fontSize: 14, lineHeight: 20, color: colors.muted },
});
