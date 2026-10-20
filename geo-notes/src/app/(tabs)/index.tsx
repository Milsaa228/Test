import { router } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { LocationNotice } from '../../components/LocationNotice';
import NotesMap from '../../components/NotesMap';
import { card, colors } from '../../components/theme';
import { useNotes } from '../../context/NotesContext';
import type { LatLng } from '../../lib/types';

export default function MapScreen() {
  const { ready, notes, position } = useNotes();

  if (!ready) return <ActivityIndicator style={{ marginTop: 40 }} />;

  const addAt = (p: LatLng) => router.push({ pathname: '/new', params: { lat: String(p.latitude), lng: String(p.longitude) } });

  return (
    <View style={styles.container}>
      <NotesMap notes={notes} position={position} onPick={addAt} onNotePress={(id) => router.push(`/note/${id}`)} />

      <View style={styles.top} pointerEvents="box-none">
        <LocationNotice compact />
      </View>

      <View style={styles.bottom} pointerEvents="box-none">
        <View style={[card, styles.panel]}>
          <Text style={styles.hint}>
            {notes.length === 0
              ? 'Заметок пока нет. Удерживайте палец на карте, чтобы оставить заметку в любом месте, или добавьте её там, где вы сейчас.'
              : 'Удерживайте палец на карте, чтобы оставить заметку в этом месте.'}
          </Text>
          <Pressable style={({ pressed }) => [styles.add, { opacity: pressed ? 0.7 : 1 }]} onPress={() => router.push('/new')}>
            <Text style={styles.addText}>＋ Заметка здесь</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  top: { position: 'absolute', top: 12, left: 12, right: 12 },
  bottom: { position: 'absolute', bottom: 12, left: 12, right: 12 },
  panel: { marginBottom: 0 },
  hint: { fontSize: 13, lineHeight: 18, color: colors.muted, marginBottom: 10 },
  add: { backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 13, alignItems: 'center' },
  addText: { fontSize: 15, fontWeight: '700', color: colors.accentText },
});
