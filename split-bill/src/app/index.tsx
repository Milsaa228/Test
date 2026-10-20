import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { card, colors } from '../components/theme';
import { Button, errorText, notify } from '../components/ui';
import { useBills } from '../context/BillsContext';
import { pickPhoto } from '../lib/photo';
import { recognizeReceipt } from '../lib/receipt';
import { computeShares, formatRub } from '../lib/split';

export default function BillsScreen() {
  const { ready, bills, apiKey, ai, createBill } = useBills();
  const [busy, setBusy] = useState<string | null>(null);

  const fromPhoto = async (source: 'camera' | 'library') => {
    if (!apiKey) {
      notify('Нужен ключ', 'Добавьте бесплатный ключ OpenRouter в настройках, чтобы распознавать чеки.');
      router.navigate('/settings');
      return;
    }
    try {
      const photo = await pickPhoto(source);
      if (!photo) return;
      setBusy('Нейросеть читает чек…');
      const receipt = await recognizeReceipt(ai, photo);
      if (!receipt.items.length) {
        notify('Чек не распознан', 'Попробуйте сфотографировать ровнее и при хорошем свете — или добавьте позиции вручную.');
        return;
      }
      const bill = await createBill({
        title: receipt.merchant ?? 'Счёт по чеку',
        items: receipt.items,
        tipPercent: receipt.tipPercent,
        receiptTotal: receipt.total,
      });
      router.navigate({ pathname: '/bill/[id]', params: { id: bill.id } });
    } catch (e) {
      notify('Ошибка', errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const manual = async () => {
    const bill = await createBill();
    router.navigate({ pathname: '/bill/[id]', params: { id: bill.id } });
  };

  if (!ready) return <ActivityIndicator style={{ marginTop: 40 }} />;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={() => router.navigate('/settings')} hitSlop={12}>
              <Text style={{ fontSize: 22 }}>⚙️</Text>
            </Pressable>
          ),
        }}
      />

      <View style={card}>
        <Text style={styles.title}>Новый счёт</Text>
        <Text style={styles.text}>
          Сфотографируйте чек — нейросеть разберёт позиции. Потом отметьте, кто что ел, и отправьте друзьям, сколько они должны.
        </Text>
        {busy ? (
          <View style={styles.busy}>
            <ActivityIndicator color={colors.text} />
            <Text style={styles.busyText}>{busy}</Text>
          </View>
        ) : (
          <>
            <Button label="📷 Сфотографировать чек" onPress={() => fromPhoto('camera')} primary />
            <Button label="🖼 Выбрать фото" onPress={() => fromPhoto('library')} />
            <Button label="✍️ Ввести вручную" onPress={manual} />
          </>
        )}
      </View>

      {bills.length > 0 && <Text style={styles.section}>История</Text>}
      {bills.map((b) => {
        const total = computeShares(b).reduce((s, x) => s + x.amount, 0);
        return (
          <Pressable key={b.id} style={[card, styles.row]} onPress={() => router.navigate({ pathname: '/bill/[id]', params: { id: b.id } })}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={styles.rowTitle} numberOfLines={1}>{b.title}</Text>
              <Text style={styles.hint}>
                {new Date(b.createdAt).toLocaleDateString('ru-RU')} · {b.people.length} чел. · {b.items.length} поз.
              </Text>
            </View>
            <Text style={styles.rowAmount}>{formatRub(total)}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 6 },
  text: { fontSize: 14, lineHeight: 20, color: colors.muted, marginBottom: 12 },
  hint: { fontSize: 12, color: colors.muted, marginTop: 4 },
  section: { fontSize: 13, fontWeight: '600', color: colors.muted, marginTop: 8, marginBottom: 8, marginLeft: 4 },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  rowAmount: { fontSize: 16, fontWeight: '700', color: colors.text },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.accent, borderRadius: 14, padding: 14 },
  busyText: { fontSize: 15, color: colors.accentText },
});
