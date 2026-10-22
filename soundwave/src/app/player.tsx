import { router } from 'expo-router';
import { useId, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { Cover } from '../components/Cover';
import { Icon } from '../components/Icon';
import { ProgressBar } from '../components/ProgressBar';
import { Sheet } from '../components/Sheet';
import { colors } from '../components/theme';
import { useLibrary } from '../context/LibraryContext';
import { usePlayer } from '../context/PlayerContext';
import { useReco, WAVE_SOURCE } from '../context/RecoContext';
import { useTrackMenu } from '../context/TrackMenuContext';
import { licenseLabel } from '../lib/archive';
import { resolveCollection } from '../lib/library';
import { MIX_INFO, type MixKind } from '../lib/recommend';
import { openArtist, openCollection } from '../lib/nav';

function timerLabel(sleep: { at: number | null; endOfTrack: boolean }): string {
  if (sleep.endOfTrack) return 'До конца';
  if (sleep.at) return `${Math.max(1, Math.ceil((sleep.at - Date.now()) / 60_000))} мин`;
  return 'Таймер';
}

export default function PlayerScreen() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const p = usePlayer();
  const library = useLibrary();
  const { openTrackMenu, showToast } = useTrackMenu();
  const reco = useReco();
  const [timerSheet, setTimerSheet] = useState(false);
  const gradientId = `bg${useId().replace(/:/g, '')}`;
  const t = p.current;

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (!t) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.muted}>Ничего не играет</Text>
        <Pressable onPress={close} style={styles.closeBtn}>
          <Text style={styles.closeText}>Закрыть</Text>
        </Pressable>
      </View>
    );
  }

  const liked = library.isLiked(t.id);
  const sourceTitle = !p.source
    ? undefined
    : p.source === 'recent'
      ? 'Недавно прослушанные'
      : p.source === WAVE_SOURCE
        ? 'Моя волна'
        : p.source.startsWith('mix:')
          ? MIX_INFO[p.source.slice(4) as MixKind]?.title
          : p.source.startsWith('net:')
        ? t.album
        : resolveCollection(p.source, library.state)?.title;
  const coverSize = Math.min(width - 48, height * 0.42, 420);
  const status = p.status;
  const duration = status.duration > 0 ? status.duration : (t.duration ?? 0);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
      <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 1 1">
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={t.colors[0]} stopOpacity={0.9} />
            <Stop offset="0.75" stopColor={t.colors[1]} stopOpacity={0.6} />
            <Stop offset="1" stopColor={colors.bg} />
          </LinearGradient>
        </Defs>
        <Rect width={1} height={1} fill={`url(#${gradientId})`} />
      </Svg>

      <View style={styles.top}>
        <Pressable onPress={close} hitSlop={10} accessibilityLabel="Свернуть плеер">
          <Icon name="down" size={28} color={colors.text} />
        </Pressable>
        <Pressable
          style={styles.topCenter}
          disabled={!p.source || p.source === WAVE_SOURCE}
          onPress={() => {
            if (!p.source) return;
            close();
            if (p.source.startsWith('net:')) router.push({ pathname: '/net/[id]', params: { id: p.source.slice(4) } });
            else openCollection(p.source);
          }}
        >
          <Text style={styles.topLabel}>{sourceTitle ? 'Играет из' : 'Сейчас играет'}</Text>
          {sourceTitle ? (
            <Text style={styles.topTitle} numberOfLines={1}>
              {sourceTitle}
            </Text>
          ) : null}
        </Pressable>
        <Pressable onPress={() => openTrackMenu({ track: t })} hitSlop={10} accessibilityLabel="Действия с треком">
          <Icon name="more" size={24} color={colors.text} />
        </Pressable>
      </View>

      <View style={styles.coverWrap}>
        <View style={styles.coverShadow}>
          <Cover colors={t.colors} size={coverSize} radius={8} />
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Pressable
            style={{ flex: 1 }}
            onPress={() => {
              close();
              openArtist(t.artist);
            }}
          >
            <Text style={styles.title} numberOfLines={1}>
              {t.title}
            </Text>
            <Text style={styles.artist} numberOfLines={1}>
              {t.artist}
            </Text>
          </Pressable>
          {p.source === WAVE_SOURCE && (
            <Pressable
              onPress={() => {
                reco.dislike(t);
                showToast('Больше не будем предлагать этот трек');
              }}
              hitSlop={10}
              accessibilityLabel="Не нравится"
            >
              <Icon name="thumbDown" size={26} color={colors.text} />
            </Pressable>
          )}
          <Pressable onPress={() => library.toggleLike(t)} hitSlop={10} accessibilityLabel={liked ? 'Убрать из любимых' : 'В любимые'}>
            <Icon name={liked ? 'heart' : 'heartOutline'} size={28} color={liked ? colors.accent : colors.text} />
          </Pressable>
        </View>

        {t.license ? (
          <Pressable disabled={!t.sourceUrl} onPress={() => t.sourceUrl && Linking.openURL(t.sourceUrl).catch(() => {})}>
            <Text style={styles.license} numberOfLines={1}>
              {licenseLabel(t.license)}
              {t.sourceUrl ? ` · ${t.sourceUrl.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}` : ''}
            </Text>
          </Pressable>
        ) : null}

        <ProgressBar position={status.currentTime} duration={duration} onSeek={p.seek} />
        {status.error ? <Text style={styles.error}>Не удалось воспроизвести: {status.error}</Text> : null}

        <View style={styles.controls}>
          <Pressable onPress={p.toggleShuffle} hitSlop={10} accessibilityLabel="Перемешать" accessibilityState={{ selected: p.queue.shuffle }}>
            <Icon name="shuffle" size={24} color={p.queue.shuffle ? colors.accent : colors.text} />
            {p.queue.shuffle && <View style={styles.dot} />}
          </Pressable>
          <Pressable onPress={p.prev} hitSlop={10} accessibilityLabel="Предыдущий трек">
            <Icon name="prev" size={36} color={colors.text} />
          </Pressable>
          <Pressable onPress={p.toggle} style={[styles.play, !p.playing && { paddingLeft: 4 }]} accessibilityLabel={p.playing ? 'Пауза' : 'Играть'}>
            <Icon name={p.playing ? 'pause' : 'play'} size={34} color={colors.bg} />
          </Pressable>
          <Pressable onPress={p.next} hitSlop={10} accessibilityLabel="Следующий трек">
            <Icon name="next" size={36} color={colors.text} />
          </Pressable>
          <Pressable
            onPress={p.cycleRepeat}
            hitSlop={10}
            accessibilityLabel={p.queue.repeat === 'off' ? 'Повтор выключен' : p.queue.repeat === 'all' ? 'Повтор очереди' : 'Повтор трека'}
          >
            <Icon name="repeat" size={24} color={p.queue.repeat === 'off' ? colors.text : colors.accent} />
            {p.queue.repeat === 'one' && <Text style={styles.one}>1</Text>}
            {p.queue.repeat !== 'off' && <View style={styles.dot} />}
          </Pressable>
        </View>

        <Text style={styles.muted}>{status.isBuffering && p.playing ? 'Загрузка…' : ' '}</Text>
        <View style={styles.bottom}>
          {(
            [
              { icon: 'note', label: 'Текст', onPress: () => router.push('/lyrics') },
              {
                icon: 'wave',
                label: 'Похожие',
                disabled: library.offline,
                onPress: () => {
                  close();
                  reco.openRadio({ kind: 'track', track: t });
                },
              },
              {
                icon: 'user',
                label: 'Исполнитель',
                onPress: () => {
                  close();
                  openArtist(t.artist);
                },
              },
              { icon: 'moon', label: timerLabel(p.sleep), active: !!(p.sleep.at || p.sleep.endOfTrack), onPress: () => setTimerSheet(true) },
              { icon: 'queue', label: 'Очередь', onPress: () => router.push('/queue') },
            ] as const
          ).map((b) => (
            <Pressable
              key={b.icon}
              onPress={b.onPress}
              disabled={'disabled' in b && b.disabled}
              style={[styles.action, 'disabled' in b && b.disabled && { opacity: 0.35 }]}
              accessibilityLabel={b.label}
            >
              <Icon name={b.icon} size={22} color={'active' in b && b.active ? colors.accent : colors.text} />
              <Text style={[styles.actionText, 'active' in b && b.active && { color: colors.accent }]} numberOfLines={1}>
                {b.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Sheet visible={timerSheet} onClose={() => setTimerSheet(false)}>
        <Text style={styles.sheetTitle}>Таймер сна</Text>
        {[
          { label: 'Через 15 минут', v: 15 },
          { label: 'Через 30 минут', v: 30 },
          { label: 'Через 45 минут', v: 45 },
          { label: 'Через 1 час', v: 60 },
          { label: 'Через 1,5 часа', v: 90 },
          { label: 'В конце трека', v: 'end' as const },
          ...(p.sleep.at || p.sleep.endOfTrack ? [{ label: 'Выключить таймер', v: null }] : []),
        ].map((o) => (
          <Pressable
            key={o.label}
            style={styles.sheetItem}
            onPress={() => {
              p.setSleepTimer(o.v);
              setTimerSheet(false);
              showToast(o.v === null ? 'Таймер выключен' : o.v === 'end' ? 'Остановим в конце трека' : `Остановим через ${o.v} мин`);
            }}
          >
            <Icon name={o.v === null ? 'close' : 'moon'} size={20} color={o.v === null ? colors.danger : colors.muted} />
            <Text style={[styles.sheetText, o.v === null && { color: colors.danger }]}>{o.label}</Text>
          </Pressable>
        ))}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 24 },
  center: { alignItems: 'center', justifyContent: 'center', gap: 16 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  topCenter: { flex: 1, alignItems: 'center' },
  topLabel: { color: colors.text, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', opacity: 0.8 },
  topTitle: { color: colors.text, fontSize: 13, fontWeight: '700', marginTop: 2 },
  coverWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  coverShadow: { borderRadius: 8, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 14 },
  body: { gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 8 },
  title: { color: colors.text, fontSize: 22, fontWeight: '800' },
  artist: { color: 'rgba(255,255,255,0.75)', fontSize: 16, marginTop: 2 },
  error: { color: colors.danger, fontSize: 13 },
  license: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: -6, marginBottom: 2 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  play: { width: 68, height: 68, borderRadius: 34, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', bottom: -8, alignSelf: 'center', width: 4, height: 4, borderRadius: 2, backgroundColor: colors.accent },
  one: { position: 'absolute', top: -6, right: -6, color: colors.accent, fontSize: 10, fontWeight: '800' },
  bottom: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginTop: 4 },
  action: { alignItems: 'center', gap: 4, minWidth: 56 },
  actionText: { color: colors.text, fontSize: 11 },
  sheetTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginHorizontal: 16, marginBottom: 6 },
  sheetItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 13 },
  sheetText: { color: colors.text, fontSize: 16 },
  muted: { color: colors.muted, fontSize: 13 },
  closeBtn: { borderWidth: 1, borderColor: colors.faint, borderRadius: 24, paddingHorizontal: 24, paddingVertical: 10 },
  closeText: { color: colors.text, fontWeight: '600' },
});
