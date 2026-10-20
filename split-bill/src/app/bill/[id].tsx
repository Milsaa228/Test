import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';

import { card, colors } from '../../components/theme';
import { Button, confirm, errorText, notify } from '../../components/ui';
import { useBills } from '../../context/BillsContext';
import { computeShares, formatRub, itemsTotal, newId, shareMessage, toKopecks } from '../../lib/split';
import type { Bill, BillItem, Person } from '../../lib/types';

const TIPS = [0, 5, 10, 15];

/** «1 250,50» → 1250.5; пустая или кривая строка → NaN. */
function parseRub(text: string): number {
  return Number(text.replace(/\s/g, '').replace(',', '.'));
}

export default function BillScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { bills, settings, updateBill, deleteBill } = useBills();
  const bill = bills.find((b) => b.id === id);
  const [newPerson, setNewPerson] = useState('');
  const shares = useMemo(() => (bill ? computeShares(bill) : []), [bill]);

  if (!bill) {
    return (
      <View style={styles.empty}>
        <Text style={styles.text}>Счёт не найден</Text>
      </View>
    );
  }

  const update = (patch: Partial<Bill> | ((b: Bill) => Partial<Bill>)) => updateBill(bill.id, patch);
  const updateItem = (itemId: string, patch: Partial<BillItem>) =>
    update((b) => ({ items: b.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) }));

  const addPerson = () => {
    const name = newPerson.trim();
    if (!name) return;
    update((b) => ({ people: [...b.people, { id: newId(), name }] }));
    setNewPerson('');
  };

  const removePerson = (p: Person) =>
    confirm(`Убрать ${p.name}?`, 'Позиции этого человека снова будут делиться на всех.', 'Убрать', () =>
      update((b) => ({
        people: b.people.filter((x) => x.id !== p.id),
        items: b.items.map((i) => ({ ...i, assignees: i.assignees.filter((a) => a !== p.id) })),
        payerId: b.payerId === p.id ? undefined : b.payerId,
      })),
    );

  const toggle = (item: BillItem, personId: string) =>
    updateItem(item.id, {
      assignees: item.assignees.includes(personId) ? item.assignees.filter((a) => a !== personId) : [...item.assignees, personId],
    });

  const onShare = async () => {
    try {
      await Share.share({ message: shareMessage(bill, shares, settings.paymentDetails, settings.bank) });
    } catch (e) {
      notify('Не удалось поделиться', errorText(e));
    }
  };

  const sum = itemsTotal(bill.items);
  const total = shares.reduce((s, x) => s + x.amount, 0);
  const diff = bill.receiptTotal !== undefined ? toKopecks(bill.receiptTotal) - total : 0;

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: bill.title }} />

      <View style={card}>
        <TextInput style={styles.titleInput} value={bill.title} onChangeText={(title) => update({ title })} placeholder="Название" />
        <Text style={styles.label}>Кто был · нажмите, чтобы выбрать, кто платил</Text>
        <View style={styles.chips}>
          {bill.people.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => update({ payerId: p.id })}
              onLongPress={() => removePerson(p)}
              style={[styles.chip, bill.payerId === p.id && styles.chipActive]}
            >
              <Text style={styles.chipText}>{bill.payerId === p.id ? '💳 ' : ''}{p.name}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.addRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={newPerson}
            onChangeText={setNewPerson}
            onSubmitEditing={addPerson}
            placeholder="Имя друга"
            placeholderTextColor={colors.muted}
            returnKeyType="done"
          />
          <Pressable style={styles.addButton} onPress={addPerson}>
            <Text style={styles.addButtonText}>+</Text>
          </Pressable>
        </View>
        <Text style={styles.hint}>Долгое нажатие на имя — убрать из счёта.</Text>
      </View>

      <View style={card}>
        <Text style={styles.cardTitle}>Позиции</Text>
        <Text style={styles.hint}>Отметьте, кто ел. Если никто не отмечен — позиция делится на всех.</Text>
        {bill.items.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            people={bill.people}
            onChange={(patch) => updateItem(item.id, patch)}
            onToggle={(pid) => toggle(item, pid)}
            onDelete={() => update((b) => ({ items: b.items.filter((i) => i.id !== item.id) }))}
          />
        ))}
        <Button
          label="+ Добавить позицию"
          onPress={() => update((b) => ({ items: [...b.items, { id: newId(), name: '', price: 0, quantity: 1, assignees: [] }] }))}
        />
        <View style={styles.sumRow}>
          <Text style={styles.text}>Сумма позиций</Text>
          <Text style={styles.sumValue}>{formatRub(sum)}</Text>
        </View>
      </View>

      <View style={card}>
        <Text style={styles.cardTitle}>Чаевые / сервисный сбор</Text>
        <View style={styles.segment}>
          {TIPS.map((t) => (
            <Pressable key={t} style={[styles.segmentItem, bill.tipPercent === t && styles.segmentActive]} onPress={() => update({ tipPercent: t })}>
              <Text style={styles.segmentText}>{t}%</Text>
            </Pressable>
          ))}
        </View>
        {!TIPS.includes(bill.tipPercent) && <Text style={styles.hint}>Из чека: {bill.tipPercent}%</Text>}
      </View>

      <View style={card}>
        <Text style={styles.cardTitle}>Кто сколько должен</Text>
        {shares.map((s) => (
          <View key={s.personId} style={styles.share}>
            <View style={styles.shareHeader}>
              <Text style={styles.shareName}>
                {s.name}
                {s.personId === bill.payerId ? ' · платил' : ''}
              </Text>
              <Text style={styles.shareAmount}>{formatRub(s.amount)}</Text>
            </View>
            {s.items.map((line, i) => (
              <Text key={i} style={styles.hint} numberOfLines={1}>
                {line.name || 'Без названия'} — {formatRub(line.amount)}
              </Text>
            ))}
          </View>
        ))}
        <View style={styles.sumRow}>
          <Text style={styles.text}>Итого</Text>
          <Text style={styles.sumValue}>{formatRub(total)}</Text>
        </View>
        {diff !== 0 && (
          <Text style={[styles.hint, { color: colors.danger }]}>
            По чеку {formatRub(toKopecks(bill.receiptTotal!))}, расходится на {formatRub(diff)} — проверьте позиции.
          </Text>
        )}
        <Button label="Отправить друзьям" onPress={onShare} primary disabled={!total} />
      </View>

      <Button
        label="Удалить счёт"
        danger
        onPress={() =>
          confirm('Удалить счёт?', bill.title, 'Удалить', () => {
            router.back();
            deleteBill(bill.id);
          })
        }
      />
    </ScrollView>
  );
}

