import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '../components/Icon';
import { colors } from '../components/theme';
import { useLibrary } from '../context/LibraryContext';
import { useReco } from '../context/RecoContext';
import { useTrackMenu } from '../context/TrackMenuContext';
import { genreById } from '../lib/genres';
import { tracksLabel } from '../lib/library';

function confirm(title: string, message: string, ok: string, onOk: () => void) {
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(`${title}\n${message}`)) onOk();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Отмена', style: 'cancel' },
    { text: ok, style: 'destructive', onPress: onOk },
  ]);
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(bytes > 100 * 1024 * 1024 ? 0 : 1)} МБ`;

function Row({ icon, title, sub, right, onPress, danger }: { icon: IconName; title: string; sub?: string; right?: ReactNode; onPress?: () => void; danger?: boolean }) {
  const body = (
    <>
      <Icon name={icon} size={22} color={danger ? colors.danger : colors.muted} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, danger && { color: colors.danger }]}>{title}</Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
      {right}
    </>
  );
  // Строка с переключателем — обычный View: неактивный Pressable вокруг блокировал бы сам Switch.
  if (!onPress) return <View style={styles.row}>{body}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.elevated }]}>
      {body}
    </Pressable>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const library = useLibrary();
  const reco = useReco();
  const { showToast } = useTrackMenu();
  const [busy, setBusy] = useState(false);
  const { state, offline, networkDown, canDownload } = library;

  const downloaded = state.localTracks.filter((t) => t.local);
  const likedToDownload = state.liked.filter((id) => {
    const t = library.tracks.get(id);
    return t && !t.local;
  }).length;
  const prefs = [...state.prefs.genres.map((g) => genreById(g)?.name ?? g), ...state.prefs.artists];

  const downloadLiked = async () => {
    setBusy(true);
    try {
      const { ok, total } = await library.downloadLiked();
      showToast(ok === total ? `Скачано: ${tracksLabel(ok)}` : `Скачано ${ok} из ${total}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.top}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={10} accessibilityLabel="Назад">
          <Icon name="back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.heading}>Настройки</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <Text style={styles.section}>Без интернета</Text>
        <Row
          icon="cloudOff"
          title="Офлайн-режим"
          sub={networkDown ? 'Сейчас нет сети — приложение уже работает офлайн' : 'Играть только скачанные треки и не использовать интернет'}
          right={
            <Switch
              value={state.settings.offline}
              onValueChange={(v) => library.setSettings({ offline: v })}
              trackColor={{ true: colors.accent, false: colors.faint }}
              thumbColor="#fff"
              accessibilityLabel="Офлайн-режим"
            />
          }
        />
        {canDownload ? (
          <>
            <Row
              icon="download"
              title="Скачивать понравившиеся"
              sub="Трек с ♥ сразу сохраняется на телефон и будет играть без интернета"
              right={
                <Switch
                  value={state.settings.autoDownloadLiked}
                  onValueChange={(v) => library.setSettings({ autoDownloadLiked: v })}
                  trackColor={{ true: colors.accent, false: colors.faint }}
                  thumbColor="#fff"
                  accessibilityLabel="Скачивать понравившиеся"
                />
              }
            />
            <Row
              icon="heart"
              title="Скачать все понравившиеся сейчас"
              sub={likedToDownload ? `Ещё не скачано: ${tracksLabel(likedToDownload)}` : 'Все понравившиеся уже на телефоне'}
              onPress={likedToDownload && !offline && !busy ? downloadLiked : undefined}
              right={busy ? <ActivityIndicator color={colors.accent} /> : null}
            />
            <Row icon="folder" title="Загрузки" sub={`${tracksLabel(downloaded.length)} · ${mb(library.storageBytes())}`} />
            {downloaded.some((t) => t.remoteUri) && (
              <Row
                icon="trash"
                danger
                title="Удалить скачанные из интернета"
                sub="Треки останутся в медиатеке и будут играть онлайн"
                onPress={() =>
                  confirm('Удалить загрузки?', 'Файлы удалятся с телефона, треки останутся в медиатеке.', 'Удалить', () => {
                    const n = library.removeDownloads();
                    showToast(`Удалено: ${tracksLabel(n)}`);
                  })
                }
              />
            )}
          </>
        ) : (
          <Text style={styles.note}>Скачивание треков доступно в приложении для Android и iOS. В браузере офлайн-режим показывает только треки с устройства.</Text>
        )}

        <Text style={styles.section}>Рекомендации</Text>
        <Row
          icon="edit"
          title="Мои предпочтения"
          sub={prefs.length ? prefs.join(', ') : 'Не выбраны — рекомендуем популярные жанры'}
          onPress={() => router.push({ pathname: '/onboarding', params: { edit: '1' } })}
        />
        <Row
          icon="wave"
          title="Обновить миксы"
          sub="Собрать миксы дня, недели и месяца заново"
          onPress={
            offline
              ? undefined
              : () => {
                  reco.refreshMixes();
                  showToast('Миксы собираются заново');
                }
          }
        />
        <Row
          icon="trash"
          danger
          title="Очистить историю прослушиваний"
          sub="Рекомендации забудут прослушанное, пропущенное и «не нравится»"
          onPress={() =>
            confirm('Очистить историю?', 'Лайки и плейлисты останутся.', 'Очистить', () => {
              library.dispatch({ type: 'clearHistory' });
              showToast('История очищена');
            })
          }
        />

        <Text style={styles.section}>О приложении</Text>
        <Row icon="info" title="Источники музыки и лицензии" onPress={() => router.push('/credits')} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 16, marginBottom: 4 },
  heading: { color: colors.text, fontSize: 20, fontWeight: '800' },
  section: { color: colors.text, fontSize: 17, fontWeight: '700', marginHorizontal: 16, marginTop: 24, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 12 },
  rowTitle: { color: colors.text, fontSize: 16 },
  rowSub: { color: colors.muted, fontSize: 13, marginTop: 2 },
  note: { color: colors.muted, fontSize: 13, marginHorizontal: 16, marginTop: 4 },
});
