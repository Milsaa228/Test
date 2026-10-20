import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { MonthSwitcher } from '../components/MonthSwitcher';
import { colors } from '../components/theme';
import { useData } from '../context/DataContext';
import { categoryColor } from '../lib/categories';
import { filterCounted, formatMoney, monthKey } from '../lib/stats';
import type { Transaction } from '../lib/types';

type Row = { type: 'header'; key: string; title: string; total: number } | { type: 'tx'; key: string; tx: Transaction };

const DAY_FORMAT = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', weekday: 'short' });
const TIME_FORMAT = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });

export default function OperationsScreen() {
  const { transactions, settings, month } = useData();
  const { category } = useLocalSearchParams<{ category?: string }>();
  const [query, setQuery] = useState('');

  const monthTxs = useMemo(
    () => filterCounted(transactions, settings.includeTransfers).filter((t) => monthKey(t.date) === month),
    [transactions, settings.includeTransfers, month],
  );

  const categories = useMemo(
    () => [...new Set(monthTxs.filter((t) => t.direction === 'expense').map((t) => t.category))].sort(),
    [monthTxs],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = monthTxs.filter(
      (t) =>
        (!category || t.category === category) &&
        (!q || t.description.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)),
    );
    const result: Row[] = [];
    let current: Extract<Row, { type: 'header' }> | null = null;
    for (const tx of filtered) {
      const day = tx.date.slice(0, 10);
      const title = DAY_FORMAT.format(new Date(tx.date));
      if (!current || current.title !== title) {
        current = { type: 'header', key: `h${day}${title}`, title, total: 0 };
        result.push(current);
      }
      if (tx.direction === 'expense') current.total += tx.amount;
      result.push({ type: 'tx', key: tx.id, tx });
    }
    return result;
  }, [monthTxs, category, query]);

  const setCategory = (value?: string) => router.setParams({ category: value });

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.top}>
        <MonthSwitcher />
        <TextInput
          style={styles.search}
          placeholder="Поиск по описанию или категории"
          placeholderTextColor={colors.muted}
          value={query}
          onChangeText={setQuery}
          clearButtonMode="while-editing"
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label="Все" active={!category} onPress={() => setCategory(undefined)} />
          {categories.map((c) => (
            <Chip key={c} label={c} color={categoryColor(c)} active={category === c} onPress={() => setCategory(category === c ? undefined : c)} />
          ))}
        </ScrollView>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.key}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
        ListEmptyComponent={<Text style={styles.empty}>Операций не найдено</Text>}
        renderItem={({ item }) =>
          item.type === 'header' ? (
            <View style={styles.header}>
              <Text style={styles.headerTitle}>{item.title}</Text>
              {item.total > 0 && <Text style={styles.headerTotal}>{formatMoney(item.total)}</Text>}
            </View>
          ) : (
            <OperationRow tx={item.tx} />
          )
        }
      />
    </View>
  );
}

function OperationRow({ tx }: { tx: Transaction }) {
  const color = categoryColor(tx.category);
  return (
    <View style={styles.row}>
      <View style={[styles.avatar, { backgroundColor: color + '33' }]}>
        <Text style={[styles.avatarText, { color }]}>{tx.description.slice(0, 1).toUpperCase()}</Text>
      </View>
      <View style={{ flex: 1, marginRight: 8 }}>
        <Text style={styles.desc} numberOfLines={1}>{tx.description}</Text>
        <Text style={styles.meta} numberOfLines={1}>
          {tx.category} · {TIME_FORMAT.format(new Date(tx.date))}
        </Text>
      </View>
      <Text style={[styles.amount, tx.direction === 'income' && { color: colors.income }]}>
        {tx.direction === 'income' ? '+' : '−'}
        {formatMoney(tx.amount, tx.currency)}
      </Text>
    </View>
  );
}

function Chip({ label, active, color, onPress }: { label: string; active: boolean; color?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      {color && <View style={[styles.chipDot, { backgroundColor: color }]} />}
      <Text style={[styles.chipText, active && { fontWeight: '600' }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: 16, paddingTop: 16 },
  search: { backgroundColor: colors.card, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: colors.text },
  chips: { gap: 8, paddingVertical: 12 },
  chip: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7 },
  chipActive: { backgroundColor: colors.accent },
  chipDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  chipText: { fontSize: 14, color: colors.text },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, marginBottom: 6 },
  headerTitle: { fontSize: 14, fontWeight: '600', color: colors.muted },
  headerTotal: { fontSize: 14, color: colors.muted },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 14, padding: 12, marginBottom: 6 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  avatarText: { fontSize: 17, fontWeight: '700' },
  desc: { fontSize: 15, color: colors.text },
  meta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  amount: { fontSize: 15, fontWeight: '600', color: colors.expense },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 32 },
});
