import * as DocumentPicker from 'expo-document-picker';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { card, colors } from '../components/theme';
import { useData } from '../context/DataContext';
import { formatMoney } from '../lib/stats';
import { loadClaudeKey, loadToken, saveClaudeKey, saveToken } from '../lib/storage';
import { fetchAccounts, type BankAccount } from '../lib/tbankApi';

const PERIODS = [3, 6, 12];

function notify(title: string, message?: string) {
  if (Platform.OS === 'web') window.alert(message ? `${title}\n\n${message}` : title);
  else Alert.alert(title, message);
}

function errorText(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

export default function SettingsScreen() {
  const { transactions, settings, updateSettings, importCsvBase64, syncApi, loadDemo, clear } = useData();
  const [token, setToken] = useState('');
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [pickedAccount, setAccount] = useState<string>();
  const account = pickedAccount ?? settings.accountNumber;
  const [period, setPeriod] = useState(6);
  const [busy, setBusy] = useState<string | null>(null);
  const [claudeKey, setClaudeKey] = useState('');
  const [claudeSaved, setClaudeSaved] = useState(false);

  useEffect(() => {
    loadToken().then((t) => t && setToken(t));
    loadClaudeKey().then((k) => {
      if (k) {
        setClaudeKey(k);
        setClaudeSaved(true);
      }
    });
  }, []);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      notify('Ошибка', errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const onLoadAccounts = () =>
    run('Получаем счета…', async () => {
      const list = await fetchAccounts(token);
      await saveToken(token.trim());
      setAccounts(list);
      if (list.length && !list.some((a) => a.accountNumber === account)) setAccount(list[0].accountNumber);
      if (!list.length) notify('Счета не найдены', 'Проверьте права токена.');
    });

  const onSync = () =>
    run('Загружаем выписку…', async () => {
      if (!account) throw new Error('Выберите счёт');
      const added = await syncApi(token, account, period, (n) => setBusy(`Загружено операций: ${n}`));
      notify('Готово', `Новых операций: ${added}`);
    });

  const onImportCsv = () =>
    run('Импортируем…', async () => {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/vnd.ms-excel', '*/*'],
        copyToCacheDirectory: true,
        base64: true,
      });
      if (res.canceled) return;
      const asset = res.assets[0];
      const base64 = asset.base64 ?? (Platform.OS === 'web' ? await readWebFile(asset.file) : undefined);
      if (!base64) throw new Error('Не удалось прочитать файл');
      const { added, skipped } = await importCsvBase64(base64);
      notify('Импорт завершён', `Добавлено: ${added}${skipped ? `\nПропущено (отклонённые/пустые): ${skipped}` : ''}`);
    });

  const onSaveClaudeKey = () =>
    run('Сохраняем ключ…', async () => {
      const key = claudeKey.trim();
      if (!key.startsWith('sk-')) throw new Error('Ключ Claude API начинается с «sk-». Создайте его на console.anthropic.com.');
      await saveClaudeKey(key);
      setClaudeSaved(true);
      notify('Ключ сохранён', 'Теперь можно задавать вопросы на вкладке «Двойник».');
    });

  const onRemoveClaudeKey = () =>
    run('Удаляем ключ…', async () => {
      await saveClaudeKey(null);
      setClaudeKey('');
      setClaudeSaved(false);
    });

  const onClear = () => {
    const doClear = () => run('Удаляем…', clear).then(() => {
      setToken('');
      setClaudeKey('');
      setClaudeSaved(false);
      setAccounts([]);
      setAccount(undefined);
    });
    if (Platform.OS === 'web') {
      if (window.confirm('Удалить все операции, историю чата и ключи?')) doClear();
      return;
    }
    Alert.alert('Удалить все данные?', 'Операции, история чата, токен и ключ Claude будут удалены с устройства.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: doClear },
    ]);
  };

  const sources = new Set(transactions.map((t) => t.source));

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      {busy && (
        <View style={styles.busy}>
          <ActivityIndicator color={colors.text} />
          <Text style={styles.busyText}>{busy}</Text>
        </View>
      )}

      <View style={card}>
        <Text style={styles.title}>Выписка из приложения Т-Банка</Text>
        <Text style={styles.text}>
          Подходит для личных карт. В приложении или на tbank.ru откройте «Операции» → выберите период → «Выписка» /
          «Скачать» → формат CSV. Затем импортируйте файл сюда. Повторный импорт того же периода не создаёт дублей.
        </Text>
        <Button label="Импортировать CSV" onPress={onImportCsv} disabled={!!busy} primary />
      </View>

      <View style={card}>
        <Text style={styles.title}>Т-Бизнес API</Text>
        <Text style={styles.text}>
          Для счетов ИП и юрлиц. Выпустите токен в Т-Бизнесе: «Интеграции» → «Т-API» с доступом к выписке. Токен
          хранится в защищённом хранилище устройства.
        </Text>
        <TextInput
          style={styles.input}
          placeholder="Токен (t.xxxxxx…)"
          placeholderTextColor={colors.muted}
          value={token}
          onChangeText={setToken}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Button label="Получить счета" onPress={onLoadAccounts} disabled={!!busy || !token.trim()} />

        {(accounts.length > 0 || settings.accountNumber) && (
          <>
            <Text style={styles.label}>Счёт</Text>
            {accounts.length === 0 && settings.accountNumber ? (
              <Option label={`…${settings.accountNumber.slice(-4)}`} active onPress={() => {}} />
            ) : (
              accounts.map((a) => (
                <Option
                  key={a.accountNumber}
                  label={`${a.name} ·${a.accountNumber.slice(-4)}`}
                  hint={a.balance !== undefined ? formatMoney(a.balance, a.currency) : a.currency}
                  active={account === a.accountNumber}
                  onPress={() => setAccount(a.accountNumber)}
                />
              ))
            )}
            <Text style={styles.label}>Период</Text>
            <View style={styles.segment}>
              {PERIODS.map((p) => (
                <Pressable key={p} style={[styles.segmentItem, period === p && styles.segmentActive]} onPress={() => setPeriod(p)}>
                  <Text style={styles.segmentText}>{p} мес.</Text>
                </Pressable>
              ))}
            </View>
            <Button label="Синхронизировать" onPress={onSync} disabled={!!busy || !token.trim() || !account} primary />
          </>
        )}
        {settings.lastSyncAt && (
          <Text style={styles.hint}>Последняя синхронизация: {new Date(settings.lastSyncAt).toLocaleString('ru-RU')}</Text>
        )}
      </View>

      <View style={card}>
        <Text style={styles.title}>Claude API — «Двойник»</Text>
        <Text style={styles.text}>
          Ключ нужен для чата на вкладке «Двойник». Создайте его на console.anthropic.com. Запросы идут напрямую на
          api.anthropic.com; модели отправляется сводка расходов, а не вся выписка.
        </Text>
        <TextInput
          style={styles.input}
          placeholder="Ключ (sk-ant-…)"
          placeholderTextColor={colors.muted}
          value={claudeKey}
          onChangeText={setClaudeKey}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Button label="Сохранить ключ" onPress={onSaveClaudeKey} disabled={!!busy || !claudeKey.trim()} primary={!claudeSaved} />
        {claudeSaved && <Button label="Удалить ключ" onPress={onRemoveClaudeKey} disabled={!!busy} danger />}
        <Text style={styles.hint}>
          {Platform.OS === 'web'
            ? 'В web-версии ключ хранится только в памяти до перезагрузки страницы.'
            : 'Ключ хранится в защищённом хранилище устройства (Keychain / Keystore).'}
          {claudeSaved ? ' Ключ сохранён.' : ''}
        </Text>
      </View>

      <View style={card}>
        <Text style={styles.title}>Статистика</Text>
        <View style={styles.switchRow}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={styles.switchLabel}>Учитывать переводы</Text>
            <Text style={styles.hint}>Переводы людям и между своими счетами обычно не считают тратами</Text>
          </View>
          <Switch
            value={settings.includeTransfers}
            onValueChange={(v) => updateSettings({ includeTransfers: v })}
            trackColor={{ true: colors.accent, false: colors.border }}
          />
        </View>
      </View>

      <View style={card}>
        <Text style={styles.title}>Данные</Text>
        <Text style={styles.text}>
          Операций сохранено: {transactions.length}
          {sources.has('demo') ? ' (демо)' : ''}
        </Text>
        <Button label="Загрузить демо-данные" onPress={() => run('Генерируем…', loadDemo)} disabled={!!busy} />
        <Button label="Удалить все данные" onPress={onClear} disabled={!!busy || transactions.length === 0} danger />
      </View>
    </ScrollView>
  );
}

async function readWebFile(file?: File): Promise<string | undefined> {
  if (!file) return undefined;
  const buf = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (const b of buf) binary += String.fromCharCode(b);
  return btoa(binary);
}

function Button({ label, onPress, disabled, primary, danger }: { label: string; onPress: () => void; disabled?: boolean; primary?: boolean; danger?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        primary && { backgroundColor: colors.accent },
        { opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
      ]}
    >
      <Text style={[styles.buttonText, danger && { color: colors.danger }]}>{label}</Text>
    </Pressable>
  );
}

function Option({ label, hint, active, onPress }: { label: string; hint?: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.option, active && styles.optionActive]}>
      <Text style={styles.optionText} numberOfLines={1}>{label}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 6 },
  text: { fontSize: 14, lineHeight: 20, color: colors.muted, marginBottom: 12 },
  hint: { fontSize: 12, color: colors.muted, marginTop: 4 },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, marginTop: 12, marginBottom: 6 },
  input: { backgroundColor: colors.bg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text, marginBottom: 10 },
  button: { backgroundColor: colors.bg, borderRadius: 14, paddingVertical: 13, alignItems: 'center', marginTop: 6 },
  buttonText: { fontSize: 15, fontWeight: '600', color: colors.text },
  option: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, marginBottom: 6 },
  optionActive: { borderColor: colors.text, backgroundColor: colors.bg },
  optionText: { fontSize: 15, color: colors.text },
  segment: { flexDirection: 'row', backgroundColor: colors.bg, borderRadius: 12, padding: 3, marginBottom: 6 },
  segmentItem: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10 },
  segmentActive: { backgroundColor: colors.card },
  segmentText: { fontSize: 14, color: colors.text },
  switchRow: { flexDirection: 'row', alignItems: 'center' },
  switchLabel: { fontSize: 15, color: colors.text },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.accent, borderRadius: 14, padding: 12, marginBottom: 12 },
  busyText: { fontSize: 14, color: colors.accentText },
});
