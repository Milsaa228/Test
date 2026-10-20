import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useData } from '../context/DataContext';
import { monthKey, monthTitle, shiftMonth } from '../lib/stats';
import { colors } from './theme';

export function MonthSwitcher() {
  const { month, setMonth } = useData();
  const isCurrent = month >= monthKey(new Date());

  return (
    <View style={styles.row}>
      <Pressable hitSlop={12} onPress={() => setMonth(shiftMonth(month, -1))} style={styles.btn}>
        <Text style={styles.arrow}>‹</Text>
      </Pressable>
      <Text style={styles.title}>{monthTitle(month)}</Text>
      <Pressable hitSlop={12} disabled={isCurrent} onPress={() => setMonth(shiftMonth(month, 1))} style={styles.btn}>
        <Text style={[styles.arrow, isCurrent && { color: colors.border }]}>›</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  btn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  arrow: { fontSize: 26, lineHeight: 28, color: colors.text },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
});
