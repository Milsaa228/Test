import { router } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BarChart } from '../components/BarChart';
import { DonutChart } from '../components/DonutChart';
import { MonthSwitcher } from '../components/MonthSwitcher';
import { card, colors } from '../components/theme';
import { useData } from '../context/DataContext';
import { computeMonthStats, formatMoney, monthlyTrend, monthTitle } from '../lib/stats';

const SHORT_MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

export default function AnalyticsScreen() {
  const { ready, transactions, settings, month, setMonth } = useData();

  const stats = useMemo(
    () => computeMonthStats(transactions, month, settings.includeTransfers),
    [transactions, month, settings.includeTransfers],
  );
  const trend = useMemo(
    () => monthlyTrend(transactions, month, 6, settings.includeTransfers),
    [transactions, month, settings.includeTransfers],
  );

  if (!ready) return <ActivityIndicator style={{ marginTop: 40 }} />;

  if (transactions.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>Пока нет операций</Text>
        <Text style={styles.emptyText}>
          Подключите Т-Бизнес API или импортируйте CSV-выписку из приложения Т-Банка. Можно начать с демо-данных.
        </Text>
        <Pressable style={styles.primary} onPress={() => router.navigate('/settings')}>
          <Text style={styles.primaryText}>Добавить данные</Text>
        </Pressable>
      </View>
    );
  }

  const diff = stats.prevExpense ? (stats.expense - stats.prevExpense) / stats.prevExpense : null;
  const days = stats.daily.length;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <MonthSwitcher />

      <View style={styles.tiles}>
        <View style={[card, styles.tile]}>
          <Text style={styles.tileLabel}>Расходы</Text>
          <Text style={styles.tileValue}>{formatMoney(stats.expense)}</Text>
          {diff !== null && (
            <Text style={[styles.tileHint, { color: diff > 0 ? colors.up : colors.down }]}>
              {diff > 0 ? '▲' : '▼'} {Math.abs(Math.round(diff * 100))}% к прошлому месяцу
            </Text>
          )}
        </View>
        <View style={[card, styles.tile]}>
          <Text style={styles.tileLabel}>Доходы</Text>
          <Text style={[styles.tileValue, { color: colors.income }]}>{formatMoney(stats.income)}</Text>
          <Text style={styles.tileHint}>≈ {formatMoney(stats.avgPerDay)} в день</Text>
        </View>
      </View>

      <View style={card}>
        <Text style={styles.cardTitle}>По категориям</Text>
        {stats.byCategory.length === 0 ? (
          <Text style={styles.muted}>В этом месяце расходов нет</Text>
        ) : (
          <>
            <DonutChart
              slices={stats.byCategory.map((c) => ({ value: c.amount, color: c.color }))}
              centerTitle={formatMoney(stats.expense)}
              centerSubtitle={`${stats.byCategory.reduce((s, c) => s + c.count, 0)} операций`}
            />
            <View style={{ marginTop: 16 }}>
              {stats.byCategory.map((c) => (
                <Pressable
                  key={c.category}
                  style={styles.catRow}
                  onPress={() => router.navigate({ pathname: '/operations', params: { category: c.category } })}
                >
                  <View style={[styles.dot, { backgroundColor: c.color }]} />
                  <View style={{ flex: 1 }}>
                    <View style={styles.catHeader}>
                      <Text style={styles.catName} numberOfLines={1}>{c.category}</Text>
                      <Text style={styles.catAmount}>{formatMoney(c.amount)}</Text>
                    </View>
                    <View style={styles.progressTrack}>
                      <View style={[styles.progress, { width: `${Math.max(c.share * 100, 1)}%`, backgroundColor: c.color }]} />
                    </View>
                    <Text style={styles.catMeta}>
                      {Math.round(c.share * 100)}% · {c.count} опер.
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </>
        )}
      </View>

      <View style={card}>
        <Text style={styles.cardTitle}>Расходы по дням</Text>
        <BarChart
          values={stats.daily}
          labels={stats.daily.map((_, i) => String(i + 1))}
          showLabel={(i) => i === 0 || (i + 1) % 5 === 0 || i === days - 1}
          describe={(i) => `${i + 1} число`}
        />
      </View>

      <View style={card}>
        <Text style={styles.cardTitle}>Динамика за 6 месяцев</Text>
        <BarChart
          values={trend.map((t) => t.amount)}
          labels={trend.map((t) => SHORT_MONTHS[Number(t.month.slice(5)) - 1])}
          describe={(i) => monthTitle(trend[i].month)}
          highlightIndex={trend.length - 1}
          height={100}
          onSelect={(i) => setMonth(trend[i].month)}
        />
      </View>

      {stats.topMerchants.length > 0 && (
        <View style={card}>
          <Text style={styles.cardTitle}>Где тратите больше всего</Text>
          {stats.topMerchants.map((m, i) => (
            <View key={m.name} style={styles.merchant}>
              <Text style={styles.merchantRank}>{i + 1}</Text>
              <Text style={styles.merchantName} numberOfLines={1}>{m.name}</Text>
              <Text style={styles.catAmount}>{formatMoney(m.amount)}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 32 },
  tiles: { flexDirection: 'row', gap: 12 },
  tile: { flex: 1 },
  tileLabel: { fontSize: 13, color: colors.muted },
  tileValue: { fontSize: 20, fontWeight: '700', color: colors.text, marginTop: 4 },
  tileHint: { fontSize: 12, color: colors.muted, marginTop: 4 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 12 },
  muted: { color: colors.muted },
  catRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8 },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 5, marginRight: 10 },
  catHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  catName: { fontSize: 15, color: colors.text, flex: 1, marginRight: 8 },
  catAmount: { fontSize: 15, fontWeight: '600', color: colors.text },
  catMeta: { fontSize: 12, color: colors.muted, marginTop: 4 },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: colors.bg, marginTop: 6, overflow: 'hidden' },
  progress: { height: 4, borderRadius: 2 },
  merchant: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  merchantRank: { width: 22, color: colors.muted, fontWeight: '600' },
  merchantName: { flex: 1, fontSize: 15, color: colors.text, marginRight: 8 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 8 },
  emptyText: { fontSize: 15, color: colors.muted, textAlign: 'center', marginBottom: 20 },
  primary: { backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24 },
  primaryText: { fontSize: 16, fontWeight: '600', color: colors.accentText },
});
