import { router } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { ArtistAvatar } from '../../components/ArtistAvatar';
import { Cover } from '../../components/Cover';
import { Icon } from '../../components/Icon';
import { NetShelf } from '../../components/NetShelf';
import { MediaCard, Shelf } from '../../components/Shelf';
import { colors } from '../../components/theme';
import { useLibrary } from '../../context/LibraryContext';
import { usePlayer } from '../../context/PlayerContext';
import { useReco } from '../../context/RecoContext';
import { tracksLabel } from '../../lib/library';
import { openArtist, openCollection } from '../../lib/nav';
import { MIX_INFO, type MixKind } from '../../lib/recommend';

function greeting(d = new Date()) {
  const h = d.getHours();
  if (h < 5) return 'Доброй ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
}

const MIX_COLORS: Record<MixKind, [string, string]> = {
  day: ['#F953C6', '#3A0CA3'],
  week: ['#11998E', '#06312D'],
  month: ['#F7971E', '#7B2FF7'],
};

function WaveCard() {
  const reco = useReco();
  const { playing, current } = usePlayer();
  const { offline } = useLibrary();
  const active = reco.waveActive && playing && !!current;
  return (
    <Pressable onPress={reco.startWave} style={styles.wave} accessibilityRole="button" accessibilityLabel={active ? 'Пауза: Моя волна' : 'Слушать Мою волну'}>
      <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 1 1">
        <Defs>
          <LinearGradient id="waveGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#2BD97C" />
            <Stop offset="0.55" stopColor="#1B6FA8" />
            <Stop offset="1" stopColor="#3A0CA3" />
          </LinearGradient>
        </Defs>
        <Rect width={1} height={1} fill="url(#waveGrad)" />
      </Svg>
      <View style={{ flex: 1 }}>
        <View style={styles.waveTitleRow}>
          <Icon name="wave" size={26} color="#fff" />
          <Text style={styles.waveTitle}>Моя волна</Text>
        </View>
        <Text style={styles.waveSub}>
          {reco.waveError ?? (offline ? 'Офлайн: из скачанных треков по вашему вкусу' : 'Бесконечный поток музыки, похожей на любимую')}
        </Text>
      </View>
      <View style={styles.wavePlay}>
        {reco.waveLoading ? <ActivityIndicator color={colors.bg} /> : <Icon name={active ? 'pause' : 'play'} size={28} color={colors.bg} />}
      </View>
    </Pressable>
  );
}

export default function Home() {
  const insets = useSafeAreaInsets();
  const { state, tracks, offline, networkDown } = useLibrary();
  const { playList } = usePlayer();
  const reco = useReco();

  const quick: { id: string; title: string; colors: [string, string]; icon: 'heart' | 'download' | 'note' }[] = [
    { id: 'liked', title: 'Любимые треки', colors: ['#5038ED', '#8FBCE6'], icon: 'heart' },
    { id: 'local', title: 'Мои треки', colors: ['#F2994A', '#4F2A00'], icon: 'download' },
    ...state.playlists.slice(0, 4).map((p) => ({ id: `pl:${p.id}`, title: p.name, colors: p.colors, icon: 'note' as const })),
  ];
  const recent = state.recentTracks.map((t) => tracks.get(t.id) ?? t);

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 24 }}>
      <View style={styles.header}>
        <Text style={styles.hello}>{greeting()}</Text>
        <Pressable onPress={() => router.push('/settings')} hitSlop={10} accessibilityLabel="Настройки">
          <Icon name="settings" size={26} color={colors.text} />
        </Pressable>
      </View>

      {offline && (
        <Pressable style={styles.offline} onPress={() => router.push('/settings')}>
          <Icon name="cloudOff" size={22} color={colors.text} />
          <Text style={styles.offlineText}>
            {networkDown ? 'Нет подключения к интернету.' : 'Включён офлайн-режим.'} Играют только скачанные треки.
          </Text>
        </Pressable>
      )}

      <WaveCard />

      <Shelf title="Ваши миксы">
        {(['day', 'week', 'month'] as MixKind[]).map((kind) => {
          const m = reco.mixes[kind];
          const subtitle = m.loading ? 'Собираем…' : m.mix ? `${tracksLabel(m.mix.tracks.length)} · ${MIX_INFO[kind].short}` : (m.error ?? MIX_INFO[kind].subtitle);
          return (
            <MediaCard key={kind} title={MIX_INFO[kind].title} subtitle={subtitle} colors={MIX_COLORS[kind]} icon="wave" onPress={() => openCollection(`mix:${kind}`)} />
          );
        })}
      </Shelf>

      <View style={styles.grid}>
        {quick.map((q) => (
          <Pressable key={q.id} style={({ pressed }) => [styles.quick, pressed && { backgroundColor: colors.cardPressed }]} onPress={() => openCollection(q.id)}>
            <Cover colors={q.colors} size={56} radius={0} icon={q.icon} />
            <Text style={styles.quickText} numberOfLines={2}>
              {q.title}
            </Text>
          </Pressable>
        ))}
      </View>

      {state.prefs.artists.length > 0 && (
        <Shelf title="Ваши исполнители">
          {state.prefs.artists.map((name) => (
            <ArtistAvatar key={name} name={name} size={110} showName onPress={() => openArtist(name)} />
          ))}
        </Shelf>
      )}

      {recent.length > 0 && (
        <Shelf title="Недавно прослушанные">
          {recent.slice(0, 12).map((t, i) => (
            <MediaCard key={t.id} title={t.title} subtitle={t.artist} colors={t.colors} onPress={() => playList(recent, i, 'recent')} />
          ))}
        </Shelf>
      )}

      {!offline && reco.shelves.map((s) => <NetShelf key={`${s.kind}:${s.value}`} title={s.kind === 'genre' ? `${s.title}: для вас` : s.title} kind={s.kind} value={s.value} />)}

      {!offline && (
        <Pressable style={styles.netBanner} onPress={() => router.navigate({ pathname: '/search', params: { mode: 'net' } })}>
          <Icon name="globe" size={28} color={colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.netTitle}>Найти что-то ещё</Text>
            <Text style={styles.netText}>Поиск по свободной музыке в Internet Archive</Text>
          </View>
        </Pressable>
      )}

      <Pressable onPress={() => router.push('/credits')}>
        <Text style={styles.credits}>Музыка — Internet Archive, только записи со свободными лицензиями · Подробнее</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 16 },
  hello: { flex: 1, color: colors.text, fontSize: 26, fontWeight: '800' },
  offline: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginBottom: 14, padding: 12, borderRadius: 10, backgroundColor: colors.card },
  offlineText: { flex: 1, color: colors.text, fontSize: 13 },
  wave: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, padding: 18, borderRadius: 14, overflow: 'hidden', minHeight: 110 },
  waveTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  waveTitle: { color: '#fff', fontSize: 24, fontWeight: '800' },
  waveSub: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 6 },
  wavePlay: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 8, marginTop: 24 },
  quick: { flexBasis: '47%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 6, overflow: 'hidden', gap: 10 },
  quickText: { flex: 1, color: colors.text, fontWeight: '700', fontSize: 13, paddingRight: 8 },
  netBanner: { flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 16, marginTop: 28, padding: 16, borderRadius: 10, backgroundColor: colors.card },
  netTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  netText: { color: colors.muted, fontSize: 13, marginTop: 3 },
  credits: { color: colors.faint, fontSize: 12, textAlign: 'center', marginHorizontal: 24, marginTop: 24 },
});
