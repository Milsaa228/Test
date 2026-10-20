// Тесты чистой логики (без React Native): компилируем src/lib в CommonJS и проверяем через node:test.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const out = mkdtempSync(join(tmpdir(), 'tbank-test-'));
execFileSync('npx', ['tsc', '--outDir', out, '--module', 'commonjs', '--target', 'es2020', '--ignoreConfig', '--types', 'node',
  '--skipLibCheck', '--strict', 'src/lib/csvImport.ts', 'src/lib/encoding.ts', 'src/lib/stats.ts', 'src/lib/tbankApi.ts', 'src/lib/demo.ts',
  'src/lib/forecast.ts', 'src/lib/finContext.ts'], { stdio: 'inherit' });
writeFileSync(join(out, 'package.json'), '{"type":"commonjs"}');
const require = createRequire(join(out, 'x.js'));
const { importTbankCsv } = require('./csvImport.js');
const { decodeText, base64ToBytes, decodeCp1251 } = require('./encoding.js');
const { computeMonthStats, mergeTransactions, monthKey, formatMoney } = require('./stats.js');
const { mapOperation } = require('./tbankApi.js');
const { generateDemo } = require('./demo.js');
const { computeForecast, detectRecurring, detectSalary, merchantKey } = require('./forecast.js');
const { buildFinContext, MAX_LARGE_TX } = require('./finContext.js');

const HEADER = '"Дата операции";"Дата платежа";"Номер карты";"Статус";"Сумма операции";"Валюта операции";"Сумма платежа";"Валюта платежа";"Кэшбэк";"Категория";"MCC";"Описание";"Бонусы (включая кэшбэк)";"Округление на инвесткопилку";"Сумма операции с округлением"';
const CSV = [
  HEADER,
  '"15.09.2026 19:02:11";"16.09.2026";"*1234";"OK";"-1250,50";"RUB";"-1250,50";"RUB";"";"Супермаркеты";"5411";"Пятёрочка";"12,00";"0,00";"1250,50"',
  '"15.09.2026 19:02:11";"16.09.2026";"*1234";"OK";"-1250,50";"RUB";"-1250,50";"RUB";"";"Супермаркеты";"5411";"Пятёрочка";"12,00";"0,00";"1250,50"',
  '"14.09.2026 10:00:00";"14.09.2026";"*1234";"FAILED";"-500,00";"RUB";"-500,00";"RUB";"";"Такси";"4121";"Яндекс Go";"0";"0";"500"',
  '"13.09.2026 09:00:00";"13.09.2026";"";"OK";"80000,00";"RUB";"80000,00";"RUB";"";"Другое";"";"Зарплата; аванс";"0";"0";"80000"',
  '"02.08.2026 12:00:00";"02.08.2026";"*1234";"OK";"-1 000,00";"RUB";"-1 000,00";"RUB";"";"";"5812";"Кафе ""Ромашка""";"0";"0";"1000"',
].join('\r\n');

function toCp1251Base64(text) {
  const table = new Map();
  for (let b = 0x80; b <= 0xff; b++) table.set(decodeCp1251(Uint8Array.of(b)), b);
  const bytes = [...text].map((ch) => (ch.charCodeAt(0) < 0x80 ? ch.charCodeAt(0) : table.get(ch)));
  assert.ok(bytes.every((b) => b !== undefined), 'all chars encodable');
  return Buffer.from(bytes).toString('base64');
}

test('cp1251 table has 64 high chars and maps А/я/ё', () => {
  assert.equal(decodeCp1251(Uint8Array.of(0xc0, 0xff, 0xb8, 0xa8, 0xb9)), 'АяёЁ№');
});

test('decodes both UTF-8 and Windows-1251 files', () => {
  const utf = decodeText(base64ToBytes(Buffer.from('﻿' + CSV).toString('base64')));
  const cp = decodeText(base64ToBytes(toCp1251Base64(CSV)));
  assert.equal(utf, CSV);
  assert.equal(cp, CSV);
});

