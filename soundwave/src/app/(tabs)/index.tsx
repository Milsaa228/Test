import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Cover } from '../../components/Cover';
import { Icon } from '../../components/Icon';
import { MediaCard, Shelf } from '../../components/Shelf';
import { colors } from '../../components/theme';
import { useLibrary } from '../../context/LibraryContext';
import { usePlayer } from '../../context/PlayerContext';
import { artistsOf, FEATURED, GENRES } from '../../lib/catalog';
import { openCollection } from '../../lib/nav';
import type { Track } from '../../lib/types';

function greeting(d = new Date()) {
  const h = d.getHours();
  if (h < 5) return 'Доброй ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
}

export default function Home() {
  const insets = useSafeAreaInsets();
  const { state, tracks } = useLibrary();
  const { playList } = usePlayer();

  const recent = state.recent.map((id) => tracks.get(id)).filter((t): t is Track => !!t);
  type Quick = { id: string; title: string; colors: [string, string] };
  const quick: Quick[] = [
    { id: 'liked', title: 'Любимые треки', colors: ['#5038ED', '#8FBCE6'] } as Quick,
    ...state.playlists.slice(0, 2).map((p): Quick => ({ id: `pl:${p.id}`, title: p.name, colors: p.colors })),
    ...FEATURED.map((p): Quick => ({ id: `pl:${p.id}`, title: p.name, colors: p.colors })),
  ].slice(0, 6);

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 24 }}>
      <Text style={styles.hello}>{greeting()}</Text>

      <View style={styles.grid}>
        {quick.map((q) => (
          <Pressable key={q.id} style={({ pressed }) => [styles.quick, pressed && { backgroundColor: colors.cardPressed }]} onPress={() => openCollection(q.id)}>
            <Cover colors={q.colors} size={56} radius={0} icon={q.id === 'liked' ? 'heart' : 'note'} />
            <Text style={styles.quickText} numberOfLines={2}>
              {q.title}
            </Text>
          </Pressable>
        ))}
      </View>

      {recent.length > 0 && (
        <Shelf title="Недавно прослушанные">
          {recent.slice(0, 10).map((t, i) => (
            <MediaCard key={t.id} title={t.title} subtitle={t.artist} colors={t.colors} onPress={() => playList(recent, i, 'recent')} />
          ))}
        </Shelf>
      )}

      <Shelf title="Подборки для вас">
        {FEATURED.map((p) => (
          <MediaCard key={p.id} title={p.name} subtitle={p.description} colors={p.colors} onPress={() => openCollection(`pl:${p.id}`)} />
        ))}
      </Shelf>

      <Shelf title="Жанры">
        {GENRES.map((g) => (
          <MediaCard key={g.name} title={g.name} subtitle="Жанр" colors={[g.color, '#121212']} onPress={() => openCollection(`genre:${g.name}`)} />
        ))}
      </Shelf>

      <Shelf title="Исполнители">
        {artistsOf([...tracks.values()]).map((a) => (
          <MediaCard key={a.name} title={a.name} subtitle="Исполнитель" colors={a.colors} round icon="user" onPress={() => openCollection(`artist:${a.name}`)} />
        ))}
      </Shelf>

      <Pressable style={styles.netBanner} onPress={() => router.navigate({ pathname: '/search', params: { mode: 'net' } })}>
        <Icon name="globe" size={28} color={colors.accent} />
        <View style={{ flex: 1 }}>
          <Text style={styles.netTitle}>Больше музыки в интернете</Text>
          <Text style={styles.netText}>Тысячи свободных альбомов в Internet Archive: слушайте и скачивайте в медиатеку</Text>
        </View>
      </Pressable>

      <Pressable onPress={() => router.push('/credits')}>
        <Text style={styles.credits}>Музыка в приложении: Kevin MacLeod (incompetech.com), CC BY 4.0 · Подробнее</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  hello: { color: colors.text, fontSize: 26, fontWeight: '800', marginHorizontal: 16, marginBottom: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 8 },
  quick: { flexBasis: '47%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 6, overflow: 'hidden', gap: 10 },
  netBanner: { flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 16, marginTop: 28, padding: 16, borderRadius: 10, backgroundColor: colors.card },
  netTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  netText: { color: colors.muted, fontSize: 13, marginTop: 3 },
  credits: { color: colors.faint, fontSize: 12, textAlign: 'center', marginHorizontal: 24, marginTop: 24 },
  quickText: { flex: 1, color: colors.text, fontWeight: '700', fontSize: 13, paddingRight: 8 },
});
