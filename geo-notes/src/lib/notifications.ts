import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';

import { formatDistance } from './geo';
import type { GeoNote } from './types';

const CHANNEL_ID = 'nearby';
// На web локальных уведомлений expo-notifications нет — там только баннер в приложении.
const supported = Platform.OS !== 'web';

export function configureNotifications(): void {
  if (!supported) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Заметки рядом',
      importance: AndroidImportance.HIGH,
    }).catch(() => {});
  }
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (!supported) return false;
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    return (await Notifications.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

export async function notifyNote(note: GeoNote, distance?: number): Promise<void> {
  if (!supported) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${note.emoji} Заметка рядом${distance !== undefined ? ` · ${formatDistance(distance)}` : ''}`,
        body: note.text,
        data: { noteId: note.id },
      },
      trigger: Platform.OS === 'android' ? { channelId: CHANNEL_ID } : null,
    });
  } catch {
    // нет разрешения — остаётся баннер в приложении
  }
}

/** id заметки из нажатого уведомления. */
export function noteIdFromResponse(response: Notifications.NotificationResponse | null | undefined): string | null {
  const id = response?.notification.request.content.data?.noteId;
  return typeof id === 'string' ? id : null;
}
