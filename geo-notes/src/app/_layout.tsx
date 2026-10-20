// Модуль фоновой задачи импортируем первым: геозона должна быть объявлена при любом запуске.
import '../lib/background';

import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { ProximityBanner } from '../components/ProximityBanner';
import { colors } from '../components/theme';
import { NotesProvider } from '../context/NotesContext';
import { configureNotifications, noteIdFromResponse } from '../lib/notifications';

configureNotifications();

/** Нажатие на уведомление открывает заметку. */
function useNotificationNavigation() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const open = (response: Notifications.NotificationResponse | null) => {
      const id = noteIdFromResponse(response);
      if (id) router.push(`/note/${id}`);
    };
    // Холодный старт из уведомления; после обработки забываем ответ, чтобы не открывать заметку при каждом запуске.
    Notifications.getLastNotificationResponseAsync()
      .then((r) => {
        open(r);
        if (r) return Notifications.clearLastNotificationResponseAsync();
      })
      .catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, []);
}

export default function RootLayout() {
  useNotificationNavigation();
  return (
    <NotesProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerShadowVisible: false,
          headerTitleStyle: { fontWeight: '700' },
          headerTintColor: colors.text,
          headerBackTitle: 'Назад',
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="new" options={{ title: 'Новая заметка' }} />
        <Stack.Screen name="note/[id]" options={{ title: 'Заметка' }} />
        <Stack.Screen name="import" options={{ title: 'Импорт заметок' }} />
      </Stack>
      <ProximityBanner />
    </NotesProvider>
  );
}
