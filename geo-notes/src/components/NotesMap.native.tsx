import { Fragment, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text } from 'react-native';
import MapView, { Circle, Marker, type Region } from 'react-native-maps';

import type { LatLng } from '../lib/types';
import { DEFAULT_CENTER, type NotesMapProps } from './NotesMap.types';
import { colors } from './theme';

function regionAround(p: LatLng, delta: number): Region {
  return { latitude: p.latitude, longitude: p.longitude, latitudeDelta: delta, longitudeDelta: delta };
}

export default function NotesMap({ notes, position, style, pickerMode, picked, pickedRadius, onPick, onNotePress }: NotesMapProps) {
  const mapRef = useRef<MapView>(null);
  const delta = pickerMode ? 0.006 : 0.02;
  const focus = picked ?? position ?? notes[0] ?? null;
  // Начальный регион считаем один раз, дальше карту двигает пользователь.
  const initialRegion = useMemo(() => regionAround(focus ?? DEFAULT_CENTER, focus ? delta : 0.3), []); // eslint-disable-line react-hooks/exhaustive-deps
  const centered = useRef(!!focus);

  // Позиция пришла позже открытия карты — один раз перелетаем к ней.
  useEffect(() => {
    if (!centered.current && focus) {
      centered.current = true;
      mapRef.current?.animateToRegion(regionAround(focus, delta), 400);
    }
  }, [focus, delta]);

  // В режиме выбора следуем за выбранной точкой.
  const pickedKey = picked ? `${picked.latitude},${picked.longitude}` : '';
  useEffect(() => {
    if (pickerMode && picked) mapRef.current?.animateToRegion(regionAround(picked, delta), 300);
  }, [pickerMode, pickedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <MapView
      ref={mapRef}
      style={[styles.map, style]}
      initialRegion={initialRegion}
      showsUserLocation={!!position}
      showsMyLocationButton
      toolbarEnabled={false}
      onLongPress={onPick ? (e) => onPick(e.nativeEvent.coordinate) : undefined}
      onPress={pickerMode && onPick ? (e) => onPick(e.nativeEvent.coordinate) : undefined}
    >
      {notes.map((n) => (
        <Fragment key={n.id}>
          <Circle center={n} radius={n.radius} fillColor={colors.zone} strokeColor={colors.zoneStroke} strokeWidth={1} />
          <Marker
            coordinate={n}
            title={`${n.emoji} ${n.text}`.slice(0, 60)}
            description={onNotePress ? 'Нажмите, чтобы открыть' : undefined}
            onCalloutPress={onNotePress ? () => onNotePress(n.id) : undefined}
          >
            <Text style={styles.emoji}>{n.emoji}</Text>
          </Marker>
        </Fragment>
      ))}
      {picked && (
        <>
          <Circle center={picked} radius={pickedRadius ?? 100} fillColor="rgba(28, 28, 30, 0.12)" strokeColor={colors.text} strokeWidth={2} />
          <Marker coordinate={picked} pinColor={colors.danger} />
        </>
      )}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
  emoji: { fontSize: 28 },
});
