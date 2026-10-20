import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { Button, Segment } from '../../components/Button';
import { confirm, errorText, notify } from '../../components/dialogs';
import { shareNotes } from '../../components/shareNotes';
import { card, colors } from '../../components/theme';
import { useNotes } from '../../context/NotesContext';
import { backgroundSupported, isExpoGo, requestBackgroundPermission } from '../../lib/background';
import { isSpent } from '../../lib/geo';
import { extractData } from '../../lib/share';

const COOLDOWNS = [
  { value: 15, label: '15 мин' },
  { value: 60, label: '1 ч' },
  { value: 360, label: '6 ч' },
  { value: 1440, label: '24 ч' },
];

export default function SettingsScreen() {
  const { notes, triggers, settings, updateSettings, resetTriggers, clear } = useNotes();
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);

  const onBackground = async (enabled: boolean) => {
    if (!enabled) return updateSettings({ backgroundEnabled: false });
    setBusy(true);
    try {
      const res = await requestBackgroundPermission();
      if (res === 'granted') await updateSettings({ backgroundEnabled: true });
      else if (res === 'unsupported') notify('Недоступно', backgroundHint);
      else
        notify(
          'Нужен доступ «Всегда»',
          Platform.OS === 'ios'
            ? 'Откройте Настройки → Гео-заметки → Геопозиция и выберите «Всегда».'
            : 'Откройте настройки приложения → Разрешения → Местоположение и выберите «Разрешить в любом режиме».',
        );
    } catch (e) {
      notify('Ошибка', errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const onImport = () => {
    const data = extractData(link);
    if (!data) return;
    setLink('');
    router.push({ pathname: '/import', params: { data } });
  };

  const onClear = () =>
    confirm('Удалить все заметки?', 'Заметки и история напоминаний будут удалены с устройства.', 'Удалить', () => {
      clear().catch((e) => notify('Ошибка', errorText(e)));
    });

  const spent = notes.filter((n) => isSpent(n, triggers)).length;

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={card}>
        <Text style={styles.title}>Напоминания</Text>
        <Text style={styles.text}>
          Пока приложение открыто, оно следит за позицией и показывает баннер и уведомление, когда вы входите в зону
          заметки. Повторно та же заметка напомнит не раньше, чем через:
        </Text>
        <Segment options={COOLDOWNS} value={settings.cooldownMinutes} onChange={(v) => updateSettings({ cooldownMinutes: v })} />
      </View>

      <View style={card}>
        <View style={styles.switchRow}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={styles.switchLabel}>Фоновый режим</Text>
            <Text style={styles.hint}>Напоминать, даже когда приложение закрыто (геозоны системы, до 20 ближайших заметок)</Text>
          </View>
          <Switch
            value={settings.backgroundEnabled}
            onValueChange={onBackground}
            disabled={busy || (!backgroundSupported && !settings.backgroundEnabled)}
            trackColor={{ true: colors.accent, false: colors.border }}
          />
        </View>
        {!backgroundSupported && <Text style={[styles.hint, { marginTop: 10 }]}>{backgroundHint}</Text>}
      </View>

      <View style={card}>
        <Text style={styles.title}>Обмен с друзьями</Text>
        <Text style={styles.text}>
          Заметки передаются ссылкой, без сервера. Друг откроет её — и заметки добавятся к его собственным.
        </Text>
        <Button label="Поделиться всеми заметками" onPress={() => shareNotes(notes)} disabled={notes.length === 0} />
        <Text style={styles.label}>Импорт по ссылке</Text>
        <TextInput
          style={styles.input}
          placeholder="geonotes://import?data=…"
          placeholderTextColor={colors.muted}
          value={link}
          onChangeText={setLink}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Button label="Открыть ссылку" onPress={onImport} disabled={!link.trim()} />
      </View>

      <View style={card}>
        <Text style={styles.title}>Данные</Text>
        <Text style={styles.text}>
          Заметок: {notes.length}
          {spent ? ` · уже напомнили «один раз»: ${spent}` : ''}. Всё хранится только на этом устройстве.
        </Text>
        <Button label="Сбросить историю напоминаний" onPress={() => resetTriggers().then(() => notify('Готово', 'Все заметки снова могут напомнить о себе.'))} disabled={notes.length === 0} />
        <Button label="Удалить все заметки" onPress={onClear} disabled={notes.length === 0} danger />
      </View>
    </ScrollView>
  );
}

const backgroundHint =
  Platform.OS === 'web'
    ? 'В браузере фоновый режим недоступен.'
    : isExpoGo
      ? 'В Expo Go фоновая геолокация не работает. Соберите development build (npx expo run:ios / run:android или EAS).'
      : 'Фоновый режим недоступен на этом устройстве.';

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 6 },
  text: { fontSize: 14, lineHeight: 20, color: colors.muted, marginBottom: 12 },
  hint: { fontSize: 12, color: colors.muted, marginTop: 4 },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, marginTop: 16, marginBottom: 6 },
  input: { backgroundColor: colors.bg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text, marginBottom: 4 },
  switchRow: { flexDirection: 'row', alignItems: 'center' },
  switchLabel: { fontSize: 15, color: colors.text },
});