test('imports T-Bank CSV statement', () => {
  const { transactions, skipped } = importTbankCsv(CSV);
  assert.equal(skipped, 1); // FAILED
  assert.equal(transactions.length, 4);
  const [a, b, salary, cafe] = transactions;
  assert.notEqual(a.id, b.id, 'identical rows get distinct ids');
  assert.deepEqual([a.amount, a.direction, a.category, a.description], [1250.5, 'expense', 'Супермаркеты', 'Пятёрочка']);
  assert.equal(new Date(a.date).getHours(), 19);
  assert.deepEqual([salary.direction, salary.amount, salary.description], ['income', 80000, 'Зарплата; аванс']);
  assert.equal(salary.category, 'Пополнения');
  assert.deepEqual([cafe.amount, cafe.category, cafe.description], [1000, 'Рестораны', 'Кафе "Ромашка"']);
  // повторный импорт не создаёт дублей
  const first = mergeTransactions([], transactions);
  const again = mergeTransactions(first.merged, importTbankCsv(CSV).transactions);
  assert.equal(again.added, 0);
  assert.equal(again.merged.length, 4);
});

test('month stats', () => {
  const { transactions } = importTbankCsv(CSV);
  const s = computeMonthStats(transactions, '2026-09', false);
  assert.equal(s.expense, 2501);
  assert.equal(s.income, 80000);
  assert.equal(s.prevExpense, 1000);
  assert.equal(s.daily.length, 30);
  assert.equal(s.daily[14], 2501);
  assert.equal(s.byCategory[0].category, 'Супермаркеты');
  assert.equal(s.byCategory[0].share, 1);
  assert.equal(formatMoney(2501), '2 501 ₽');
});

test('transfers excluded unless enabled', () => {
  const tx = [{ id: '1', date: new Date(2026, 8, 3).toISOString(), amount: 500, direction: 'expense', currency: 'RUB', category: 'Переводы', description: 'x', source: 'csv' }];
  assert.equal(computeMonthStats(tx, '2026-09', false).expense, 0);
  assert.equal(computeMonthStats(tx, '2026-09', true).expense, 500);
  const topUp = { ...tx[0], id: '2', direction: 'income', category: 'Пополнения' };
  assert.equal(computeMonthStats([topUp], '2026-09', false).income, 500);
});

test('maps T-Business API operation', () => {
  const tx = mapOperation({
    operationId: 'abc', operationDate: '2026-09-10T08:00:00Z', typeOfOperation: 'Debit', category: 'cardOperation',
    accountAmount: 349.9, accountCurrencyDigitalCode: '643', merchant: { name: 'YANDEX.TAXI' }, mcc: '4121',
  });
  assert.deepEqual([tx.id, tx.amount, tx.direction, tx.currency, tx.category, tx.description], ['api|abc', 349.9, 'expense', 'RUB', 'Такси', 'YANDEX.TAXI']);
  const income = mapOperation({ operationId: 'd', operationDate: '2026-09-10', typeOfOperation: 'Credit', category: 'contragentIncome', accountAmount: 1000, counterParty: { name: 'ООО Альфа' } });
  assert.deepEqual([income.direction, income.category, income.description], ['income', 'Поступления от контрагентов', 'ООО Альфа']);
  assert.equal(mapOperation({ operationDate: '2026-09-10', accountAmount: 0 }), null);
});

test('demo data covers current month', () => {
  const demo = generateDemo();
  assert.ok(demo.length > 100);
  assert.ok(computeMonthStats(demo, monthKey(new Date()), false).expense > 0);
});

// ——— Прогноз и контекст для «двойника» ———

let seq = 0;
function tx(y, m, d, amount, description, direction = 'expense', category = 'Другое') {
  return { id: `t${seq++}`, date: new Date(y, m - 1, d, 10).toISOString(), amount, direction, currency: 'RUB', category, description, source: 'csv' };
}
const NOW = new Date(2026, 9, 15, 12); // 15 октября 2026, полдень

