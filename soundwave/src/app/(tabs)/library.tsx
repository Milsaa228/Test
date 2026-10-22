import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Cover } from '../../components/Cover';
import { Icon, type IconName } from '../../components/Icon';
import { NamePrompt } from '../../components/NamePrompt';
import { colors } from '../../components/theme';
import { useLibrary } from '../../context/LibraryContext';
import { useTrackMenu } from '../../context/TrackMenuContext';
import { tracksLabel } from '../../lib/library';
import { openCollection } from '../../lib/nav';

type Row = { id: string; title: string; subtitle: string; colors: [string, string]; icon?: IconName };

export default function Library() {
  const insets = useSafeAreaInsets();
  const { state, createPlaylist, importFiles } = useLibrary();
  const { showToast, addFromUrl } = useTrackMenu();
  const [prompt, setPrompt] = useState(false);
  const [urlPrompt, setUrlPrompt] = useState(false);
  const [filter, setFilter] = useState<'all' | 'playlists' | 'files'>('all');

  const rows: Row[] = [];
  if (filter !== 'files') {
    rows.push({ id: 'liked', title: 'Любимые треки', subtitle: `Плейлист · ${tracksLabel(state.liked.length)}`, colors: ['#5038ED', '#8FBCE6'], icon: 'heart' });
    for (const p of state.playlists) rows.push({ id: `pl:${p.id}`, title: p.name, subtitle: `Плейлист · ${tracksLabel(p.trackIds.length)}`, colors: p.colors });
  }
  if (filter !== 'playlists' && state.localTracks.length) {
    rows.push({ id: 'local', title: 'Мои треки', subtitle: `С устройства и из интернета · ${tracksLabel(state.localTracks.length)}`, colors: ['#F2994A', '#4F2A00'], icon: 'download' });
  }

  const fail = (title: string, e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    if (Platform.OS === 'web') showToast(title);
    else Alert.alert(title, msg);
  };

  const onUrl = (url: string) => {
    setUrlPrompt(false);
    addFromUrl(url).catch((e) => fail('Не удалось добавить трек', e));
  };

  const onImport = async () => {
    try {
      const n = await importFiles();
      if (n) showToast(`Добавлено: ${tracksLabel(n)}`);
    } catch (e) {
      fail('Не удалось импортировать файлы', e);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 12 }]}>
      <View style={styles.header}>
        <Text style={styles.heading}>Медиатека</Text>
        <Pressable onPress={() => router.push('/settings')} hitSlop={8} accessibilityLabel="Настройки">
          <Icon name="settings" size={24} color={colors.text} />
        </Pressable>
        <Pressable onPress={onImport} hitSlop={8} accessibilityLabel="Импортировать аудиофайлы">
          <Icon name="folder" size={24} color={colors.text} />
        </Pressable>
        <Pressable onPress={() => setPrompt(true)} hitSlop={8} accessibilityLabel="Создать плейлист">
          <Icon name="plus" size={28} color={colors.text} />
        </Pressable>
      </View>

      <View style={styles.chips}>
        {(
          [
            ['all', 'Всё'],
            ['playlists', 'Плейлисты'],
            ['files', 'Мои треки'],
          ] as const
        ).map(([key, label]) => (
          <Pressable key={key} onPress={() => setFilter(filter === key ? 'all' : key)} style={[styles.chip, filter === key && styles.chipOn]}>
            <Text style={[styles.chipText, filter === key && styles.chipTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        {rows.map((r) => (
          <Pressable key={r.id} onPress={() => openCollection(r.id)} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.elevated }]}>
            <Cover colors={r.colors} size={64} icon={r.icon} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={1}>
                {r.title}
              </Text>
              <Text style={styles.sub}>{r.subtitle}</Text>
            </View>
          </Pressable>
        ))}

        <Pressable onPress={() => setPrompt(true)} style={styles.row}>
          <View style={styles.action}>
            <Icon name="plus" size={28} color={colors.muted} />
          </View>
          <Text style={styles.title}>Создать плейлист</Text>
        </Pressable>
        <Pressable onPress={() => router.navigate({ pathname: '/search', params: { mode: 'net' } })} style={styles.row}>
          <View style={styles.action}>
            <Icon name="globe" size={26} color={colors.muted} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Найти музыку в интернете</Text>
            <Text style={styles.sub}>Свободная музыка из Internet Archive</Text>
          </View>
        </Pressable>
        <Pressable onPress={() => setUrlPrompt(true)} style={styles.row}>
          <View style={styles.action}>
            <Icon name="link" size={26} color={colors.muted} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Добавить по ссылке</Text>
            <Text style={styles.sub}>Прямая ссылка на MP3, M4A, OGG…</Text>
          </View>
        </Pressable>
        <Pressable onPress={onImport} style={styles.row}>
          <View style={styles.action}>
            <Icon name="folder" size={26} color={colors.muted} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Добавить музыку с устройства</Text>
            <Text style={styles.sub}>MP3, M4A, WAV и другие аудиофайлы</Text>
          </View>
        </Pressable>
      </ScrollView>

      <NamePrompt
        visible={urlPrompt}
        title="Трек по ссылке"
        confirmLabel={Platform.OS === 'web' ? 'Добавить' : 'Скачать'}
        placeholder="https://…/track.mp3"
        hint="Скачайте только то, что вам разрешено: свободная музыка или ваши файлы."
        inputProps={{ autoCapitalize: 'none', autoCorrect: false, keyboardType: 'url', maxLength: 2000, style: styles.urlInput }}
        onCancel={() => setUrlPrompt(false)}
        onSubmit={onUrl}
      />
      <NamePrompt
        visible={prompt}
        title="Новый плейлист"
        onCancel={() => setPrompt(false)}
        onSubmit={(name) => {
          setPrompt(false);
          openCollection(`pl:${createPlaylist(name)}`);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 20, paddingHorizontal: 16, marginBottom: 14 },
  heading: { flex: 1, color: colors.text, fontSize: 26, fontWeight: '800' },
  chips: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 10 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, backgroundColor: colors.card },
  chipOn: { backgroundColor: colors.accent },
  chipText: { color: colors.text, fontSize: 14 },
  chipTextOn: { color: colors.accentText, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  title: { color: colors.text, fontSize: 16, fontWeight: '500' },
  sub: { color: colors.muted, fontSize: 13, marginTop: 3 },
  urlInput: { color: colors.text, fontSize: 15, textAlign: 'center', borderBottomWidth: 1, borderColor: colors.faint, paddingVertical: 10, marginBottom: 24 },
  action: { width: 64, height: 64, borderRadius: 4, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
});
