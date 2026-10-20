import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { card, colors } from '../components/theme';
import { Button, Chip, confirm, notify } from '../components/ui';
import { useData } from '../context/DataContext';
import { addDays, dateKey, daysLeft, expiryLabel, formatRuDate, parseRuDate } from '../lib/expiry';
import { newId } from '../lib/inventory';
import { CATEGORIES, UNITS, type Category, type Product, type Unit } from '../lib/types';

const QUICK_DAYS = [1, 3, 7, 14, 30];

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { ready, products } = useData();
  if (!ready) return <ActivityIndicator style={{ marginTop: 40 }} color={colors.text} />;
  const existing = id ? products.find((p) => p.id === id) : undefined;
  // key: форма заново заполняется, если открыть другой продукт.
  return <ProductForm key={existing?.id ?? 'new'} existing={existing} notFound={!!id && !existing} />;
}

function ProductForm({ existing, notFound }: { existing?: Product; notFound: boolean }) {
  const { saveProduct, removeProduct } = useData();
  const today = dateKey(new Date());

  const [name, setName] = useState(existing?.name ?? '');
  const [amount, setAmount] = useState(existing ? String(existing.amount).replace('.', ',') : '1');
  const [unit, setUnit] = useState<Unit>(existing?.unit ?? 'шт');
  const [category, setCategory] = useState<Category>(existing?.category ?? 'Другое');
  const [added, setAdded] = useState(formatRuDate(existing?.addedAt ?? today));
  const [expires, setExpires] = useState(formatRuDate(existing?.expiresAt ?? addDays(today, 7)));

  const addedKey = parseRuDate(added);
  const expiresKey = parseRuDate(expires);

  const shiftExpiry = (days: number) => setExpires(formatRuDate(addDays(expiresKey ?? today, days)));

  const onSave = async () => {
    const qty = Number(amount.replace(',', '.'));
    if (!name.trim()) return notify('Введите название');
    if (!Number.isFinite(qty) || qty <= 0) return notify('Количество должно быть больше нуля');
    if (!addedKey || !expiresKey) return notify('Проверьте даты', 'Формат: ДД.ММ.ГГГГ');
    const product: Product = {
      id: existing?.id ?? newId(),
      name: name.trim(),
      amount: qty,
      unit,
      category,
      addedAt: addedKey,
      expiresAt: expiresKey,
    };
    await saveProduct(product);
    router.back();
  };

  const onDelete = () =>
    existing &&
    confirm('Удалить продукт?', `«${existing.name}» пропадёт из списка.`, 'Удалить', async () => {
      await removeProduct(existing.id);
      router.back();
    }, true);

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: existing ? 'Изменить продукт' : 'Новый продукт' }} />
      {notFound ? <Text style={styles.hint}>Продукт не найден — будет создан новый.</Text> : null}

      <View style={card}>
        <Text style={styles.label}>Название</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Например, молоко" placeholderTextColor={colors.muted} />

        <Text style={styles.label}>Количество</Text>
        <TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
        <View style={styles.wrap}>
          {UNITS.map((u) => <Chip key={u} label={u} active={unit === u} onPress={() => setUnit(u)} />)}
        </View>

        <Text style={styles.label}>Категория</Text>
        <View style={styles.wrap}>
          {CATEGORIES.map((c) => <Chip key={c} label={c} active={category === c} onPress={() => setCategory(c)} />)}
        </View>
      </View>

      <View style={card}>
        <Text style={styles.label}>Добавлен</Text>
        <TextInput style={styles.input} value={added} onChangeText={setAdded} placeholder="ДД.ММ.ГГГГ" placeholderTextColor={colors.muted} />

        <Text style={styles.label}>Годен до</Text>
        <View style={styles.dateRow}>
          <Button label="−1" onPress={() => shiftExpiry(-1)} small />
          <TextInput
            style={[styles.input, { flex: 1, minWidth: 0, marginBottom: 0 }]}
            value={expires}
            onChangeText={setExpires}
            placeholder="ДД.ММ.ГГГГ"
            placeholderTextColor={colors.muted}
          />
          <Button label="+1" onPress={() => shiftExpiry(1)} small />
        </View>
        <Text style={[styles.hint, !expiresKey && { color: colors.danger }]}>
          {expiresKey ? expiryLabel(expiresKey) : 'Неверная дата, формат ДД.ММ.ГГГГ'}
        </Text>
        <View style={[styles.wrap, { marginTop: 8 }]}>
          {QUICK_DAYS.map((d) => (
            <Chip
              key={d}
              label={`${d} дн.`}
              active={!!expiresKey && daysLeft(expiresKey) === d}
              onPress={() => setExpires(formatRuDate(addDays(today, d)))}
            />
          ))}
        </View>
      </View>

      <Button label="Сохранить" onPress={onSave} primary />
      {existing ? <Button label="Удалить" onPress={onDelete} danger /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, marginTop: 6, marginBottom: 6 },
  input: { backgroundColor: colors.bg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text, marginBottom: 10 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hint: { fontSize: 13, color: colors.muted, marginTop: 6 },
});