/** 1 июля — 15 октября: каждый день 1000 ₽ в магазине, подписка 20-го, зарплата 5-го, одна крупная покупка. */
function synthetic() {
  const txs = [];
  for (let d = new Date(2026, 6, 1); d <= NOW; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    txs.push(tx(d.getFullYear(), d.getMonth() + 1, d.getDate(), 1000, 'Пятёрочка', 'expense', 'Супермаркеты'));
  }
  for (const m of [7, 8, 9]) txs.push(tx(2026, m, 20, 500 + m, 'Кинопоиск', 'expense', 'Развлечения'));
  for (const m of [7, 8, 9, 10]) txs.push(tx(2026, m, 5, 100000, `Зарплата за ${m}.2026`, 'income', 'Зарплата'));
  for (const m of [7, 8, 9, 10]) txs.push(tx(2026, m, 25 - m, 5000, 'Кэшбэк', 'income', 'Пополнения'));
  txs.push(tx(2026, 8, 10, 200000, 'Туроператор', 'expense', 'Путешествия'));
  return txs;
}

test('merchant key ignores case, digits and punctuation', () => {
  assert.equal(merchantKey('Зарплата за 09.2026'), merchantKey('ЗАРПЛАТА за 10.2026'));
  assert.equal(merchantKey('Ёлка'), 'елка');
});

test('detects monthly subscriptions, ignores irregular and cancelled', () => {
  const txs = [
    ...synthetic(),
    // отменённая: последняя оплата в июле
    tx(2026, 5, 3, 299, 'Spotify'), tx(2026, 6, 3, 299, 'Spotify'), tx(2026, 7, 3, 299, 'Spotify'),
    // нерегулярные траты у того же продавца, что и подписка
    tx(2026, 9, 2, 4500, 'Яндекс Go'), tx(2026, 9, 9, 380, 'Яндекс Go'),
    tx(2026, 8, 1, 299, 'Яндекс Go'), tx(2026, 9, 1, 299, 'Яндекс Go'), tx(2026, 10, 1, 299, 'Яндекс Go'),
    // только два раза — мало
    tx(2026, 8, 7, 990, 'Облако'), tx(2026, 9, 7, 990, 'Облако'),
  ];
  const rec = detectRecurring(txs.filter((t) => t.direction === 'expense'), NOW);
  assert.deepEqual(rec.map((r) => r.merchant), ['Кинопоиск', 'Яндекс Go']);
  const [kino, go] = rec;
  assert.equal(kino.amount, 508);
  assert.equal(kino.count, 3);
  assert.equal(new Date(kino.nextDate).getTime(), new Date(2026, 9, 20).getTime());
  assert.equal(go.amount, 299);
  assert.equal(new Date(go.nextDate).getTime(), new Date(2026, 10, 1).getTime());
});

test('overdue subscription is expected today within grace period', () => {
  const txs = [tx(2026, 7, 10, 199, 'VPN'), tx(2026, 8, 10, 199, 'VPN'), tx(2026, 9, 10, 199, 'VPN')];
  const [r] = detectRecurring(txs, NOW);
  assert.equal(new Date(r.nextDate).getTime(), new Date(2026, 9, 15).getTime());
  assert.equal(detectRecurring(txs, new Date(2026, 9, 25)).length, 0);
});

test('detects salary as the largest regular income', () => {
  const s = detectSalary(synthetic(), NOW);
  assert.equal(s.amount, 100000);
  assert.equal(s.payer, 'Зарплата за 10.2026');
  assert.equal(new Date(s.nextDate).getTime(), new Date(2026, 10, 5).getTime());
  // аванс 20-го + зарплата 5-го: интервал ~15 дней
  const twice = [];
  for (const m of [7, 8, 9]) twice.push(tx(2026, m, 5, 60000, 'ООО Альфа', 'income'), tx(2026, m, 20, 40000, 'ООО Альфа', 'income'));
  const s2 = detectSalary(twice, NOW);
  assert.ok(s2.intervalDays >= 14 && s2.intervalDays <= 16);
  assert.equal(new Date(s2.nextDate).getTime(), new Date(2026, 9, 15).getTime()); // просрочено → ждём сегодня
  assert.equal(detectSalary([tx(2026, 9, 5, 100000, 'Разовый', 'income')], NOW), undefined);
});

