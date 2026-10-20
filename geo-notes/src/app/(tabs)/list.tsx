import { router } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '../../components/Button';
import { LocationNotice } from '../../components/LocationNotice';
import { card, colors } from '../../components/theme';
import { useNotes } from '../../context/NotesContext';
import { formatDistance, isSpent, sortByDistance } from '../../lib/geo';

export default function ListScreen() {
  const { ready, notes, position, triggers } = useNotes();
  const rows = useMemo(() => sortByDistance(notes, position), [notes, position]);

  if (!ready) return <ActivityIndicator style={{ marginTop: 40 }} />;

  if (notes.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyEmoji}>📍</Text>
        <Text style={styles.emptyTitle}>Пока нет заметок</Text>
        <Text style={styles.emptyText}>
          Оставьте заметку в нужном месте — «тут лучшая шаурма», «код домофона 1234» — и она всплывёт, когда вы окажетесь
          рядом.
        </Text>
        <Button label="＋ Добавить заметку" onPress={() => router.push('/new')} primary style={{ alignSelf: 'stretch' }} />
      </View>
    );
  }

  return (
    <FlatList
      contentContainerStyle={styles.container}
      data={rows}
      keyExtractor={(r) => r.item.id}
      ListHeaderComponent={
        <>
          <LocationNotice />
          <Button label="＋ Новая заметка" onPress={() => router.push('/new')} primary style={{ marginTop: 0, marginBottom: 12 }} />
        </>
      }
      renderItem={({ item: { item: n, distance } }) => {
        const inside = triggers[n.id]?.inside;
        const meta = [
          `радиус ${n.radius} м`,
          n.repeat === 'once' ? (isSpent(n, triggers) ? 'уже напомнила' : 'один раз') : null,
        ].filter(Boolean);
        return (
          <Pressable style={({ pressed }) => [card, styles.row, { opacity: pressed ? 0.7 : 1 }]} onPress={() => router.push(`/note/${n.id}`)}>
            <Text style={styles.emoji}>{n.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.text} numberOfLines={2}>{n.text}</Text>
              <Text style={styles.meta}>{meta.join(' · ')}</Text>
            </View>
            <Text style={[styles.distance, inside && { color: colors.ok }]}>
              {inside ? 'вы здесь' : distance !== null ? formatDistance(distance) : '—'}
            </Text>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  emoji: { fontSize: 28 },
  text: { fontSize: 16, color: colors.text },
  meta: { fontSize: 12, color: colors.muted, marginTop: 4 },
  distance: { fontSize: 14, fontWeight: '600', color: colors.text },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyEmoji: { fontSize: 48, marginBottom: 8 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 8 },
  emptyText: { fontSize: 15, lineHeight: 21, color: colors.muted, textAlign: 'center', marginBottom: 20 },
});
