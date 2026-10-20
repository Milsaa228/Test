import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ScrollViewInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { card, colors } from '../components/theme';
import { useData } from '../context/DataContext';
import { askText, DEFAULT_AI } from '../lib/ai';
import { buildSystemPrompt, toChatMessages } from '../lib/finContext';
import { computeForecast } from '../lib/forecast';
import { formatMoney, monthTitle } from '../lib/stats';
import { CHAT_LIMIT, loadAiKey, loadChat, saveChat } from '../lib/storage';
import type { ChatTurn } from '../lib/types';

const QUICK_QUESTIONS = [
  'Могу ли я позволить себе отпуск в марте за 100 000 ₽?',
  'Где я переплачиваю?',
  'Составь бюджет на следующий месяц',
];

function errorText(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

function plural(n: number, forms: [string, string, string]) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

export default function AssistantScreen() {
  const { ready, transactions, settings } = useData();
  const insets = useSafeAreaInsets();
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const scrollToEnd = useRef(false);

  // Ключ могут добавить или удалить на вкладке «Источники» — перечитываем при каждом открытии.
  useFocusEffect(
    useCallback(() => {
      loadAiKey().then(setApiKey);
    }, []),
  );

  useEffect(() => {
    loadChat().then(setChat);
  }, []);

  const forecast = useMemo(
    () => computeForecast(transactions, settings.includeTransfers),
    [transactions, settings.includeTransfers],
  );
  const system = useMemo(
    () => buildSystemPrompt(transactions, settings.includeTransfers),
    [transactions, settings.includeTransfers],
  );

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || thinking || !apiKey) return;
    const before = chat;
    const history = [...chat, { role: 'user' as const, text, at: new Date().toISOString() }].slice(-CHAT_LIMIT);
    setChat(history);
    setInput('');
    setError(null);
    setThinking(true);
    scrollToEnd.current = true;
    try {
      const answer = await askText(
        { apiKey, baseUrl: settings.aiBaseUrl || DEFAULT_AI.baseUrl, model: settings.aiModel || DEFAULT_AI.model },
        { system, messages: toChatMessages(history) },
      );
      const next = [...history, { role: 'assistant' as const, text: answer, at: new Date().toISOString() }].slice(-CHAT_LIMIT);
      scrollToEnd.current = true;
      setChat(next);
      await saveChat(next);
    } catch (e) {
      // Неотвеченный вопрос не оставляем в истории — возвращаем его в поле ввода.
      setChat(before);
      setInput(text);
      setError(errorText(e));
    } finally {
      setThinking(false);
    }
  };

  const onNewChat = () => {
    setChat([]);
    setError(null);
    saveChat([]);
  };

  if (!ready) return <ActivityIndicator style={{ marginTop: 40 }} />;

  if (transactions.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>Двойнику пока не на что опереться</Text>
        <Text style={styles.emptyText}>
          Загрузите операции — CSV-выписку, Т-Бизнес API или демо-данные. Тогда появятся прогноз, подписки и чат.
        </Text>
        <Pressable style={styles.primary} onPress={() => router.navigate('/settings')}>
          <Text style={styles.primaryText}>Добавить данные</Text>
        </Pressable>
      </View>
    );
  }

  const { salary, untilPayday } = forecast;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top + 44}
    >
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => {
          if (!scrollToEnd.current) return;
          scrollToEnd.current = false;
          scrollRef.current?.scrollToEnd({ animated: true });
        }}
      >
        <View style={card}>
          <Text style={styles.tileLabel}>Прогноз расходов · {monthTitle(forecast.month)}</Text>
          <Text style={styles.bigValue}>{formatMoney(forecast.projectedExpense)}</Text>
          <Text style={styles.hint}>
            Потрачено {formatMoney(forecast.spentSoFar)} · ≈ {formatMoney(forecast.dailyBase)} в день · осталось{' '}
            {forecast.daysLeft} {plural(forecast.daysLeft, ['день', 'дня', 'дней'])}
          </Text>
          <View style={styles.tiles}>
            <View style={styles.tile}>
              <Text style={styles.tileLabel}>До зарплаты</Text>
              {salary && untilPayday ? (
                <>
                  <Text style={styles.tileValue}>
                    {untilPayday.days === 0 ? 'сегодня' : `${untilPayday.days} ${plural(untilPayday.days, ['день', 'дня', 'дней'])}`}
                  </Text>
                  <Text style={styles.hint}>
                    {shortDate(salary.nextDate)} · ≈ {formatMoney(salary.amount)}
                    {'\n'}до неё уйдёт ≈ {formatMoney(untilPayday.expectedExpense)}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.tileValue}>—</Text>
                  <Text style={styles.hint}>Регулярный доход не найден</Text>
                </>
              )}
            </View>
            <View style={styles.tile}>
              <Text style={styles.tileLabel}>Подписки до конца месяца</Text>
              <Text style={styles.tileValue}>{formatMoney(forecast.upcomingRecurringTotal)}</Text>
              <Text style={styles.hint}>
                {forecast.upcomingRecurring.length
                  ? `${forecast.upcomingRecurring.length} ${plural(forecast.upcomingRecurring.length, ['списание', 'списания', 'списаний'])}`
                  : 'списаний не ожидается'}
              </Text>
            </View>
          </View>
        </View>

        <View style={card}>
          <Text style={styles.cardTitle}>Регулярные платежи</Text>
          {forecast.recurring.length === 0 ? (
            <Text style={styles.muted}>
              Не нашли ежемесячных списаний. Нужна история хотя бы за 3 месяца.
            </Text>
          ) : (
            <>
              {forecast.recurring.map((r) => (
                <View key={r.merchant} style={styles.subRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.subName} numberOfLines={1}>{r.merchant}</Text>
                    <Text style={styles.hint}>
                      {r.category} · следующее {shortDate(r.nextDate)}
                    </Text>
                  </View>
                  <Text style={styles.subAmount}>{formatMoney(r.amount)}</Text>
                </View>
              ))}
              <Text style={[styles.hint, { marginTop: 8 }]}>
                Всего ≈ {formatMoney(forecast.recurring.reduce((s, r) => s + r.amount, 0))} в месяц
              </Text>
            </>
          )}
        </View>

        <View style={card}>
          <View style={styles.chatHeader}>
            <Text style={[styles.cardTitle, { marginBottom: 0 }]}>Спросить двойника</Text>
            {chat.length > 0 && (
              <Pressable onPress={onNewChat} disabled={thinking} hitSlop={8}>
                <Text style={[styles.link, thinking && { opacity: 0.4 }]}>Новый разговор</Text>
              </Pressable>
            )}
          </View>

          {!apiKey ? (
            <>
              <Text style={styles.text}>
                Чтобы задавать вопросы о своих финансах, добавьте бесплатный ключ нейросети на вкладке «Источники».
              </Text>
              <Pressable style={styles.primary} onPress={() => router.navigate('/settings')}>
                <Text style={styles.primaryText}>Добавить ключ</Text>
              </Pressable>
            </>
          ) : (
            <>
              {chat.length === 0 && (
                <>
                  <Text style={styles.text}>
                    Двойник видит сводку ваших операций за 6 месяцев и прогноз. Попробуйте спросить:
                  </Text>
                  <View style={styles.chips}>
                    {QUICK_QUESTIONS.map((q) => (
                      <Pressable
                        key={q}
                        style={({ pressed }) => [styles.chip, { opacity: thinking ? 0.4 : pressed ? 0.7 : 1 }]}
                        onPress={() => send(q)}
                        disabled={thinking}
                      >
                        <Text style={styles.chipText}>{q}</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              )}
              {chat.map((t, i) => (
                <View key={`${t.at}|${i}`} style={[styles.bubble, t.role === 'user' ? styles.userBubble : styles.botBubble]}>
                  <Text style={styles.bubbleText} selectable>{t.text}</Text>
                </View>
              ))}
              {thinking && (
                <View style={styles.thinking}>
                  <ActivityIndicator color={colors.muted} size="small" />
                  <Text style={styles.muted}>Двойник думает…</Text>
                </View>
              )}
              {error && <Text style={styles.error}>{error}</Text>}
            </>
          )}
        </View>
      </ScrollView>

      {apiKey && (
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            placeholder="Спросите о своих финансах…"
            placeholderTextColor={colors.muted}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={2000}
            editable={!thinking}
          />
          <Pressable
            style={({ pressed }) => [styles.send, { opacity: thinking || !input.trim() ? 0.4 : pressed ? 0.7 : 1 }]}
            onPress={() => send(input)}
            disabled={thinking || !input.trim()}
            accessibilityLabel="Отправить"
          >
            <Text style={styles.sendText}>↑</Text>
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 24 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 12 },
  bigValue: { fontSize: 28, fontWeight: '700', color: colors.text, marginTop: 4 },
  tiles: { flexDirection: 'row', gap: 12, marginTop: 14 },
  tile: { flex: 1, backgroundColor: colors.bg, borderRadius: 14, padding: 12 },
  tileLabel: { fontSize: 13, color: colors.muted },
  tileValue: { fontSize: 18, fontWeight: '700', color: colors.text, marginTop: 4 },
  hint: { fontSize: 12, lineHeight: 16, color: colors.muted, marginTop: 4 },
  muted: { color: colors.muted },
  text: { fontSize: 14, lineHeight: 20, color: colors.muted, marginBottom: 12 },
  subRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 12 },
  subName: { fontSize: 15, color: colors.text },
  subAmount: { fontSize: 15, fontWeight: '600', color: colors.text },
  chatHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  link: { fontSize: 14, fontWeight: '600', color: colors.muted },
  chips: { gap: 8 },
  chip: { backgroundColor: colors.bg, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, alignSelf: 'flex-start' },
  chipText: { fontSize: 14, color: colors.text },
  bubble: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 8, maxWidth: '90%' },
  userBubble: { backgroundColor: colors.accent, alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  botBubble: { backgroundColor: colors.bg, alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 15, lineHeight: 21, color: colors.text },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  error: { fontSize: 14, color: colors.danger, marginTop: 6 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  input: { flex: 1, maxHeight: 120, backgroundColor: colors.bg, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: colors.text },
  send: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  sendText: { fontSize: 20, fontWeight: '700', color: colors.accentText },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 8, textAlign: 'center' },
  emptyText: { fontSize: 15, color: colors.muted, textAlign: 'center', lineHeight: 21, marginBottom: 20 },
  primary: { backgroundColor: colors.accent, borderRadius: 14, paddingHorizontal: 24, paddingVertical: 14, alignItems: 'center' },
  primaryText: { fontSize: 16, fontWeight: '600', color: colors.accentText },
});
