import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ArtistAvatar } from '../../components/ArtistAvatar';
import { Cover } from '../../components/Cover';
import { Icon } from '../../components/Icon';
import { TrackRow } from '../../components/TrackRow';
import { colors } from '../../components/theme';
import { useLibrary } from '../../context/LibraryContext';
import { usePlayer } from '../../context/PlayerContext';
import { useTrackMenu } from '../../context/TrackMenuContext';
import { licenseLabel, searchArchive, shortCreator, type NetItem } from '../../lib/archive';
import { readJson, writeJson } from '../../lib/cache';
import { GENRES } from '../../lib/genres';
import { albumKey, colorsFor, search } from '../../lib/library';
import { openArtist } from '../../lib/nav';
import { matchScore, normalize, queryVariants } from '../../lib/textq';

type Mode = 'local' | 'net';
const HISTORY_KEY = 'search-history';
const HISTORY_LIMIT = 12;
const NET_SUGGESTIONS = ['jazz', 'classical piano', 'lofi', 'synthwave', 'blues', 'ambient', 'rock', 'chiptune'];

export default function Search() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<Mode>(params.mode === 'net' ? 'net' : 'local');
  const [query, setQuery] = useState('');
  const { tracks, isLiked, offline } = useLibrary();
  const { playList, current } = usePlayer();
  const { openTrackMenu, addFromUrl } = useTrackMenu();
  const results = useMemo(() => search(query, [...tracks.values()]), [query, tracks]);
  const empty = !results.tracks.length && !results.artists.length && !results.albums.length;

  const [net, setNet] = useState<{ q: string; items: NetItem[]; error?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const isUrl = /^https?:\/\//i.test(query.trim());
  const netQuery = mode === 'net' && !isUrl ? query.trim() : '';

  // Переход сюда с параметром mode=net (с главной или из медиатеки) включает поиск в интернете.
  const [seenMode, setSeenMode] = useState(params.mode);
  if (params.mode !== seenMode) {
    setSeenMode(params.mode);
    if (params.mode === 'net') setMode('net');
  }

  // Поиск в интернете с задержкой, чтобы не дёргать сервер на каждую букву.
  useEffect(() => {
    if (netQuery.length < 2) return;
    let alive = true;
    const timer = setTimeout(() => {
      setLoading(true);
      searchArchive(netQuery)
        .then((items) => alive && setNet({ q: netQuery, items }))
        .catch((e) => alive && setNet({ q: netQuery, items: [], error: e instanceof Error ? e.message : String(e) }))
        .finally(() => alive && setLoading(false));
    }, 600);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [netQuery]);

  const onAddUrl = async () => {
    setAdding(true);
    try {
      await addFromUrl(query);
      setQuery('');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (Platform.OS === 'web') globalThis.alert?.(msg);
      else Alert.alert('Не удалось добавить трек', msg);
    } finally {
      setAdding(false);
    }
  };

  const shownNet = net && net.q === netQuery ? net : null;

  // История запросов: последние 12, без повторов.
  const [history, setHistory] = useState<string[]>([]);
  useEffect(() => {
    readJson<string[]>(HISTORY_KEY).then((h) => h && setHistory(h));
  }, []);
  const remember = (text: string) => {
    const t = text.trim();
    if (t.length < 2 || /^https?:/i.test(t)) return;
    setHistory((h) => {
      const next = [t, ...h.filter((x) => normalize(x) !== normalize(t))].slice(0, HISTORY_LIMIT);
      writeJson(HISTORY_KEY, next);
      return next;
    });
  };
  const clearHistory = () => {
    setHistory([]);
    writeJson(HISTORY_KEY, []);
  };

  // Исполнители среди найденного в интернете: имя похоже на запрос (с учётом транслита).
  const netArtists = useMemo(() => {
    if (!shownNet?.items.length) return [];
    const variants = queryVariants(netQuery);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const it of shownNet.items) {
      const name = shortCreator(it.creator).replace(/ и др\.$/, '');
      const key = normalize(name);
      if (!key || seen.has(key) || /^(various|va|unknown)/.test(key) || matchScore(name, variants) < 0.5) continue;
      seen.add(key);
      out.push(name);
    }
    return out.slice(0, 8);
  }, [shownNet, netQuery]);

  const historyBlock =
    history.length > 0 ? (
      <View>
        <View style={styles.historyHead}>
          <Text style={styles.sub}>Недавние запросы</Text>
          <Pressable onPress={clearHistory} hitSlop={8}>
            <Text style={styles.clear}>Очистить</Text>
          </Pressable>
        </View>
        <View style={styles.suggest}>
          {history.map((h) => (
            <Pressable key={h} style={styles.suggestChip} onPress={() => setQuery(h)}>
              <Icon name="search" size={14} color={colors.muted} />
              <Text style={styles.chipText}>{h}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    ) : null;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 12 }]}>
      <Text style={styles.heading}>Поиск</Text>
      <View style={styles.inputWrap}>
        <Icon name={mode === 'net' ? 'globe' : 'search'} size={22} color={colors.bg} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={mode === 'net' ? 'Музыка в интернете или ссылка на MP3' : 'Что хотите послушать?'}
          placeholderTextColor="#55555C"
          style={styles.input}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
          onSubmitEditing={() => remember(query)}
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Очистить">
            <Icon name="close" size={20} color={colors.bg} />
          </Pressable>
        )}
      </View>

      <View style={styles.modes}>
        {(
          [
            ['local', 'В медиатеке'],
            ['net', 'В интернете'],
          ] as const
        ).map(([key, label]) => (
          <Pressable key={key} onPress={() => setMode(key)} style={[styles.chip, mode === key && styles.chipOn]} accessibilityState={{ selected: mode === key }}>
            <Text style={[styles.chipText, mode === key && styles.chipTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingBottom: 24 }}>
        {isUrl ? (
          <Pressable style={styles.urlCard} onPress={onAddUrl} disabled={adding}>
            {adding ? <ActivityIndicator color={colors.accent} /> : <Icon name="link" size={26} color={colors.accent} />}
            <View style={{ flex: 1 }}>
              <Text style={styles.entityTitle}>Добавить трек по ссылке</Text>
              <Text style={styles.entitySub} numberOfLines={1}>
                {query.trim()}
              </Text>
            </View>
          </Pressable>
        ) : mode === 'net' && offline ? (
          <View style={styles.nothing}>
            <Icon name="cloudOff" size={40} color={colors.muted} />
            <Text style={styles.nothingTitle}>Поиск в интернете недоступен</Text>
            <Text style={styles.nothingText}>Нет подключения или включён офлайн-режим. Скачанные треки ищите во вкладке «В медиатеке».</Text>
          </View>
        ) : mode === 'net' ? (
          netQuery.length < 2 ? (
            <View>
              {historyBlock}
              <Text style={styles.sub}>Свободная музыка из Internet Archive</Text>
              <Text style={styles.hint}>
                Найдите альбом, послушайте его и скачайте понравившиеся треки — они будут играть без интернета. Можно также вставить прямую ссылку на
                аудиофайл.
              </Text>
              <View style={styles.suggest}>
                {NET_SUGGESTIONS.map((s) => (
                  <Pressable key={s} style={styles.suggestChip} onPress={() => setQuery(s)}>
                    <Text style={styles.chipText}>{s}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : !shownNet || loading ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: 32 }} />
          ) : shownNet.error ? (
            <View style={styles.nothing}>
              <Text style={styles.nothingTitle}>Не удалось выполнить поиск</Text>
              <Text style={styles.nothingText}>{shownNet.error}. Проверьте подключение к интернету.</Text>
            </View>
          ) : shownNet.items.length === 0 ? (
            <View style={styles.nothing}>
              <Text style={styles.nothingTitle}>Ничего не нашлось по запросу «{netQuery}»</Text>
              <Text style={styles.nothingText}>В архиве больше записей на английском — попробуйте запрос на нём.</Text>
            </View>
          ) : (
            <>
              {netArtists.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.artistRow}>
                  {netArtists.map((name) => (
                    <ArtistAvatar
                      key={name}
                      name={name}
                      size={84}
                      showName
                      onPress={() => {
                        remember(query);
                        openArtist(name);
                      }}
                    />
                  ))}
                </ScrollView>
              )}
              {shownNet.items.map((it) => (
              <Pressable
                key={it.id}
                style={styles.entity}
                onPress={() => {
                  remember(query);
                  router.push({ pathname: '/net/[id]', params: { id: it.id } });
                }}
              >
                <Cover colors={colorsFor(it.id)} size={48} icon="globe" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.entityTitle} numberOfLines={1}>
                    {it.title}
                  </Text>
                  <Text style={styles.entitySub} numberOfLines={1}>
                    {it.creator}
                    {it.license ? ` · ${licenseLabel(it.license)}` : ''}
                  </Text>
                </View>
              </Pressable>
              ))}
            </>
          )
        ) : !query.trim() ? (
          <>
            {historyBlock}
            <Text style={styles.sub}>Жанры в интернете</Text>
            <View style={styles.genres}>
              {GENRES.map((g) => (
                <Pressable
                  key={g.id}
                  style={[styles.genre, { backgroundColor: g.color }]}
                  onPress={() => {
                    setMode('net');
                    setQuery(g.keywords[0]);
                  }}
                >
                  <Text style={styles.genreText}>{g.name}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : empty ? (
          <View style={styles.nothing}>
            <Text style={styles.nothingTitle}>Ничего не нашлось по запросу «{query.trim()}»</Text>
            <Pressable style={styles.netBtn} onPress={() => setMode('net')}>
              <Text style={styles.netBtnText}>Искать в интернете</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {results.artists.map((a) => (
              <Pressable
                key={a.name}
                style={styles.entity}
                onPress={() => {
                  remember(query);
                  openArtist(a.name);
                }}
              >
                <ArtistAvatar name={a.name} size={48} />
                <View>
                  <Text style={styles.entityTitle}>{a.name}</Text>
                  <Text style={styles.entitySub}>Исполнитель</Text>
                </View>
              </Pressable>
            ))}
            {results.albums.map((a) => (
              <Pressable key={a.artist + a.name} style={styles.entity} onPress={() => router.push({ pathname: '/collection/[id]', params: { id: albumKey(a.artist, a.name) } })}>
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
                onPress={() => {
                  remember(query);
                  playList(results.tracks, i, null);
                }}
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
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.text, borderRadius: 8, marginHorizontal: 16, paddingHorizontal: 12, marginBottom: 10 },
  input: { flex: 1, fontSize: 16, paddingVertical: 12, color: colors.bg },
  modes: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 6 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, backgroundColor: colors.card },
  chipOn: { backgroundColor: colors.accent },
  chipText: { color: colors.text, fontSize: 14 },
  chipTextOn: { color: colors.accentText, fontWeight: '600' },
  sub: { color: colors.text, fontSize: 17, fontWeight: '700', marginHorizontal: 16, marginTop: 16, marginBottom: 12 },
  hint: { color: colors.muted, fontSize: 14, marginHorizontal: 16, marginTop: -4, marginBottom: 14, lineHeight: 20 },
  suggest: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 },
  suggestChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: colors.faint },
  historyHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 16 },
  clear: { color: colors.muted, fontSize: 13, marginTop: 4 },
  artistRow: { paddingHorizontal: 12, gap: 6, paddingVertical: 8 },
  genres: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 16 },
  genre: { flexBasis: '46%', flexGrow: 1, height: 96, borderRadius: 8, padding: 12 },
  genreText: { color: colors.text, fontSize: 17, fontWeight: '800' },
  nothing: { alignItems: 'center', padding: 32, gap: 8 },
  nothingTitle: { color: colors.text, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  nothingText: { color: colors.muted, fontSize: 14, textAlign: 'center' },
  netBtn: { marginTop: 8, backgroundColor: colors.text, borderRadius: 24, paddingHorizontal: 22, paddingVertical: 11 },
  netBtnText: { color: colors.bg, fontWeight: '700' },
  entity: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 7 },
  entityTitle: { color: colors.text, fontSize: 16, fontWeight: '500' },
  entitySub: { color: colors.muted, fontSize: 13, marginTop: 2 },
  urlCard: { flexDirection: 'row', alignItems: 'center', gap: 14, margin: 16, padding: 16, borderRadius: 10, backgroundColor: colors.card },
});
