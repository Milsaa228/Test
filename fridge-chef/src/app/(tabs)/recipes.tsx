import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { card, colors } from '../../components/theme';
import { Busy, Button, Empty, errorText, notify } from '../../components/ui';
import { useData } from '../../context/DataContext';
import { expiryStatus } from '../../lib/expiry';
import { findProduct } from '../../lib/inventory';
import { suggestRecipes } from '../../lib/recipes';
import type { Product, Recipe } from '../../lib/types';

export default function RecipesScreen() {
  const { apiKey, ai, products, settings, suggestions, favorites, setSuggestions } = useData();
  const [busy, setBusy] = useState(false);

  const onSuggest = async () => {
    if (!apiKey) {
      notify('Нужен ключ нейросети', 'Добавьте бесплатный ключ на вкладке «Настройки».');
      return;
    }
    setBusy(true);
    try {
      const recipes = await suggestRecipes(ai, products, settings);
      if (!recipes.length) notify('Не получилось', 'Нейросеть не предложила ни одного рецепта. Попробуйте ещё раз или смягчите ограничения.');
      else await setSuggestions(recipes);
    } catch (e) {
      notify('Не удалось получить рецепты', errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const prefs = [
    settings.diet !== 'обычная' ? settings.diet : null,
    settings.maxMinutes ? `до ${settings.maxMinutes} мин` : null,
    `${settings.servings} порц.`,
    settings.exclusions.trim() ? `без: ${settings.exclusions.trim()}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={card}>
        <Button label="🍳 Что приготовить?" onPress={onSuggest} disabled={busy || products.length === 0} primary />
        <Text style={styles.hint}>
          {products.length === 0
            ? 'Сначала добавьте продукты на вкладке «Мои продукты».'
            : `Нейросеть подберёт 3–5 блюд из ${products.length} продуктов, начиная с тех, что скоро испортятся. ${prefs}`}
        </Text>
      </View>

      {busy && <Busy text="Нейросеть придумывает рецепты из того, что есть…" />}

      {suggestions.length > 0 && <Text style={styles.section}>Предложения</Text>}
      {suggestions.map((r) => <RecipeCard key={r.id} recipe={r} products={products} favorite={favorites.some((f) => f.id === r.id)} />)}

      {favorites.length > 0 && <Text style={styles.section}>★ Избранное</Text>}
      {favorites.map((r) => <RecipeCard key={`f${r.id}`} recipe={r} products={products} favorite />)}

      {!busy && suggestions.length === 0 && favorites.length === 0 && (
        <Empty glyph="📖" title="Рецептов пока нет" text="Нажмите «Что приготовить?» — понравившиеся рецепты можно сохранить в избранное." />
      )}
    </ScrollView>
  );
}

function RecipeCard({ recipe, products, favorite }: { recipe: Recipe; products: Product[]; favorite: boolean }) {
  const have = recipe.uses.filter((u) => findProduct(products, u.name));
  const rescues = have.filter((u) => {
    const p = findProduct(products, u.name);
    return p && expiryStatus(p.expiresAt) !== 'ok';
  }).length;
  return (
    <Pressable
      style={({ pressed }) => [card, pressed && { opacity: 0.7 }]}
      onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: recipe.id } })}
    >
      <Text style={styles.title}>
        {favorite ? '★ ' : ''}
        {recipe.title}
      </Text>
      {recipe.description ? <Text style={styles.desc}>{recipe.description}</Text> : null}
      <Text style={styles.meta}>
        ⏱ {recipe.minutes} мин · {recipe.difficulty} · есть {have.length} из {recipe.uses.length + recipe.missing.length}
        {recipe.missing.length ? ` · докупить: ${recipe.missing.length}` : ''}
      </Text>
      {rescues > 0 && <Text style={styles.rescue}>Спасает {rescues} из скоро портящихся</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },
  hint: { fontSize: 13, lineHeight: 18, color: colors.muted, marginTop: 10 },
  section: { fontSize: 13, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', marginTop: 8, marginBottom: 8 },
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
  desc: { fontSize: 14, lineHeight: 20, color: colors.text, marginTop: 4 },
  meta: { fontSize: 13, color: colors.muted, marginTop: 8 },
  rescue: { fontSize: 13, color: colors.soon, marginTop: 4, fontWeight: '600' },
});
