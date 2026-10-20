import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { expiryDigest, plural } from './expiry';
import type { Product } from './types';

/**
 * Утреннее напоминание. Вместо ежедневного повтора каждый раз при запуске приложения и при изменении
 * продуктов перепланируем одно уведомление на ближайшие 9:00 — так текст всегда актуален.
 * На web локальных уведомлений нет: функции просто ничего не делают.
 */
const DIGEST_ID = 'expiry-digest';
const HOUR = 9;

export const notificationsSupported = Platform.OS !== 'web';

if (notificationsSupported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported) return false;
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    return (await Notifications.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

export async function rescheduleDigest(products: Product[], enabled: boolean): Promise<void> {
  if (!notificationsSupported) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(DIGEST_ID);
    if (!enabled) return;
    if (!(await Notifications.getPermissionsAsync()).granted) return;
    const { fireAt, names } = expiryDigest(products, new Date(), HOUR);
    if (!names.length) return;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Сроки годности',
        // Ложное срабатывание: enum экспортируется через `export *`, плагин import его не видит.
        // eslint-disable-next-line import/namespace
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    const list = names.length > 4 ? `${names.slice(0, 4).join(', ')} и ещё ${names.length - 4}` : names.join(', ');
    await Notifications.scheduleNotificationAsync({
      identifier: DIGEST_ID,
      content: {
        title: `Завтра испортится ${names.length} ${plural(names.length, ['продукт', 'продукта', 'продуктов'])}`,
        body: `${list}. Загляните в «Рецепты» — Claude подскажет, что приготовить.`,
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt, channelId: 'default' },
    });
  } catch (e) {
    // Уведомления — дополнительная функция: при ошибке (Expo Go, нет разрешения) приложение работает дальше.
    console.warn('Не удалось запланировать уведомление', e);
  }
}
