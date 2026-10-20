// Карта для iOS и Android: Leaflet + OpenStreetMap внутри WebView. Ключ Google Maps не нужен.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, StyleSheet } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';

import { buildMapHtml, commandScript, parseMapEvent, type MapCommand } from '../lib/mapHtml';
import type { LatLng } from '../lib/types';
import { DEFAULT_CENTER, type NotesMapProps } from './NotesMap.types';
import { colors } from './theme';

const ZOOM = 15; // ≈ прежние 0.02° на экран
const PICKER_ZOOM = 17; // ≈ 0.006°
const OVERVIEW_ZOOM = 10; // ≈ 0.3°, когда показать нечего

const toLatLng = (p: LatLng | null | undefined): LatLng | null => (p ? { latitude: p.latitude, longitude: p.longitude } : null);

export default function NotesMap({ notes, position, style, pickerMode, picked, pickedRadius, onPick, onNotePress }: NotesMapProps) {
  const ref = useRef<WebView<object>>(null);
  const ready = useRef(false);
  const [generation, setGeneration] = useState(0);
  const zoom = pickerMode ? PICKER_ZOOM : ZOOM;
  const focus = picked ?? position ?? notes[0] ?? null;

  // Страницу строим один раз с начальным видом; дальше только JSON-обновления.
  const html = useMemo(
    () => buildMapHtml({ center: toLatLng(focus) ?? DEFAULT_CENTER, zoom: focus ? zoom : OVERVIEW_ZOOM, colors }),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const centered = useRef(!!focus);

  // Текущее состояние в виде команд: отправляются при изменении и целиком, когда страница (пере)загрузилась.
  const notesCmd = useMemo<MapCommand>(
    () => ({ type: 'notes', notes: notes.map((n) => ({ id: n.id, latitude: n.latitude, longitude: n.longitude, emoji: n.emoji, text: n.text, radius: n.radius })) }),
    [notes],
  );
  const posLat = position?.latitude;
  const posLng = position?.longitude;
  const positionCmd = useMemo<MapCommand>(
    () => ({ type: 'position', position: posLat !== undefined && posLng !== undefined ? { latitude: posLat, longitude: posLng } : null }),
    [posLat, posLng],
  );
  const pickLat = picked?.latitude;
  const pickLng = picked?.longitude;
  const pickedCmd = useMemo<MapCommand>(
    () => ({ type: 'picked', picked: pickLat !== undefined && pickLng !== undefined ? { latitude: pickLat, longitude: pickLng } : null, radius: pickedRadius ?? 100 }),
    [pickLat, pickLng, pickedRadius],
  );
  const optionsCmd = useMemo<MapCommand>(
    () => ({ type: 'options', pickerMode: !!pickerMode, canPick: !!onPick, canOpen: !!onNotePress }),
    [pickerMode, onPick, onNotePress],
  );

  const send = useCallback((cmd: MapCommand) => {
    if (ready.current) ref.current?.injectJavaScript(commandScript(cmd));
  }, []);
  const pendingView = useRef<MapCommand | null>(null);
  const moveTo = useCallback((center: LatLng, z: number) => {
    const cmd: MapCommand = { type: 'view', center: { latitude: center.latitude, longitude: center.longitude }, zoom: z };
    if (ready.current) send(cmd);
    else pendingView.current = cmd;
  }, [send]);

  // Опции первыми: от них зависит, как рисуются маркеры.
  useEffect(() => send(optionsCmd), [send, optionsCmd]);
  useEffect(() => send(notesCmd), [send, notesCmd]);
  useEffect(() => send(positionCmd), [send, positionCmd]);
  useEffect(() => send(pickedCmd), [send, pickedCmd]);

  const latest = useRef<MapCommand[]>([]);
  useEffect(() => {
    latest.current = [optionsCmd, notesCmd, positionCmd, pickedCmd];
  }, [optionsCmd, notesCmd, positionCmd, pickedCmd]);

  // Позиция пришла позже открытия карты — один раз перелетаем к ней.
  useEffect(() => {
    if (!centered.current && focus) {
      centered.current = true;
      moveTo(focus, zoom);
    }
  }, [focus, zoom, moveTo]);

  // В режиме выбора следуем за выбранной точкой.
  useEffect(() => {
    if (pickerMode && pickLat !== undefined && pickLng !== undefined) moveTo({ latitude: pickLat, longitude: pickLng }, PICKER_ZOOM);
  }, [pickerMode, pickLat, pickLng, moveTo]);

  const reload = useCallback(() => {
    ready.current = false;
    setGeneration((g) => g + 1);
  }, []);

  const onMessage = useCallback((e: WebViewMessageEvent) => {
    const msg = parseMapEvent(e.nativeEvent.data);
    if (!msg) return;
    switch (msg.type) {
      case 'ready':
        ready.current = true;
        latest.current.forEach(send);
        if (pendingView.current) {
          send(pendingView.current);
          pendingView.current = null;
        }
        break;
      case 'pick':
        onPick?.(msg.point);
        break;
      case 'open':
        onNotePress?.(msg.id);
        break;
      case 'retry':
        reload();
        break;
    }
  }, [send, onPick, onNotePress, reload]);

  // Ссылки (например, «© OpenStreetMap») открываем в браузере, а не внутри карты.
  const onShouldStartLoadWithRequest = useCallback((req: ShouldStartLoadRequest) => {
    if (/^https?:/i.test(req.url)) {
      if (req.isTopFrame !== false) Linking.openURL(req.url).catch(() => {});
      return false;
    }
    return true;
  }, []);

  return (
    // WebView<object>: у типов react-native-webview по умолчанию P = undefined, и пропсы сводятся к never.
    <WebView<object>
      key={generation}
      ref={ref}
      style={[styles.map, style]}
      source={{ html }}
      originWhitelist={['*']}
      onMessage={onMessage}
      onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
      setSupportMultipleWindows={false}
      nestedScrollEnabled
      overScrollMode="never"
      bounces={false}
      scrollEnabled={false}
      onRenderProcessGone={reload}
      onContentProcessDidTerminate={reload}
    />
  );
}

const styles = StyleSheet.create({
  map: { flex: 1, backgroundColor: '#E8E6E1' },
});
