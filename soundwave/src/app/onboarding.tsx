import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../components/Icon';
import { colors } from '../components/theme';
import { useLibrary } from '../context/LibraryContext';
import { ARTISTS, GENRES, genreById } from '../lib/genres';

/** Первый запуск (и «Изменить предпочтения» в настройках): жанры и/или исполнители для рекомендаций. */
export default function Onboarding() {
  const insets = useSafeAreaInsets();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const { state, dispatch } = useLibrary();
  const [tab, setTab] = useState<'genres' | 'artists'>('genres');
  const [genres, setGenres] = useState<string[]>(state.prefs.genres);
  const [artists, setArtists] = useState<string[]>(state.prefs.artists);
  const [custom, setCustom] = useState('');

  const toggle = (list: string[], set: (v: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const count = genres.length + artists.length;
  const extraArtists = artists.filter((a) => !ARTISTS.some((x) => x.name === a));

  const finish = (g: string[], a: string[]) => {
    dispatch({ type: 'setPrefs', genres: g, artists: a });
    if (edit && router.canGoBack()) router.back();
    else router.replace('/');
  };

  const addCustom = () => {
    const name = custom.trim();
    if (name && !artists.includes(name)) setArtists([...artists, name]);
    setCustom('');
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

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        {tab === 'genres' ? (
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
        ) : (
          <>
            <View style={styles.addRow}>
              <TextInput
                value={custom}
                onChangeText={setCustom}
                onSubmitEditing={addCustom}
                placeholder="Добавить своего исполнителя"
                placeholderTextColor={colors.faint}
                style={styles.input}
                selectionColor={colors.accent}
                returnKeyType="done"
                autoCorrect={false}
              />
              <Pressable onPress={addCustom} style={styles.addBtn} accessibilityLabel="Добавить">
                <Icon name="plus" size={22} color={colors.accentText} />
              </Pressable>
            </View>
            <View style={styles.chips}>
              {[...extraArtists.map((name) => ({ name, genre: '' })), ...ARTISTS].map((a) => {
                const on = artists.includes(a.name);
                return (
                  <Pressable
                    key={a.name}
                    onPress={() => toggle(artists, setArtists, a.name)}
                    style={[styles.chip, on && styles.chipOn]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{a.name}</Text>
                    {a.genre ? <Text style={[styles.chipSub, on && styles.chipTextOn]}>{genreById(a.genre)?.name}</Text> : null}
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.note}>Здесь музыка со свободными лицензиями из Internet Archive. Популярных коммерческих артистов там обычно нет.</Text>
          </>
        )}
      </ScrollView>

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
  genre: { flexBasis: '47%', flexGrow: 1, height: 84, borderRadius: 10, padding: 12, borderWidth: 3, borderColor: 'transparent' },
  genreOn: { borderColor: colors.accent },
  genreText: { color: colors.text, fontSize: 17, fontWeight: '800' },
  check: { position: 'absolute', right: 8, bottom: 8, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  addRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  input: { flex: 1, color: colors.text, fontSize: 15, backgroundColor: colors.card, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  addBtn: { width: 44, borderRadius: 8, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: colors.faint },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  chipSub: { color: colors.muted, fontSize: 11, marginTop: 1 },
  chipTextOn: { color: colors.accentText },
  note: { color: colors.faint, fontSize: 12, marginTop: 16, lineHeight: 17 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, backgroundColor: colors.bg },
  done: { backgroundColor: colors.accent, borderRadius: 26, paddingVertical: 15, alignItems: 'center' },
  doneText: { color: colors.accentText, fontSize: 16, fontWeight: '800' },
});
