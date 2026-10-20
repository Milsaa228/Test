import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '../components/Button';
import { errorText, notify } from '../components/dialogs';
import { card, colors } from '../components/theme';
import { useNotes } from '../context/NotesContext';
import { distanceMeters, formatDistance } from '../lib/geo';
import { decodeNotes, extractData } from '../lib/share';

/** Экран подтверждения импорта. Открывается по ссылке geonotes://import?data=… или вручную из настроек. */
export default function ImportScreen() {
  const params = useLocalSearchParams<{ data?: string }>();
  const { ready, notes, position, importNotes } = useNotes();
  const [data, setData] = useState(params.data ?? '');
  const [input, setInput] = useState('');

  const parsed = useMemo(() => {
    if (!data) return null;
    try {
      return { notes: decodeNotes(data), error: null };
    } catch (e) {
      return { notes: [], error: errorText(e) };
    }
  }, [data]);

  const known = new Set(notes.map((n) => n.id));
  const fresh = parsed?.notes.filter((n) => !known.has(n.id)) ?? [];

  const done = () => (router.canGoBack() ? router.back() : router.replace('/list'));

  const onImport = async () => {
    try {
      const { added, skipped } = await importNotes(fresh);
      notify('Готово', `Добавлено заметок: ${added}${skipped ? `\nУже были: ${skipped}` : ''}`);
      router.replace('/list');
    } catch (e) {
      notify('Ошибка', errorText(e));
    }
  };

  if (!parsed) {
    return (
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={card}>
          <Text style={styles.title}>Вставьте ссылку</Text>
          <Text style={styles.text}>Друг может отправить заметку кнопкой «Поделиться». Скопируйте ссылку из сообщения и вставьте сюда.</Text>
          <TextInput
            style={styles.input}
            placeholder="geonotes://import?data=…"
            placeholderTextColor={colors.muted}
            value={input}
            onChangeText={setInput}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
          />
          <Button label="Показать заметки" onPress={() => setData(extractData(input))} disabled={!input.trim()} primary />
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {parsed.error ? (
        <View style={card}>
          <Text style={styles.title}>Не получилось открыть ссылку</Text>
          <Text style={styles.text}>{parsed.error}</Text>
          <Button label="Ввести другую" onPress={() => setData('')} />
        </View>
      ) : (
        <>
          <View style={card}>
            <Text style={styles.title}>Вам прислали заметки: {parsed.notes.length}</Text>
            <Text style={styles.text}>
              {fresh.length === 0
                ? 'Все эти заметки у вас уже есть.'
                : `Будет добавлено: ${fresh.length}${fresh.length < parsed.notes.length ? ` (остальные уже есть)` : ''}.`}
            </Text>
          </View>
          {parsed.notes.map((n) => (
            <View key={n.id} style={[card, styles.row]}>
              <Text style={styles.emoji}>{n.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.noteText}>{n.text}</Text>
                <Text style={styles.meta}>
                  {position ? `${formatDistance(distanceMeters(position, n))} от вас · ` : ''}радиус {n.radius} м
                  {known.has(n.id) ? ' · уже есть' : ''}
                </Text>
              </View>
            </View>
          ))}
          <Button label={fresh.length ? `Добавить ${fresh.length}` : 'Готово'} onPress={fresh.length ? onImport : done} disabled={!ready} primary />
          {fresh.length > 0 && <Button label="Отмена" onPress={done} />}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 6 },
  text: { fontSize: 14, lineHeight: 20, color: colors.muted, marginBottom: 12 },
  input: { backgroundColor: colors.bg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, marginBottom: 6, minHeight: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  emoji: { fontSize: 28 },
  noteText: { fontSize: 16, color: colors.text },
  meta: { fontSize: 12, color: colors.muted, marginTop: 4 },
});
