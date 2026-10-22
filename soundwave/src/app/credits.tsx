import { router } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../components/Icon';
import { colors } from '../components/theme';

const open = (url: string) => Linking.openURL(url).catch(() => {});

export default function Credits() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.top}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={10} accessibilityLabel="Назад">
          <Icon name="back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.heading}>Источники музыки</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 12 }}>
        <Text style={styles.p}>
          Вся музыка загружается из Internet Archive (archive.org) — открытой библиотеки, где музыканты и лейблы публикуют записи под свободными
          лицензиями.
        </Text>
        <Pressable onPress={() => open('https://archive.org/details/audio')}>
          <Text style={styles.link}>archive.org/details/audio</Text>
        </Pressable>
        <Text style={styles.p}>
          Приложение показывает только записи с лицензией Creative Commons или в общественном достоянии. Лицензия и ссылка на страницу записи указаны
          на экране альбома и в плеере. Условия у лицензий разные: например, CC BY требует указывать автора, а NC запрещает коммерческое
          использование.
        </Text>
        <Pressable onPress={() => open('https://creativecommons.org/licenses/?lang=ru')}>
          <Text style={styles.link}>Что означают лицензии Creative Commons</Text>
        </Pressable>
        <Text style={styles.p}>
          Миксы, «Моя волна» и полки «Для вас» подбираются на телефоне по вашим предпочтениям, лайкам и истории прослушиваний. Данные никуда не
          отправляются.
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
  link: { color: colors.accent, fontSize: 14 },
});
