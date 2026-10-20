import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { card, colors } from '../components/theme';
import { Busy, Button, Empty, errorText, notify } from '../components/ui';
import { useData } from '../context/DataContext';
import { addDays, daysLeft, expiryLabel, plural } from '../lib/expiry';
import { MAX_PHOTOS, recognizeFridge } from '../lib/fridge';
import { formatAmount } from '../lib/inventory';
import { pickPhotos, takePhoto, toJpegBase64, type Photo } from '../lib/photos';
import type { Product } from '../lib/types';

export default function ScanScreen() {
  const { apiKey, ai, addProducts } = useData();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [found, setFound] = useState<Product[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const left = MAX_PHOTOS - photos.length;

  const add = async (source: () => Promise<Photo[]>) => {
    try {
      const picked = await source();
      if (picked.length) {
        setPhotos((prev) => [...prev, ...picked].slice(0, MAX_PHOTOS));
        setFound(null);
      }
    } catch (e) {
      notify('Не удалось получить фото', errorText(e));
    }
  };

  const onRecognize = async () => {
    setBusy('Нейросеть смотрит в холодильник… Бесплатные модели иногда думают до минуты.');
    try {
      const images = await Promise.all(photos.map(toJpegBase64));
      const products = await recognizeFridge(ai, images);
      setFound(products);
    } catch (e) {
      notify('Не получилось распознать', errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const shiftDays = (id: string, delta: number) =>
    setFound((list) =>
      list?.map((p) => (p.id === id && daysLeft(addDays(p.expiresAt, delta)) >= 0 ? { ...p, expiresAt: addDays(p.expiresAt, delta) } : p)) ?? null,
    );

  const onSave = async () => {
    if (!found?.length) return;
    const { added, updated } = await addProducts(found);
    notify('Готово', `Новых продуктов: ${added}${updated ? `\nОбновлено количество: ${updated}` : ''}`);
    router.back();
  };

  if (!apiKey) {
    return (
      <View style={styles.container}>
        <Empty glyph="🔑" title="Нужен ключ нейросети" text="Продукты на фото распознаёт нейросеть. Бесплатный ключ OpenRouter добавляется в настройках за пару минут." />
        <Button label="Открыть настройки" onPress={() => router.push('/settings')} primary />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={card}>
        <Text style={styles.title}>Фото полок</Text>
        <Text style={styles.text}>
          До {MAX_PHOTOS} фото за раз: холодильник, дверца, морозилка, полка с крупами. Чем лучше видны этикетки, тем точнее
          результат.
        </Text>
        {photos.length > 0 && (
          <View style={styles.thumbs}>
            {photos.map((p, i) => (
              <Pressable key={p.uri + i} onPress={() => setPhotos((list) => list.filter((_, j) => j !== i))} disabled={!!busy}>
                <Image source={{ uri: p.uri }} style={styles.thumb} />
                <Text style={styles.remove}>✕</Text>
              </Pressable>
            ))}
          </View>
        )}
        <View style={styles.row}>
          {Platform.OS !== 'web' && (
            <View style={{ flex: 1 }}>
              <Button label="📷 Камера" onPress={() => add(takePhoto)} disabled={!!busy || left <= 0} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Button label="🖼 Галерея" onPress={() => add(() => pickPhotos(left))} disabled={!!busy || left <= 0} />
          </View>
        </View>
        <Button label="Распознать продукты" onPress={onRecognize} disabled={!!busy || photos.length === 0} primary />
      </View>

      {busy && <Busy text={busy} />}

      {found && found.length === 0 && (
        <Empty glyph="🤷" title="Продуктов не нашлось" text="Попробуйте сфотографировать ближе и при хорошем освещении." />
      )}

      {found && found.length > 0 && (
        <>
          <Text style={styles.section}>
            Нашлось {found.length} {plural(found.length, ['продукт', 'продукта', 'продуктов'])}. Проверьте сроки — это оценка по
            типичному сроку хранения.
          </Text>
          {found.map((p) => (
            <View key={p.id} style={card}>
              <View>
                <Text style={styles.name}>{p.name}</Text>
                <Text style={styles.meta}>
                  {formatAmount(p.amount, p.unit)} · {p.category}
                </Text>
                <Text style={styles.meta}>{expiryLabel(p.expiresAt)}</Text>
              </View>
              <View style={[styles.row, { marginTop: 10 }]}>
                <Text style={styles.meta}>Срок, дней:</Text>
                <Button label="−" onPress={() => shiftDays(p.id, -1)} small />
                <Text style={styles.days}>{daysLeft(p.expiresAt)}</Text>
                <Button label="+" onPress={() => shiftDays(p.id, 1)} small />
                <View style={{ flex: 1 }} />
                <Button label="Убрать" onPress={() => setFound((list) => list?.filter((x) => x.id !== p.id) ?? null)} small danger />
              </View>
            </View>
          ))}
          <Button label={`Добавить в «Мои продукты»`} onPress={onSave} primary />
          <Text style={styles.hint}>Продукты, которые уже есть в списке, не задвоятся — обновится только количество.</Text>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 6 },
  text: { fontSize: 14, lineHeight: 20, color: colors.muted, marginBottom: 12 },
  thumbs: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  thumb: { width: 90, height: 120, borderRadius: 12, backgroundColor: colors.bg },
  remove: { position: 'absolute', top: 4, right: 6, color: colors.card, fontWeight: '700', textShadowColor: '#000', textShadowRadius: 3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  section: { fontSize: 14, lineHeight: 20, color: colors.muted, marginBottom: 10 },
  name: { fontSize: 16, fontWeight: '600', color: colors.text },
  meta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  days: { fontSize: 13, color: colors.text, minWidth: 28, textAlign: 'center' },
  hint: { fontSize: 12, color: colors.muted, marginTop: 8, textAlign: 'center' },
});
