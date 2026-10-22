import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { cached } from '../lib/cache';
import { findArtistImage } from '../lib/images';
import { colorsFor } from '../lib/library';
import { normalize } from '../lib/textq';
import { Icon } from './Icon';
import { colors } from './theme';

const MONTH = 30 * 24 * 3600 * 1000;
const memory = new Map<string, string | null>();

/** Фото исполнителя (кэш на 30 дней, в памяти — на сеанс). null — фото не нашлось. */
export function useArtistImage(name: string): string | null | undefined {
  const key = normalize(name);
  const [loaded, setLoaded] = useState<{ key: string; url: string | null } | null>(null);
  useEffect(() => {
    if (!key || memory.has(key)) return;
    let alive = true;
    cached(`img:${key}`, MONTH, () => findArtistImage(name))
      .catch(() => null)
      .then((url) => {
        memory.set(key, url ?? null);
        if (alive) setLoaded({ key, url: url ?? null });
      });
    return () => {
      alive = false;
    };
  }, [key, name]);
  if (!key) return null;
  if (memory.has(key)) return memory.get(key) ?? null;
  return loaded?.key === key ? loaded.url : undefined;
}

const initials = (name: string) =>
  name
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

type Props = { name: string; size: number; selected?: boolean; onPress?: () => void; showName?: boolean; subtitle?: string };

/** Круглое фото исполнителя; если фото нет — инициалы на цветном фоне. */
export function ArtistAvatar({ name, size, selected, onPress, showName, subtitle }: Props) {
  const img = useArtistImage(name);
  const [c1] = colorsFor(name);
  const circle = (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: c1 }, selected && styles.selected]}>
      {img ? (
        <Image source={{ uri: img }} style={{ width: size, height: size, borderRadius: size / 2 }} accessibilityIgnoresInvertColors />
      ) : (
        <Text style={[styles.initials, { fontSize: size * 0.34 }]}>{initials(name) || '♪'}</Text>
      )}
      {selected && (
        <View style={styles.check}>
          <Icon name="check" size={14} color={colors.accentText} />
        </View>
      )}
    </View>
  );
  if (!showName && !onPress) return circle;
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={[styles.wrap, { width: size + 12 }]} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={name} accessibilityState={selected != null ? { selected } : undefined}>
      {circle}
      {showName && (
        <Text style={[styles.name, selected && { color: colors.accent }]} numberOfLines={2}>
          {name}
        </Text>
      )}
      {showName && subtitle ? (
        <Text style={styles.sub} numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  circle: { alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  selected: { borderWidth: 3, borderColor: colors.accent },
  initials: { color: '#fff', fontWeight: '800' },
  check: { position: 'absolute', right: 0, bottom: 0, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bg },
  name: { color: colors.text, fontSize: 13, fontWeight: '600', textAlign: 'center', marginTop: 6 },
  sub: { color: colors.muted, fontSize: 11, textAlign: 'center', marginTop: 1 },
});
