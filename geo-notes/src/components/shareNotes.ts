import * as Clipboard from 'expo-clipboard';
import { Linking, Platform, Share } from 'react-native';

import { appleMapsUrl, geoUri, shareText, yandexMapsUrl } from '../lib/share';
import type { GeoNote } from '../lib/types';
import { notify } from './dialogs';

/** Системное «Поделиться»; где его нет (часть браузеров) — копируем в буфер. */
export async function shareNotes(notes: GeoNote[]) {
  const message = shareText(notes);
  try {
    await Share.share({ message });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') return;
    await Clipboard.setStringAsync(message);
    notify('Скопировано', 'Ссылка на заметки скопирована — отправьте её другу в мессенджере.');
  }
}

export async function openInYandex(note: GeoNote) {
  await Linking.openURL(yandexMapsUrl(note)).catch(() => notify('Не удалось открыть Яндекс Карты'));
}

/** Другое приложение карт: geo: на Android, Apple Maps на iOS, Яндекс в браузере. */
export async function openInMaps(note: GeoNote) {
  const url = Platform.OS === 'android' ? geoUri(note, note.text) : Platform.OS === 'ios' ? appleMapsUrl(note, note.text) : yandexMapsUrl(note);
  await Linking.openURL(url).catch(() => notify('Не найдено приложение карт'));
}
