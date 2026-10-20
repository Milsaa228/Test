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
  '--skipLibCheck', '--strict', 'src/lib/csvImport.ts', 'src/lib/encoding.ts', 'src/lib/stats.ts', 'src/lib/tbankApi.ts', 'src/lib/demo.ts'], { stdio: 'inherit' });
writeFileSync(join(out, 'package.json'), '{"type":"commonjs"}');
const require = createRequire(join(out, 'x.js'));
const { importTbankCsv } = require('./csvImport.js');
const { decodeText, base64ToBytes, decodeCp1251 } = require('./encoding.js');
const { computeMonthStats, mergeTransactions, monthKey, formatMoney } = require('./stats.js');
const { mapOperation } = require('./tbankApi.js');
const { generateDemo } = require('./demo.js');

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
