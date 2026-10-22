import { router } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../components/Icon';
import { colors } from '../components/theme';
import { CATALOG, CC_BY_4 } from '../lib/catalog';

const open = (url: string) => Linking.openURL(url).catch(() => {});

/** Указание авторства по условиям CC BY 4.0. */
export default function Credits() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.top}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={10} accessibilityLabel="Назад">
          <Icon name="back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.heading}>Авторы музыки</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
        <Text style={styles.p}>
          Встроенные треки играют без интернета. Их автор — Kevin MacLeod (incompetech.com). Музыка распространяется по лицензии Creative Commons
          «Attribution 4.0» (CC BY 4.0).
        </Text>
        <Pressable onPress={() => open(CC_BY_4)}>
          <Text style={styles.link}>creativecommons.org/licenses/by/4.0</Text>
        </Pressable>
        {CATALOG.map((t) => (
          <Pressable key={t.id} style={styles.item} onPress={() => open(t.sourceUrl!)}>
            <Text style={styles.title}>«{t.title}»</Text>
            <Text style={styles.sub}>Kevin MacLeod (incompetech.com) · Licensed under Creative Commons: By Attribution 4.0 License</Text>
          </Pressable>
        ))}
        <Text style={[styles.p, { marginTop: 20 }]}>
          Музыка из интернета ищется в Internet Archive (archive.org). Лицензия у каждой записи своя — она показана на экране альбома и в плеере.
          Скачивайте только то, что вам разрешено.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 16, marginBottom: 4 },
  heading: { color: colors.text, fontSize: 20, fontWeight: '800' },
  p: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  link: { color: colors.accent, fontSize: 14, marginTop: 6, marginBottom: 12 },
  item: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  title: { color: colors.text, fontSize: 15, fontWeight: '600' },
  sub: { color: colors.muted, fontSize: 12, marginTop: 2 },
});
