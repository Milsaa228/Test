import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ArtistAvatar } from '../components/ArtistAvatar';
import { Icon } from '../components/Icon';
import { colors } from '../components/theme';
import { useLibrary } from '../context/LibraryContext';
import { creatorSearchQuery, queryArchive, shortCreator } from '../lib/archive';
import { ARTISTS, GENRES, genreById } from '../lib/genres';
import { matchScore, normalize, queryVariants } from '../lib/textq';

type ArtistOption = { name: string; genre?: string };

/** Исполнители из архива по запросу (поле creator, с вариантами написания), без «Various Artists». */
async function searchCreators(text: string): Promise<ArtistOption[]> {
  const items = await queryArchive(creatorSearchQuery(text), { rows: 50 });
  const variants = queryVariants(text);
  const seen = new Map<string, { name: string; score: number; n: number }>();
  for (const it of items) {
    const name = shortCreator(it.creator).replace(/ и др\.$/, '');
    const key = normalize(name);
    if (!key || /^(various|va|v a|unknown|неизвестный)/.test(key)) continue;
    const prev = seen.get(key);
    seen.set(key, { name, score: matchScore(name, variants), n: (prev?.n ?? 0) + 1 });
  }
  return [...seen.values()].sort((a, b) => b.score - a.score || b.n - a.n).slice(0, 18).map(({ name }) => ({ name }));
}

