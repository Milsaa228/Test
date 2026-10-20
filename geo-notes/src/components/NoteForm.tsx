import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useNotes, type NoteInput } from '../context/NotesContext';
import { distanceMeters, formatDistance, RADII } from '../lib/geo';
import { MAX_TEXT } from '../lib/share';
import type { LatLng, Repeat } from '../lib/types';
import { Button, Segment } from './Button';
import { LocationNotice } from './LocationNotice';
import NotesMap from './NotesMap';
import { card, CATEGORIES, colors } from './theme';

export interface NoteFormProps {
  initial?: Partial<NoteInput>;
  /** Точка, выбранная заранее (долгое нажатие на карте или существующая заметка). Иначе — где я сейчас. */
  initialPoint?: LatLng | null;
  /** id редактируемой заметки — её не рисуем на карте второй раз. */
  editingId?: string;
  submitLabel: string;
  onSubmit: (input: NoteInput) => Promise<void>;
  onCancel?: () => void;
}

export function NoteForm({ initial, initialPoint, editingId, submitLabel, onSubmit, onCancel }: NoteFormProps) {
  const { notes, position } = useNotes();
  const [text, setText] = useState(initial?.text ?? '');
  const [emoji, setEmoji] = useState(initial?.emoji ?? CATEGORIES[0].emoji);
  const [radius, setRadius] = useState(initial?.radius ?? RADII[1]);
  const [repeat, setRepeat] = useState<Repeat>(initial?.repeat ?? 'always');
  // null — «где я сейчас»: точка едет вместе с текущей позицией, пока не выбрали другую.
  const [picked, setPicked] = useState<LatLng | null>(initialPoint ?? null);
  const [saving, setSaving] = useState(false);

  const point = picked ?? (position ? { latitude: position.latitude, longitude: position.longitude } : null);
  const canSave = text.trim().length > 0 && !!point && !saving;

  const submit = async () => {
    if (!point) return;
    setSaving(true);
    try {
      await onSubmit({ text: text.trim(), emoji, radius, repeat, latitude: point.latitude, longitude: point.longitude });
    } finally {
      setSaving(false);
    }
  };

  let where = 'Место не выбрано';
  if (!picked && position) where = 'Где я сейчас';
  else if (picked && position) where = `Точка на карте · ${formatDistance(distanceMeters(position, picked))} от вас`;
  else if (picked) where = 'Точка на карте';

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={card}>
        <TextInput
          style={styles.input}
          placeholder="Например: тут лучшая шаурма"
          placeholderTextColor={colors.muted}
          value={text}
          onChangeText={setText}
          multiline
          maxLength={MAX_TEXT}
          autoFocus={!initial?.text}
        />
        <View style={styles.emojis}>
          {CATEGORIES.map((c) => (
            <Pressable key={c.emoji} style={[styles.emojiItem, emoji === c.emoji && styles.emojiActive]} onPress={() => setEmoji(c.emoji)}>
              <Text style={styles.emoji}>{c.emoji}</Text>
              <Text style={styles.emojiLabel}>{c.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={card}>
        <Text style={styles.label}>Сработает в радиусе</Text>
        <Segment options={RADII.map((r) => ({ value: r, label: `${r} м` }))} value={radius} onChange={setRadius} />
        <Text style={styles.label}>Напоминать</Text>
        <Segment
          options={[
            { value: 'always', label: 'Каждый раз' },
            { value: 'once', label: 'Один раз' },
          ]}
          value={repeat}
          onChange={setRepeat}
        />
        <Text style={styles.hint}>
          {repeat === 'once' ? 'Напомнит при первом приближении и больше не будет.' : 'Напомнит при каждом приходе, но не чаще паузы из настроек.'}
        </Text>
      </View>

      <View style={card}>
        <Text style={styles.label}>Место: {where}</Text>
        <View style={styles.mapBox}>
          <NotesMap
            notes={notes.filter((n) => n.id !== editingId)}
            position={position}
            pickerMode
            picked={point}
            pickedRadius={radius}
            onPick={setPicked}
          />
        </View>
        <Text style={styles.hint}>Коснитесь карты, чтобы выбрать другое место.</Text>
        {picked && position && <Button label="📍 Где я сейчас" onPress={() => setPicked(null)} />}
      </View>

      {!picked && <LocationNotice />}

      <Button label={saving ? 'Сохраняем…' : submitLabel} onPress={submit} disabled={!canSave} primary />
      {onCancel && <Button label="Отмена" onPress={onCancel} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },
  input: { fontSize: 17, color: colors.text, minHeight: 60, textAlignVertical: 'top' },
  emojis: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  emojiItem: { alignItems: 'center', paddingVertical: 6, paddingHorizontal: 8, borderRadius: 12, backgroundColor: colors.bg, minWidth: 64 },
  emojiActive: { backgroundColor: colors.accent },
  emoji: { fontSize: 22 },
  emojiLabel: { fontSize: 11, color: colors.text, marginTop: 2 },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, marginBottom: 6, marginTop: 4 },
  hint: { fontSize: 12, color: colors.muted, marginTop: 6 },
  mapBox: { height: 240, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.bg },
});
