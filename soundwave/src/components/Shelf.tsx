import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Cover } from './Cover';
import type { IconName } from './Icon';
import { colors } from './theme';

export function Shelf({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.shelf}>
      <Text style={styles.heading}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {children}
      </ScrollView>
    </View>
  );
}

type CardProps = {
  title: string;
  subtitle?: string;
  colors: [string, string];
  round?: boolean;
  icon?: IconName;
  onPress: () => void;
};

export function MediaCard({ title, subtitle, colors: c, round, icon, onPress }: CardProps) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]} accessibilityRole="button" accessibilityLabel={title}>
      <Cover colors={c} size={140} round={round} icon={icon} />
      <Text style={[styles.title, round && { textAlign: 'center' }]} numberOfLines={1}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={[styles.subtitle, round && { textAlign: 'center' }]} numberOfLines={2}>
          {subtitle}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shelf: { marginTop: 28 },
  heading: { color: colors.text, fontSize: 22, fontWeight: '700', marginHorizontal: 16, marginBottom: 12 },
  row: { paddingHorizontal: 16, gap: 14 },
  card: { width: 140 },
  title: { color: colors.text, fontSize: 14, fontWeight: '600', marginTop: 8 },
  subtitle: { color: colors.muted, fontSize: 13, marginTop: 2 },
});