/** Первый запуск (и «Изменить предпочтения» в настройках): жанры и/или исполнители для рекомендаций. */
export default function Onboarding() {
  const insets = useSafeAreaInsets();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const { state, dispatch, offline } = useLibrary();
  const [tab, setTab] = useState<'genres' | 'artists'>('genres');
  const [genres, setGenres] = useState<string[]>(state.prefs.genres);
  const [artists, setArtists] = useState<string[]>(state.prefs.artists);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<{ q: string; list: ArtistOption[] } | null>(null);
  const [searching, setSearching] = useState(false);

  const toggle = (list: string[], set: (v: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const count = genres.length + artists.length;
  const q = query.trim();

  // Поиск исполнителя: сначала по нашему списку (с транслитом), затем по архиву — с задержкой.
  const localMatches = useMemo(() => {
    if (!q) return [];
    const variants = queryVariants(q);
    return ARTISTS.filter((a) => matchScore(a.name, variants) >= 0.5);
  }, [q]);

  useEffect(() => {
    if (q.length < 2 || offline) return;
    let alive = true;
    const timer = setTimeout(() => {
      setSearching(true);
      searchCreators(q)
        .then((list) => alive && setFound({ q, list }))
        .catch(() => alive && setFound({ q, list: [] }))
        .finally(() => alive && setSearching(false));
    }, 500);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [q, offline]);

  const shown: ArtistOption[] = useMemo(() => {
    if (!q) {
      const extra = artists.filter((a) => !ARTISTS.some((x) => x.name === a)).map((name) => ({ name }));
      return [...extra, ...ARTISTS];
    }
    const remote = found?.q === q ? found.list : [];
    const out: ArtistOption[] = [...localMatches];
    for (const r of remote) if (!out.some((x) => normalize(x.name) === normalize(r.name))) out.push(r);
    return out;
  }, [q, found, localMatches, artists]);

  const finish = (g: string[], a: string[]) => {
    dispatch({ type: 'setPrefs', genres: g, artists: a });
    if (edit && router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 16 }]}>
      <View style={styles.head}>
        <Text style={styles.title}>Что вы любите слушать?</Text>
        {!edit && (
          <Pressable onPress={() => finish([], [])} hitSlop={10}>
            <Text style={styles.skip}>Пропустить</Text>
          </Pressable>
        )}
      </View>
      <Text style={styles.lead}>Выберите жанры или исполнителей — по ним соберём главную, «Мою волну» и миксы. Изменить выбор можно в настройках.</Text>

      <View style={styles.tabs}>
        {(
          [
            ['genres', `Жанры${genres.length ? ` · ${genres.length}` : ''}`],
            ['artists', `Исполнители${artists.length ? ` · ${artists.length}` : ''}`],
          ] as const
        ).map(([key, label]) => (
          <Pressable key={key} onPress={() => setTab(key)} style={[styles.tab, tab === key && styles.tabOn]} accessibilityState={{ selected: tab === key }}>
            <Text style={[styles.tabText, tab === key && styles.tabTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {tab === 'genres' ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}>
          <View style={styles.grid}>
            {GENRES.map((g) => {
              const on = genres.includes(g.id);
              return (
                <Pressable
                  key={g.id}
                  onPress={() => toggle(genres, setGenres, g.id)}
                  style={[styles.genre, { backgroundColor: g.color }, on && styles.genreOn]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                >
                  <Text style={styles.genreText}>{g.name}</Text>
                  {on && (
                    <View style={styles.check}>
                      <Icon name="check" size={16} color={colors.accentText} />
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      ) : (
        <>
          <View style={styles.searchRow}>
            <Icon name="search" size={20} color={colors.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Найти исполнителя (можно по-русски)"
              placeholderTextColor={colors.faint}
              style={styles.input}
              selectionColor={colors.accent}
              autoCorrect={false}
              returnKeyType="search"
            />
            {searching ? <ActivityIndicator color={colors.accent} /> : null}
            {q.length > 0 && !searching && (
              <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Очистить">
                <Icon name="close" size={18} color={colors.muted} />
              </Pressable>
            )}
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 120 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
            <View style={styles.artists}>
              {shown.map((a) => (
                <ArtistAvatar
                  key={a.name}
                  name={a.name}
                  size={92}
                  showName
                  subtitle={a.genre ? genreById(a.genre)?.name : undefined}
                  selected={artists.includes(a.name)}
                  onPress={() => toggle(artists, setArtists, a.name)}
                />
              ))}
            </View>
            {q && !searching && shown.length === 0 && (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>Не нашли «{q}» среди свободной музыки.</Text>
                <Pressable
                  style={styles.addAnyway}
                  onPress={() => {
                    if (!artists.includes(q)) setArtists([...artists, q]);
                    setQuery('');
                  }}
                >
                  <Text style={styles.addAnywayText}>Всё равно добавить «{q}»</Text>
                </Pressable>
              </View>
            )}
            {q && shown.length > 0 && !artists.includes(q) && !shown.some((a) => normalize(a.name) === normalize(q)) && (
              <Pressable style={styles.addLink} onPress={() => setArtists([...artists, q])}>
                <Icon name="plus" size={18} color={colors.accent} />
                <Text style={styles.addLinkText}>Добавить «{q}» как есть</Text>
              </Pressable>
            )}
            <Text style={styles.note}>Фото — из открытого каталога Deezer. Музыка — свободная, из Internet Archive: популярных коммерческих артистов там обычно нет.</Text>
          </ScrollView>
        </>
      )}

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable onPress={() => finish(genres, artists)} disabled={!count} style={[styles.done, !count && { opacity: 0.4 }]}>
          <Text style={styles.doneText}>{count ? `Готово · выбрано ${count}` : 'Выберите хотя бы один вариант'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, gap: 12 },
  title: { flex: 1, color: colors.text, fontSize: 28, fontWeight: '800' },
  skip: { color: colors.muted, fontSize: 15, marginTop: 8 },
  lead: { color: colors.muted, fontSize: 14, lineHeight: 20, paddingHorizontal: 16, marginTop: 8 },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginVertical: 14 },
  tab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 18, backgroundColor: colors.card },
  tabOn: { backgroundColor: colors.text },
  tabText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  tabTextOn: { color: colors.bg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  genre: { flexBasis: '30%', flexGrow: 1, height: 74, borderRadius: 10, padding: 10, borderWidth: 3, borderColor: 'transparent' },
  genreOn: { borderColor: colors.accent },
  genreText: { color: colors.text, fontSize: 15, fontWeight: '800' },
  check: { position: 'absolute', right: 6, bottom: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card, borderRadius: 10, marginHorizontal: 16, marginBottom: 14, paddingHorizontal: 12 },
  input: { flex: 1, color: colors.text, fontSize: 15, paddingVertical: 11 },
  artists: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 18 },
  empty: { alignItems: 'center', gap: 10, paddingTop: 12 },
  emptyText: { color: colors.muted, fontSize: 14, textAlign: 'center' },
  addAnyway: { borderWidth: 1, borderColor: colors.faint, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 9 },
  addAnywayText: { color: colors.text, fontWeight: '600' },
  addLink: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', marginTop: 18 },
  addLinkText: { color: colors.accent, fontWeight: '600' },
  note: { color: colors.faint, fontSize: 12, marginTop: 20, lineHeight: 17, paddingHorizontal: 4 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, backgroundColor: colors.bg },
  done: { backgroundColor: colors.accent, borderRadius: 26, paddingVertical: 15, alignItems: 'center' },
  doneText: { color: colors.accentText, fontSize: 16, fontWeight: '800' },
});