test('month-end forecast and days until payday', () => {
  const f = computeForecast(synthetic(), false, NOW);
  assert.equal(f.month, '2026-10');
  assert.equal(f.spentSoFar, 15000);
  assert.equal(f.incomeSoFar, 105000);
  assert.equal(f.dailyBase, 1000); // без подписки и без покупки за 200 000
  assert.equal(f.daysLeft, 16);
  assert.equal(f.upcomingRecurringTotal, 508);
  assert.equal(f.projectedExpense, 15000 + 16 * 1000 + 508);
  assert.deepEqual(f.untilPayday, { days: 21, expectedExpense: 21 * 1000 + 508, balanceChange: -(21 * 1000 + 508) });
});

test('forecast with no data', () => {
  const f = computeForecast([], false, NOW);
  assert.deepEqual([f.spentSoFar, f.dailyBase, f.projectedExpense, f.recurring.length, f.salary], [0, 0, 0, 0, undefined]);
});

test('forecast on demo data is sane', () => {
  const demo = generateDemo();
  const f = computeForecast(demo, false);
  for (const name of ['Яндекс Плюс', 'МТС, тариф', 'Фитнес-клуб DDX']) assert.ok(f.recurring.some((r) => r.merchant === name), name);
  assert.equal(f.salary.amount, 120000);
  assert.ok(f.untilPayday.days >= 0 && f.untilPayday.days <= 31);
  assert.ok(f.dailyBase > 1000 && f.dailyBase < 10000, `dailyBase ${f.dailyBase}`);
  assert.ok(f.projectedExpense >= f.spentSoFar);
  const trend = [1, 2, 3].map((i) => computeMonthStats(demo, monthKey(new Date(new Date().getFullYear(), new Date().getMonth() - i, 1)), false).expense);
  const avg = trend.reduce((a, b) => a + b) / trend.length;
  assert.ok(f.projectedExpense > avg * 0.5 && f.projectedExpense < avg * 1.5, `projected ${f.projectedExpense} vs avg ${avg}`);
});

test('financial context is compact and bounded', () => {
  // 300 дополнительных покупок по 2000–2299 ₽: в список крупных попадут не все
  const extra = Array.from({ length: 300 }, (_, i) => tx(2026, 7 + (i % 3), 1 + (i % 28), 2000 + i, `Магазин ${i}`));
  const ctx = buildFinContext([...synthetic(), ...extra], false, NOW);
  for (const part of ['## Итоги по месяцам', 'Октябрь 2026 (месяц не закончился)', 'Кинопоиск', 'Зарплата за 10.2026', 'До зарплаты дней: 21']) {
    assert.ok(ctx.includes(part), part);
  }
  const lines = ctx.split('\n').filter((l) => /^\d{4}-\d{2}-\d{2};/.test(l));
  assert.equal(lines.length, MAX_LARGE_TX);
  assert.ok(lines[0] >= lines[lines.length - 1], 'newest first');
  assert.ok(ctx.includes('2026-08-10;расход;Путешествия;Туроператор;200000'));
  assert.ok(ctx.length < 20000, `context length ${ctx.length}`);
  const plain = buildFinContext(synthetic(), false, NOW);
  assert.ok(plain.includes(`Прогноз расходов за месяц: ${formatMoney(31508)}`));
  assert.ok(plain.includes(`Зарплата за 10.2026: ${formatMoney(400000)}, 4 поступл.`), 'incomes grouped by payer');
  const demoCtx = buildFinContext(generateDemo(), false);
  assert.ok(demoCtx.includes('Яндекс Плюс') && demoCtx.length < 20000);
  assert.ok(buildFinContext([], false, NOW).includes('не обнаружены'));
});
