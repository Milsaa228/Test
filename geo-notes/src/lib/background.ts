import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { AppState, Platform } from 'react-native';

import { applyGeofenceEvent, pickGeofenceRegions } from './geo';
import { notifyNote } from './notifications';
import * as storage from './storage';
import type { LatLng } from './types';

export const GEOFENCE_TASK = 'geo-notes-geofence';

/** В Expo Go фоновая геолокация не работает — нужна development build. */
export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
export const backgroundSupported = Platform.OS !== 'web' && !isExpoGo;

interface GeofenceTaskData {
  eventType: Location.GeofencingEventType;
  region: Location.LocationRegion;
}

// Задачу нужно объявить на верхнем уровне модуля: ОС может поднять приложение только ради неё.
if (backgroundSupported && !TaskManager.isTaskDefined(GEOFENCE_TASK)) {
  TaskManager.defineTask<GeofenceTaskData>(GEOFENCE_TASK, async ({ data, error }) => {
    if (error || !data?.region?.identifier) return;
    const event = data.eventType === Location.GeofencingEventType.Enter ? 'enter' : 'exit';
    // Пока приложение открыто, срабатывания считает слежение на переднем плане.
    if (event === 'enter' && AppState.currentState === 'active') return;
    const [notes, triggers, settings] = await Promise.all([storage.loadNotes(), storage.loadTriggers(), storage.loadSettings()]);
    const note = notes.find((n) => n.id === data.region.identifier);
    if (!note) return;
    const res = applyGeofenceEvent(note, event, triggers, Date.now(), settings.cooldownMinutes * 60_000);
    await storage.saveTriggers(res.state);
    if (res.fire) await notifyNote(note);
  });
}

export type BackgroundPermission = 'granted' | 'denied' | 'unsupported';

export async function requestBackgroundPermission(): Promise<BackgroundPermission> {
  if (!backgroundSupported) return 'unsupported';
  const fg = await Location.requestForegroundPermissionsAsync();
  if (!fg.granted) return 'denied';
  const bg = await Location.requestBackgroundPermissionsAsync();
  return bg.granted ? 'granted' : 'denied';
}

/** Перезапускает геозоны под текущие заметки или выключает их. Ошибки не роняют приложение. */
export async function syncGeofences(enabled: boolean, from: LatLng | null): Promise<void> {
  if (!backgroundSupported) return;
  try {
    const started = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK);
    const [notes, triggers] = await Promise.all([storage.loadNotes(), storage.loadTriggers()]);
    const regions = pickGeofenceRegions(notes, triggers, from);
    if (!enabled || regions.length === 0) {
      if (started) await Location.stopGeofencingAsync(GEOFENCE_TASK);
      return;
    }
    const perm = await Location.getBackgroundPermissionsAsync();
    if (!perm.granted) return;
    await Location.startGeofencingAsync(GEOFENCE_TASK, regions);
  } catch (e) {
    console.warn('Не удалось обновить геозоны', e);
  }
}
