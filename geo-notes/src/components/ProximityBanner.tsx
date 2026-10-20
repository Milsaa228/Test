import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useNotes } from '../context/NotesContext';
import { formatDistance } from '../lib/geo';
import { colors } from './theme';

const AUTO_HIDE_MS = 15000;

/** Баннер «вы рядом с заметкой» поверх любого экрана. */
export function ProximityBanner() {
  const { banner, dismissBanner } = useNotes();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!banner.length) return;
    const t = setTimeout(dismissBanner, AUTO_HIDE_MS);
    return () => clearTimeout(t);
  }, [banner, dismissBanner]);

  if (!banner.length) return null;
  const [first, ...rest] = banner;

  return (
    <View style={[styles.wrap, { top: insets.top + 8 }]} pointerEvents="box-none">
      <Pressable
        style={styles.banner}
        onPress={() => {
          dismissBanner();
          router.push(`/note/${first.note.id}`);
        }}
      >
        <Text style={styles.emoji}>{first.note.emoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Вы рядом · {formatDistance(first.distance)}</Text>
          <Text style={styles.text} numberOfLines={2}>{first.note.text}</Text>
          {rest.length > 0 && <Text style={styles.label}>И ещё заметок рядом: {rest.length}</Text>}
        </View>
        <Pressable hitSlop={12} onPress={dismissBanner}>
          <Text style={styles.close}>✕</Text>
        </Pressable>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, zIndex: 100 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.accent,
    borderRadius: 18,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  emoji: { fontSize: 30 },
  label: { fontSize: 12, color: colors.accentText, opacity: 0.7 },
  text: { fontSize: 16, fontWeight: '600', color: colors.accentText },
  close: { fontSize: 16, color: colors.accentText, padding: 4 },
});
