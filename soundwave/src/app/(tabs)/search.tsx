import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Cover } from '../../components/Cover';
import { Icon } from '../../components/Icon';
import { TrackRow } from '../../components/TrackRow';
import { colors } from '../../components/theme';
import { useLibrary } from '../../context/LibraryContext';
import { usePlayer } from '../../context/PlayerContext';
import { useTrackMenu } from '../../context/TrackMenuContext';
import { GENRES } from '../../lib/catalog';
import { albumKey, search } from '../../lib/library';
import { openCollection } from '../../lib/nav';

export default function Search() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const { tracks, isLiked } = useLibrary();
  const { playList, current } = usePlayer();
  const { openTrackMenu } = useTrackMenu();
  const results = useMemo(() => search(query, [...tracks.values()]), [query, tracks]);
  const empty = !results.tracks.length && !results.artists.length && !results.albums.length;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 12 }]}>
      <Text style={styles.heading}>Поиск</Text>
      <View style={styles.inputWrap}>
        <Icon name="search" size={22} color={colors.bg} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Что хотите послушать?"
          placeholderTextColor="#55555C"
          style={styles.input}
          returnKeyType="search"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Очистить">
            <Icon name="close" size={20} color={colors.bg} />
          </Pressable>
        )}
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingBottom: 24 }}>
        {!query.trim() ? (
          <>
            <Text style={styles.sub}>Жанры</Text>
            <View style={styles.genres}>
              {GENRES.map((g) => (
                <Pressable key={g.name} style={[styles.genre, { backgroundColor: g.color }]} onPress={() => openCollection(`genre:${g.name}`)}>
                  <Text style={styles.genreText}>{g.name}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : empty ? (
          <View style={styles.nothing}>
            <Text style={styles.nothingTitle}>Ничего не нашлось по запросу «{query.trim()}»</Text>
            <Text style={styles.nothingText}>Проверьте написание или попробуйте другие слова.</Text>
          </View>
        ) : (
          <>
            {results.artists.map((a) => (
              <Pressable key={a.name} style={styles.entity} onPress={() => openCollection(`artist:${a.name}`)}>
                <Cover colors={a.colors} size={48} round icon="user" />
                <View>
                  <Text style={styles.entityTitle}>{a.name}</Text>
                  <Text style={styles.entitySub}>Исполнитель</Text>
                </View>
              </Pressable>
            ))}
            {results.albums.map((a) => (
              <Pressable key={a.artist + a.name} style={styles.entity} onPress={() => openCollection(albumKey(a.artist, a.name))}>
                <Cover colors={a.colors} size={48} icon="disc" />
                <View>
                  <Text style={styles.entityTitle}>{a.name}</Text>
                  <Text style={styles.entitySub}>Альбом · {a.artist}</Text>
                </View>
              </Pressable>
            ))}
            {results.tracks.map((t, i) => (
              <TrackRow
                key={t.id}
                track={t}
                active={current?.id === t.id}
                liked={isLiked(t.id)}
                onPress={() => playList(results.tracks, i, null)}
                onMore={() => openTrackMenu({ track: t })}
              />
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  heading: { color: colors.text, fontSize: 26, fontWeight: '800', marginHorizontal: 16, marginBottom: 14 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.text, borderRadius: 8, marginHorizontal: 16, paddingHorizontal: 12, marginBottom: 8 },
  input: { flex: 1, fontSize: 16, paddingVertical: 12, color: colors.bg },
  sub: { color: colors.text, fontSize: 17, fontWeight: '700', marginHorizontal: 16, marginTop: 16, marginBottom: 12 },
  genres: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 16 },
  genre: { flexBasis: '46%', flexGrow: 1, height: 96, borderRadius: 8, padding: 12 },
  genreText: { color: colors.text, fontSize: 17, fontWeight: '800' },
  nothing: { alignItems: 'center', padding: 32, gap: 8 },
  nothingTitle: { color: colors.text, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  nothingText: { color: colors.muted, fontSize: 14, textAlign: 'center' },
  entity: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 7 },
  entityTitle: { color: colors.text, fontSize: 16, fontWeight: '500' },
  entitySub: { color: colors.muted, fontSize: 13, marginTop: 2 },
});
