import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { card, colors } from '../components/theme';
import { Button, confirm, notify } from '../components/ui';
import { useBills } from '../context/BillsContext';

export default function SettingsScreen() {
  const { settings, updateSettings, apiKey, setApiKey, bills, clear } = useBills();
  const [key, setKey] = useState(apiKey);

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={card}>
        <Text style={styles.title}>Ключ Claude API</Text>
        <Text style={styles.text}>
          Нужен для распознавания чеков. Получите ключ на console.anthropic.com → API Keys. Он хранится в защищённом
          хранилище телефона, а фото чека уходит напрямую в api.anthropic.com.
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
        <Button
          label="Сохранить ключ"
          primary
          disabled={key.trim() === apiKey}
          onPress={() => setApiKey(key).then(() => notify('Ключ сохранён'))}
        />
      </View>

      <View style={card}>
        <Text style={styles.title}>Для сообщения друзьям</Text>
        <Text style={styles.label}>Ваше имя</Text>
        <TextInput style={styles.input} value={settings.myName} onChangeText={(v) => updateSettings({ myName: v })} placeholder="Я" placeholderTextColor={colors.muted} />
        <Text style={styles.label}>Куда переводить</Text>
        <TextInput
          style={styles.input}
          value={settings.paymentDetails}
          onChangeText={(v) => updateSettings({ paymentDetails: v })}
          placeholder="+7 900 000-00-00 (СБП)"
          placeholderTextColor={colors.muted}
          keyboardType="phone-pad"
        />
        <Text style={styles.label}>Банк</Text>
        <TextInput style={styles.input} value={settings.bank} onChangeText={(v) => updateSettings({ bank: v })} placeholder="Т-Банк" placeholderTextColor={colors.muted} />
        <Text style={styles.hint}>Реквизиты подставляются в сообщение, если платили вы.</Text>
      </View>

      <View style={card}>
        <Text style={styles.title}>Данные</Text>
        <Text style={styles.text}>Сохранено счетов: {bills.length}</Text>
        <Button
          label="Удалить все данные"
          danger
          onPress={() =>
            confirm('Удалить все данные?', 'Счета, настройки и ключ будут удалены с устройства.', 'Удалить', () =>
              clear().then(() => {
                setKey('');
                router.back();
              }),
            )
          }
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 6 },
  text: { fontSize: 14, lineHeight: 20, color: colors.muted, marginBottom: 12 },
  hint: { fontSize: 12, color: colors.muted, marginTop: 4 },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, marginTop: 4, marginBottom: 6 },
  input: { backgroundColor: colors.bg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text, marginBottom: 10 },
});
