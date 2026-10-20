import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '../../components/Button';
import { confirm, notify } from '../../components/dialogs';
import { NoteForm } from '../../components/NoteForm';
import NotesMap from '../../components/NotesMap';
import { openInMaps, openInYandex, shareNotes } from '../../components/shareNotes';
import { card, colors } from '../../components/theme';
import { useNotes } from '../../context/NotesContext';
import { distanceMeters, formatDistance, isSpent } from '../../lib/geo';

export default function NoteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { notes, position, triggers, updateNote, deleteNote, rearmNote } = useNotes();
  const [editing, setEditing] = useState(false);
  const note = notes.find((n) => n.id === id);

  if (!note) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>Заметка не найдена</Text>
        <Text style={styles.muted}>Возможно, её удалили.</Text>
        <Button label="К списку" onPress={() => router.navigate('/list')} />
      </View>
    );
  }

  if (editing) {
    return (
      <>
        <Stack.Screen options={{ title: 'Редактирование' }} />
        <NoteForm
          initial={note}
          initialPoint={note}
          editingId={note.id}
          submitLabel="Сохранить"
          onSubmit={async (input) => {
            await updateNote(note.id, input);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </>
    );
  }

  const entry = triggers[note.id];
  const spent = isSpent(note, triggers);
  const distance = position ? distanceMeters(position, note) : null;

  const onDelete = () =>
    confirm('Удалить заметку?', note.text, 'Удалить', async () => {
      await deleteNote(note.id);
      if (router.canGoBack()) router.back();
      else router.replace('/');
    });

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={card}>
        <Text style={styles.emoji}>{note.emoji}</Text>
        <Text style={styles.text} selectable>{note.text}</Text>
        <Text style={styles.meta}>
          {entry?.inside ? 'Вы сейчас здесь' : distance !== null ? `${formatDistance(distance)} от вас` : 'Расстояние неизвестно'}
          {' · '}радиус {note.radius} м
        </Text>
        <Text style={styles.meta}>
          {note.repeat === 'once' ? (spent ? 'Один раз — уже напомнила' : 'Напомнит один раз') : 'Напоминает каждый раз'}
          {entry?.lastFiredAt ? ` · последний раз ${new Date(entry.lastFiredAt).toLocaleString('ru-RU')}` : ''}
        </Text>
        {spent && (
          <Button label="Напомнить снова" onPress={() => rearmNote(note.id).then(() => notify('Готово', 'Заметка напомнит при следующем приближении.'))} />
        )}
      </View>

      <View style={[card, styles.mapCard]}>
        <NotesMap notes={[note]} position={position} />
      </View>

      <View style={card}>
        <Button label="✏️ Изменить" onPress={() => setEditing(true)} primary />
        <Button label="📤 Поделиться" onPress={() => shareNotes([note])} />
        <Button label="🗺️ Открыть в Яндекс Картах" onPress={() => openInYandex(note)} />
        <Button label="🧭 Открыть в другом приложении карт" onPress={() => openInMaps(note)} />
        <Button label="Удалить" onPress={onDelete} danger />
      </View>
      <Text style={styles.hint}>
        Создана {new Date(note.createdAt).toLocaleDateString('ru-RU')} · {note.latitude.toFixed(5)}, {note.longitude.toFixed(5)}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },
  emoji: { fontSize: 40, marginBottom: 6 },
  text: { fontSize: 20, fontWeight: '600', color: colors.text, marginBottom: 10 },
  meta: { fontSize: 13, color: colors.muted, marginBottom: 4 },
  mapCard: { height: 220, padding: 0, overflow: 'hidden' },
  hint: { fontSize: 12, color: colors.muted, textAlign: 'center' },
  muted: { fontSize: 15, color: colors.muted, marginBottom: 16 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 8 },
});
