import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Cover } from '../../components/Cover';
import { MediaCard, Shelf } from '../../components/Shelf';
import { colors } from '../../components/theme';
import { useLibrary } from '../../context/LibraryContext';
import { usePlayer } from '../../context/PlayerContext';
import { albumsOf, artistsOf, CATALOG, FEATURED } from '../../lib/catalog';
import { albumKey } from '../../lib/library';
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

      <Shelf title="Популярные альбомы">
        {albumsOf(CATALOG).map((a) => (
          <MediaCard key={a.artist + a.name} title={a.name} subtitle={a.artist} colors={a.colors} icon="disc" onPress={() => openCollection(albumKey(a.artist, a.name))} />
        ))}
      </Shelf>

      <Shelf title="Исполнители">
        {artistsOf(CATALOG).map((a) => (
          <MediaCard key={a.name} title={a.name} subtitle="Исполнитель" colors={a.colors} round icon="user" onPress={() => openCollection(`artist:${a.name}`)} />
        ))}
      </Shelf>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  hello: { color: colors.text, fontSize: 26, fontWeight: '800', marginHorizontal: 16, marginBottom: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 8 },
  quick: { flexBasis: '47%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 6, overflow: 'hidden', gap: 10 },
  quickText: { flex: 1, color: colors.text, fontWeight: '700', fontSize: 13, paddingRight: 8 },
});
