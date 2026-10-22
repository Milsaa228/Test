import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ArtistAvatar } from '../../components/ArtistAvatar';
import { Cover } from '../../components/Cover';
import { Icon } from '../../components/Icon';
import { MiniPlayer } from '../../components/MiniPlayer';
import { TrackRow } from '../../components/TrackRow';
import { colors } from '../../components/theme';
import { useLibrary } from '../../context/LibraryContext';
import { usePlayer } from '../../context/PlayerContext';
import { useReco } from '../../context/RecoContext';
import { useTrackMenu } from '../../context/TrackMenuContext';
import { licenseLabel, type NetItem } from '../../lib/archive';
import { ARTISTS, genreById } from '../../lib/genres';
import { colorsFor, isPlayable } from '../../lib/library';
import { shelfItems } from '../../lib/reco';

/** Страница исполнителя: фото, плейлист по исполнителю, любимый исполнитель, записи в медиатеке и в архиве. */
export default function ArtistScreen() {
  const { name: raw } = useLocalSearchParams<{ name: string }>();
  const name = raw ?? '';
  const insets = useSafeAreaInsets();
  const library = useLibrary();
  const player = usePlayer();
  const reco = useReco();
  const { openTrackMenu, showToast } = useTrackMenu();
  const [items, setItems] = useState<NetItem[] | null>(null);

  useEffect(() => {
    if (!name || library.offline) return;
    let alive = true;
    shelfItems({ kind: 'artist', value: name })
      .then((list) => alive && setItems(list))
      .catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, [name, library.offline]);

  const saved = [...library.tracks.values()].filter((t) => t.artist === name);
  const favorite = library.state.prefs.artists.includes(name);
  const known = ARTISTS.find((a) => a.name === name);

  const toggleFavorite = () => {
    const { genres, artists } = library.state.prefs;
    library.dispatch({ type: 'setPrefs', genres, artists: favorite ? artists.filter((a) => a !== name) : [...artists, name] });
    showToast(favorite ? 'Убрано из любимых исполнителей' : 'Добавлено в любимые исполнители — учтём в рекомендациях');
  };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + (player.current ? 96 : 32) }}>
        <View style={[styles.header, { paddingTop: insets.top + 56 }]}>
          <ArtistAvatar name={name} size={180} />
          <Text style={styles.name}>{name}</Text>
          {known && <Text style={styles.muted}>{genreById(known.genre)?.name}</Text>}
          <View style={styles.actions}>
            <Pressable onPress={toggleFavorite} style={[styles.pill, favorite && styles.pillOn]} accessibilityState={{ selected: favorite }}>
              <Icon name={favorite ? 'check' : 'plus'} size={16} color={favorite ? colors.accentText : colors.text} />
              <Text style={[styles.pillText, favorite && { color: colors.accentText }]}>{favorite ? 'Любимый исполнитель' : 'В любимые'}</Text>
            </Pressable>
          </View>
          <Pressable
            style={[styles.radio, library.offline && { opacity: 0.4 }]}
            disabled={library.offline}
            onPress={() => reco.openRadio({ kind: 'artist', name })}
            accessibilityRole="button"
          >
            <Icon name="wave" size={22} color={colors.accentText} />
            <Text style={styles.radioText}>Плейлист по исполнителю</Text>
          </Pressable>
        </View>

        {saved.length > 0 && (
          <>
            <Text style={styles.section}>В вашей медиатеке</Text>
            {saved.map((t, i) => (
              <TrackRow
                key={t.id}
                track={t}
                active={player.current?.id === t.id}
                liked={library.isLiked(t.id)}
                disabled={!isPlayable(t, library.offline)}
                onPress={() => player.playList(saved, i, `artist:${name}`, { shuffle: false })}
                onMore={() => openTrackMenu({ track: t })}
              />
            ))}
          </>
        )}

        <Text style={styles.section}>Записи в Internet Archive</Text>
        {library.offline ? (
          <Text style={styles.note}>Нужен интернет.</Text>
        ) : items === null ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 16 }} />
        ) : items.length === 0 ? (
          <Text style={styles.note}>Свободных записей этого исполнителя не нашлось.</Text>
        ) : (
          items.map((it) => (
            <Pressable key={it.id} style={styles.item} onPress={() => router.push({ pathname: '/net/[id]', params: { id: it.id } })}>
              <Cover colors={colorsFor(it.id)} size={52} icon="globe" />
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle} numberOfLines={1}>
                  {it.title}
                </Text>
                <Text style={styles.itemSub} numberOfLines={1}>
                  {it.creator}
                  {it.license ? ` · ${licenseLabel(it.license)}` : ''}
                </Text>
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>
      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={[styles.back, { top: insets.top + 6 }]} hitSlop={8} accessibilityLabel="Назад">
        <Icon name="back" size={22} color={colors.text} />
      </Pressable>
      <View style={[styles.mini, { paddingBottom: insets.bottom }]}>
        <MiniPlayer />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { alignItems: 'center', paddingHorizontal: 16, gap: 6 },
  name: { color: colors.text, fontSize: 28, fontWeight: '800', textAlign: 'center', marginTop: 14 },
  muted: { color: colors.muted, fontSize: 14 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.faint, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8 },
  pillOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  pillText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  radio: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.accent, borderRadius: 26, paddingHorizontal: 22, paddingVertical: 13, marginTop: 14 },
  radioText: { color: colors.accentText, fontSize: 15, fontWeight: '800' },
  section: { color: colors.text, fontSize: 19, fontWeight: '700', marginHorizontal: 16, marginTop: 26, marginBottom: 8 },
  note: { color: colors.muted, fontSize: 14, marginHorizontal: 16 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 7 },
  itemTitle: { color: colors.text, fontSize: 15, fontWeight: '500' },
  itemSub: { color: colors.muted, fontSize: 13, marginTop: 2 },
  back: { position: 'absolute', left: 12, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  mini: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
