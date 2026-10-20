import { router } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { card, colors } from '../../components/theme';
import { Button, confirm, Empty } from '../../components/ui';
import { useData } from '../../context/DataContext';
import { expiryLabel, expiryStatus, plural, sortByExpiry } from '../../lib/expiry';
import { formatAmount } from '../../lib/inventory';
import type { Product } from '../../lib/types';

export default function InventoryScreen() {
  const { ready, products, removeProduct, markUsed } = useData();
  const sorted = useMemo(() => sortByExpiry(products), [products]);
  const soon = sorted.filter((p) => expiryStatus(p.expiresAt) !== 'ok').length;

  if (!ready) return <ActivityIndicator style={{ marginTop: 40 }} color={colors.text} />;

  const onDelete = (p: Product) =>
    confirm('Удалить продукт?', `«${p.name}» пропадёт из списка.`, 'Удалить', () => removeProduct(p.id), true);

  return (
    <FlatList
      data={sorted}
      keyExtractor={(p) => p.id}
      contentContainerStyle={styles.container}
      ListHeaderComponent={
        <View>
          <View style={styles.actions}>
            <View style={{ flex: 1 }}>
              <Button label="📷 По фото" onPress={() => router.push('/scan')} primary />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="＋ Вручную" onPress={() => router.push('/product')} />
            </View>
          </View>
          {soon > 0 && (
            <Pressable style={styles.banner} onPress={() => router.push('/recipes')}>
              <Text style={styles.bannerText}>
                ⏰ Скоро испортятся или уже просрочены: {soon} {plural(soon, ['продукт', 'продукта', 'продуктов'])}. Узнайте,
                что из них приготовить →
              </Text>
            </Pressable>
          )}
        </View>
      }
      ListEmptyComponent={
        <Empty
          glyph="🧊"
          title="Холодильник пуст"
          text="Сфотографируйте полки — Claude сам распознает продукты и прикинет, сколько они пролежат. Или добавьте продукт вручную."
        />
      }
      renderItem={({ item }) => <ProductRow product={item} onUse={() => markUsed(item.id)} onDelete={() => onDelete(item)} />}
    />
  );
}

function ProductRow({ product, onUse, onDelete }: { product: Product; onUse: () => void; onDelete: () => void }) {
  const status = expiryStatus(product.expiresAt);
  const partial = (product.unit === 'шт' || product.unit === 'уп') && product.amount > 1;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/product', params: { id: product.id } })}
      style={({ pressed }) => [
        card,
        styles.row,
        status === 'soon' && { backgroundColor: colors.soonBg },
        status === 'expired' && { backgroundColor: colors.dangerBg },
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={2}>{product.name}</Text>
        <Text style={styles.meta}>
          {formatAmount(product.amount, product.unit)} · {product.category}
        </Text>
        <Text style={[styles.expiry, status === 'soon' && { color: colors.soon }, status === 'expired' && { color: colors.danger }]}>
          {status === 'soon' ? 'Скоро испортится · ' : ''}
          {expiryLabel(product.expiresAt)}
        </Text>
      </View>
      <View style={styles.rowButtons}>
        <Button label={partial ? '−1' : 'Использовал'} onPress={onUse} small />
        <Button label="Удалить" onPress={onDelete} small danger />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },
  actions: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  banner: { backgroundColor: colors.soonBg, borderRadius: 14, padding: 12, marginBottom: 12 },
  bannerText: { fontSize: 14, lineHeight: 20, color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { fontSize: 16, fontWeight: '600', color: colors.text },
  meta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  expiry: { fontSize: 13, color: colors.ok, marginTop: 4, fontWeight: '500' },
  rowButtons: { gap: 6, alignItems: 'stretch' },
});
