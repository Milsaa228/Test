import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { card, colors } from '../../components/theme';
import { Busy, Button, Chip, confirm, errorText, notify } from '../../components/ui';
import { useData } from '../../context/DataContext';
import { notificationsSupported, requestNotificationPermission } from '../../lib/notifications';
import { DIETS } from '../../lib/types';

const TIMES = [15, 30, 60, 0];

export default function SettingsScreen() {
  const { apiKey, setApiKey, settings, updateSettings, products, favorites, clear } = useData();
  // Черновики полей: пока пользователь ничего не ввёл, показываем сохранённые значения (они грузятся асинхронно).
  const [draftKey, setKey] = useState<string | null>(null);
  const [draftExclusions, setExclusions] = useState<string | null>(null);
  const key = draftKey ?? apiKey;
  const exclusions = draftExclusions ?? settings.exclusions;
  const [busy, setBusy] = useState<string | null>(null);

  const onSaveKey = async () => {
    const trimmed = key.trim();
    if (trimmed && !trimmed.startsWith('sk-ant-')) {
      notify('Похоже, это не ключ Anthropic', 'Ключ начинается с «sk-ant-». Его можно создать на console.anthropic.com.');
      return;
    }
    try {
      await setApiKey(trimmed);
      setKey(null);
      notify(trimmed ? 'Ключ сохранён' : 'Ключ удалён');
    } catch (e) {
      notify('Ошибка', errorText(e));
    }
  };

  const onToggleNotifications = async (value: boolean) => {
    if (value && !(await requestNotificationPermission())) {
      notify('Уведомления запрещены', 'Разрешите уведомления для приложения в настройках телефона.');
      return;
    }
    await updateSettings({ notifications: value });
  };

  const onClear = () =>
    confirm('Удалить все данные?', 'Продукты, рецепты, настройки и ключ API будут удалены с устройства.', 'Удалить', async () => {
      setBusy('Удаляем…');
      try {
        await clear();
        setKey(null);
        setExclusions(null);
      } catch (e) {
        notify('Ошибка', errorText(e));
      } finally {
        setBusy(null);
      }
    }, true);

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      {busy && <Busy text={busy} />}

      <View style={card}>
        <Text style={styles.title}>Ключ Claude API</Text>
        <Text style={styles.text}>
          Фото и список продуктов отправляются напрямую в Claude (api.anthropic.com) с вашим ключом. Ключ хранится только на
          этом устройстве.
        </Text>
        <TextInput
          style={styles.input}
          placeholder="sk-ant-…"
          placeholderTextColor={colors.muted}
          value={key}
          onChangeText={setKey}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Button label={apiKey && key.trim() === apiKey ? 'Ключ сохранён ✓' : 'Сохранить ключ'} onPress={onSaveKey} disabled={key.trim() === apiKey} primary />
        <Pressable onPress={() => Linking.openURL('https://console.anthropic.com/settings/keys')}>
          <Text style={styles.link}>Где взять ключ: console.anthropic.com →</Text>
        </Pressable>
      </View>

      <View style={card}>
        <Text style={styles.title}>Предпочтения для рецептов</Text>
        <Text style={styles.label}>Питание</Text>
        <View style={styles.wrap}>
          {DIETS.map((d) => <Chip key={d} label={d} active={settings.diet === d} onPress={() => updateSettings({ diet: d })} />)}
        </View>

        <Text style={styles.label}>Исключить (аллергии, нелюбимое)</Text>
        <TextInput
          style={styles.input}
          placeholder="Например: орехи, кинза, грибы"
          placeholderTextColor={colors.muted}
          value={exclusions}
          onChangeText={setExclusions}
          onBlur={() => exclusions !== settings.exclusions && updateSettings({ exclusions })}
          onSubmitEditing={() => updateSettings({ exclusions })}
        />

        <Text style={styles.label}>Время готовки</Text>
        <View style={styles.segment}>
          {TIMES.map((t) => (
            <Pressable key={t} style={[styles.segmentItem, settings.maxMinutes === t && styles.segmentActive]} onPress={() => updateSettings({ maxMinutes: t })}>
              <Text style={styles.segmentText}>{t ? `до ${t} мин` : 'неважно'}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Порций</Text>
        <View style={styles.stepper}>
          <Button label="−" onPress={() => updateSettings({ servings: Math.max(1, settings.servings - 1) })} disabled={settings.servings <= 1} small />
          <Text style={styles.servings}>{settings.servings}</Text>
          <Button label="+" onPress={() => updateSettings({ servings: Math.min(12, settings.servings + 1) })} disabled={settings.servings >= 12} small />
        </View>
      </View>

      <View style={card}>
        <Text style={styles.title}>Напоминания</Text>
        <View style={styles.switchRow}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={styles.switchLabel}>Утром в 9:00</Text>
            <Text style={styles.hint}>
              {notificationsSupported
                ? 'Уведомление о продуктах, которые испортятся завтра. Обновляется при каждом открытии приложения.'
                : 'В браузере уведомления недоступны — используйте приложение на телефоне.'}
            </Text>
          </View>
          <Switch
            value={settings.notifications && notificationsSupported}
            onValueChange={onToggleNotifications}
            disabled={!notificationsSupported}
            trackColor={{ true: colors.accent, false: colors.border }}
          />
        </View>
      </View>

      <View style={card}>
        <Text style={styles.title}>Данные</Text>
        <Text style={styles.text}>
          Продуктов: {products.length} · в избранном: {favorites.length}
        </Text>
        <Button label="Удалить все данные" onPress={onClear} disabled={!!busy} danger />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 6 },
  text: { fontSize: 14, lineHeight: 20, color: colors.muted, marginBottom: 12 },
  hint: { fontSize: 12, color: colors.muted, marginTop: 4 },
  link: { fontSize: 14, color: colors.text, textDecorationLine: 'underline', marginTop: 12, textAlign: 'center' },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, marginTop: 12, marginBottom: 6 },
  input: { backgroundColor: colors.bg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text, marginBottom: 10 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  segment: { flexDirection: 'row', backgroundColor: colors.bg, borderRadius: 12, padding: 3, marginBottom: 6 },
  segmentItem: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10 },
  segmentActive: { backgroundColor: colors.card },
  segmentText: { fontSize: 13, color: colors.text },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  servings: { fontSize: 17, fontWeight: '700', color: colors.text, minWidth: 24, textAlign: 'center' },
  switchRow: { flexDirection: 'row', alignItems: 'center' },
  switchLabel: { fontSize: 15, color: colors.text },
});
