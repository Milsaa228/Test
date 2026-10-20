import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { card, colors } from '../../components/theme';
import { Button, confirm, Empty, notify } from '../../components/ui';
import { useData } from '../../context/DataContext';
import { expiryLabel, expiryStatus } from '../../lib/expiry';
import { findProduct, formatAmount } from '../../lib/inventory';

export default function RecipeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ready, findRecipe, favorites, products, toggleFavorite, cook } = useData();
  const recipe = findRecipe(id);

  if (!ready) return <ActivityIndicator style={{ marginTop: 40 }} color={colors.text} />;
  if (!recipe) return <Empty glyph="🍽" title="Рецепт не найден" text="Возможно, список предложений обновился." />;

  const favorite = favorites.some((r) => r.id === recipe.id);

  const onCooked = () => {
    const inStock = recipe.uses.filter((u) => findProduct(products, u.name));
    if (!inStock.length) {
      notify('Нечего списывать', 'Продуктов из рецепта больше нет в списке.');
      return;
    }
    confirm(
      'Приготовили?',
      `Спишем из «Моих продуктов»: ${inStock.map((u) => u.name).join(', ')}. Продукты «по вкусу» останутся.`,
      'Списать',
      async () => {
        const { removed, decreased } = await cook(recipe);
        const parts = [
          removed.length ? `Закончились: ${removed.join(', ')}` : '',
          decreased.length ? `Осталось меньше: ${decreased.join(', ')}` : '',
        ].filter(Boolean);
        notify('Приятного аппетита!', parts.join('\n') || undefined);
        router.back();
      },
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Stack.Screen options={{ title: recipe.title }} />
      <View style={card}>
        <Text style={styles.title}>{recipe.title}</Text>
        {recipe.description ? <Text style={styles.desc}>{recipe.description}</Text> : null}
        <Text style={styles.meta}>
          ⏱ {recipe.minutes} мин · {recipe.difficulty} · {recipe.servings} порц.
        </Text>
      </View>

      <View style={card}>
        <Text style={styles.section}>Из ваших продуктов</Text>
        {recipe.uses.length === 0 && <Text style={styles.text}>—</Text>}
        {recipe.uses.map((u) => {
          const p = findProduct(products, u.name);
          const status = p ? expiryStatus(p.expiresAt) : null;
          return (
            <View key={u.name} style={styles.line}>
              <Text style={[styles.text, { flex: 1 }, !p && styles.gone]}>
                {p ? '✓' : '✗'} {u.name}
                {u.amount !== null ? ` — ${formatAmount(u.amount, u.unit)}` : ' — по вкусу'}
              </Text>
              {p && status !== 'ok' && <Text style={styles.soon}>{expiryLabel(p.expiresAt)}</Text>}
            </View>
          );
        })}
        {recipe.missing.length > 0 && (
          <>
            <Text style={[styles.section, { marginTop: 12 }]}>Докупить</Text>
            {recipe.missing.map((m) => <Text key={m} style={styles.text}>• {m}</Text>)}
          </>
        )}
      </View>

      <View style={card}>
        <Text style={styles.section}>Как готовить</Text>
        {recipe.steps.map((s, i) => (
          <View key={i} style={styles.step}>
            <Text style={styles.stepNum}>{i + 1}</Text>
            <Text style={[styles.text, { flex: 1 }]}>{s}</Text>
          </View>
        ))}
      </View>

      <Button label="✅ Приготовил" onPress={onCooked} primary />
      <Button label={favorite ? '★ Убрать из избранного' : '☆ В избранное'} onPress={() => toggleFavorite(recipe)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  desc: { fontSize: 15, lineHeight: 21, color: colors.text, marginTop: 6 },
  meta: { fontSize: 13, color: colors.muted, marginTop: 8 },
  section: { fontSize: 13, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', marginBottom: 8 },
  text: { fontSize: 15, lineHeight: 22, color: colors.text },
  gone: { color: colors.muted, textDecorationLine: 'line-through' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  soon: { fontSize: 12, color: colors.soon, fontWeight: '600' },
  step: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  stepNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.accent, textAlign: 'center', lineHeight: 24, fontWeight: '700', color: colors.accentText, overflow: 'hidden' },
});
