// Web-версия: react-native-maps в браузере не работает, поэтому вместо карты — список и ввод координат.
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { formatDistance, isValidLatLng, sortByDistance } from '../lib/geo';
import type { NotesMapProps } from './NotesMap.types';
import { colors } from './theme';

export default function NotesMap({ notes, position, style, pickerMode, picked, onPick, onNotePress }: NotesMapProps) {
  const [lat, setLat] = useState(picked ? String(picked.latitude) : '');
  const [lng, setLng] = useState(picked ? String(picked.longitude) : '');
  const point = { latitude: parseFloat(lat.replace(',', '.')), longitude: parseFloat(lng.replace(',', '.')) };

  if (pickerMode) {
    return (
      <View style={[styles.box, style]}>
        <Text style={styles.hint}>Карта доступна в приложении для iOS и Android. Здесь можно ввести координаты вручную.</Text>
        <View style={styles.row}>
          <TextInput style={styles.input} value={lat} onChangeText={setLat} placeholder="Широта, 55.75" placeholderTextColor={colors.muted} />
          <TextInput style={styles.input} value={lng} onChangeText={setLng} placeholder="Долгота, 37.62" placeholderTextColor={colors.muted} />
        </View>
        <Pressable
          style={[styles.button, !isValidLatLng(point) && { opacity: 0.4 }]}
          disabled={!isValidLatLng(point) || !onPick}
          onPress={() => onPick?.(point)}
        >
          <Text style={styles.buttonText}>Поставить точку</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.box, style]} contentContainerStyle={{ paddingBottom: 140 }}>
      <Text style={styles.hint}>Карта доступна в приложении для iOS и Android. В браузере — список заметок.</Text>
      {sortByDistance(notes, position).map(({ item, distance }) => (
        <Pressable key={item.id} style={styles.item} onPress={() => onNotePress?.(item.id)}>
          <Text style={styles.emoji}>{item.emoji}</Text>
          <Text style={styles.itemText} numberOfLines={1}>{item.text}</Text>
          {distance !== null && <Text style={styles.hint}>{formatDistance(distance)}</Text>}
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  box: { flex: 1, backgroundColor: colors.card, padding: 16 },
  hint: { fontSize: 13, color: colors.muted, marginBottom: 10 },
  row: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, backgroundColor: colors.bg, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: colors.text },
  button: { backgroundColor: colors.bg, borderRadius: 14, paddingVertical: 11, alignItems: 'center', marginTop: 8 },
  buttonText: { fontSize: 15, fontWeight: '600', color: colors.text },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  emoji: { fontSize: 22 },
  itemText: { flex: 1, fontSize: 15, color: colors.text },
});