function ItemRow({ item, people, onChange, onToggle, onDelete }: {
  item: BillItem;
  people: Person[];
  onChange: (patch: Partial<BillItem>) => void;
  onToggle: (personId: string) => void;
  onDelete: () => void;
}) {
  // Цену редактируем строкой, чтобы можно было набрать «12,» — в число переводим при выходе из поля.
  const [price, setPrice] = useState(item.price ? String(item.price).replace('.', ',') : '');

  return (
    <View style={styles.item}>
      <View style={styles.itemHeader}>
        <TextInput
          style={styles.itemName}
          value={item.name}
          onChangeText={(name) => onChange({ name })}
          placeholder="Название"
          placeholderTextColor={colors.muted}
          multiline
        />
        <TextInput
          style={styles.itemPrice}
          value={price}
          onChangeText={setPrice}
          onBlur={() => {
            const value = parseRub(price);
            onChange({ price: Number.isFinite(value) ? Math.round(value * 100) / 100 : 0 });
          }}
          placeholder="0"
          placeholderTextColor={colors.muted}
          keyboardType="decimal-pad"
        />
        <Text style={styles.rub}>₽</Text>
        <Pressable onPress={onDelete} hitSlop={10}>
          <Text style={styles.remove}>✕</Text>
        </Pressable>
      </View>
      {item.quantity !== 1 && <Text style={styles.hint}>× {item.quantity}</Text>}
      <View style={styles.chips}>
        {people.map((p) => (
          <Pressable key={p.id} onPress={() => onToggle(p.id)} style={[styles.smallChip, item.assignees.includes(p.id) && styles.chipActive]}>
            <Text style={styles.smallChipText}>{p.name}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  titleInput: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 8 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 4 },
  text: { fontSize: 14, color: colors.muted },
  hint: { fontSize: 12, color: colors.muted, marginTop: 4 },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, marginTop: 4, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7 },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { fontSize: 14, color: colors.text },
  smallChip: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4 },
  smallChipText: { fontSize: 12, color: colors.text },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  input: { backgroundColor: colors.bg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: colors.text },
  addButton: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  addButtonText: { fontSize: 22, fontWeight: '600', color: colors.accentText },
  item: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingVertical: 10, marginTop: 6 },
  itemHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  itemName: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: 4 },
  itemPrice: { width: 90, textAlign: 'right', fontSize: 15, fontWeight: '600', color: colors.text, backgroundColor: colors.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 },
  rub: { fontSize: 15, color: colors.muted },
  remove: { fontSize: 16, color: colors.muted, paddingHorizontal: 4 },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  sumValue: { fontSize: 17, fontWeight: '700', color: colors.text },
  segment: { flexDirection: 'row', backgroundColor: colors.bg, borderRadius: 12, padding: 3, marginTop: 8 },
  segmentItem: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10 },
  segmentActive: { backgroundColor: colors.card },
  segmentText: { fontSize: 14, color: colors.text },
  share: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  shareHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  shareName: { fontSize: 15, fontWeight: '600', color: colors.text },
  shareAmount: { fontSize: 15, fontWeight: '700', color: colors.text },
});
