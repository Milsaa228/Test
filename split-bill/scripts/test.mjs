// Тесты чистой логики (без React Native): компилируем src/lib в CommonJS и проверяем через node:test.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const out = mkdtempSync(join(tmpdir(), 'split-test-'));
execFileSync('npx', ['tsc', '--outDir', out, '--module', 'commonjs', '--target', 'es2020', '--ignoreConfig', '--types', 'node',
  '--skipLibCheck', '--strict', '--esModuleInterop', 'src/lib/split.ts', 'src/lib/receipt.ts', 'src/lib/claude.ts'], { stdio: 'inherit' });
writeFileSync(join(out, 'package.json'), '{"type":"commonjs"}');
symlinkSync(resolve('node_modules'), join(out, 'node_modules'));
const require = createRequire(join(out, 'x.js'));
const { allocate, computeShares, formatRub, shareMessage } = require('./split.js');
const { normalizeReceipt, recognizeReceipt } = require('./receipt.js');

const people = [{ id: 'a', name: 'Аня' }, { id: 'b', name: 'Боря' }, { id: 'c', name: 'Вика' }];
const bill = (items, tipPercent = 0) => ({ id: '1', title: 'Кафе', createdAt: '', people, items, tipPercent, payerId: 'a' });
const item = (name, price, assignees = []) => ({ id: name, name, price, quantity: 1, assignees });

test('allocate keeps the exact total', () => {
  assert.deepEqual(allocate(100, [1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(allocate(1001, [2, 1, 1]), [501, 250, 250]);
  assert.deepEqual(allocate(5, [0, 0]), [0, 0]);
  assert.deepEqual(allocate(-100, [1, 1, 1]), [-34, -33, -33]);
});

test('shares by assignees, unassigned split across everyone', () => {
  const shares = computeShares(bill([item('Пицца', 900, ['a', 'b']), item('Вода', 300), item('Торт', 450.5, ['c'])]));
  assert.deepEqual(shares.map((s) => s.amount), [55000, 55000, 55050]);
  assert.equal(shares.reduce((s, x) => s + x.amount, 0), 165050);
  assert.equal(shares[0].items[0].name, 'Пицца (1/2)');
});

test('tips are proportional and the sum stays exact', () => {
  const shares = computeShares(bill([item('Стейк', 1000, ['a']), item('Салат', 333.33, ['b'])], 10));
  const total = shares.reduce((s, x) => s + x.amount, 0);
  assert.equal(total, 133333 + 13333);
  assert.equal(shares[0].amount, 110000);
  assert.equal(shares[2].amount, 0);
  assert.equal(shares[0].items.at(-1).name, 'Чаевые 10%');
});

test('assignee who left the bill falls back to everyone', () => {
  const shares = computeShares(bill([item('Вино', 300, ['zzz'])]));
  assert.deepEqual(shares.map((s) => s.amount), [10000, 10000, 10000]);
});

test('formatting and share message', () => {
  assert.equal(formatRub(123456), '1 234,56 ₽');
  assert.equal(formatRub(100000), '1 000 ₽');
  const b = bill([item('Пицца', 900)]);
  const msg = shareMessage(b, computeShares(b), '+7 900 000-00-00', 'Т-Банк');
  assert.match(msg, /Кафе: итого 900 ₽/);
  assert.ok(!msg.includes('Аня —'), 'payer is not asked to pay themselves');
  assert.match(msg, /• Боря — 300 ₽/);
  assert.match(msg, /Переводить: Аня, \+7 900 000-00-00, Т-Банк/);
});

test('normalizes model output', () => {
  const r = normalizeReceipt({
    merchant: '  Ромашка ',
    total: 1500,
    serviceFeePercent: 10,
    items: [
      { name: 'Борщ', quantity: 2, price: 700.004 },
      { name: '  ', quantity: 1, price: 100 },
      { name: 'Скидка', quantity: 1, price: -50 },
      { name: 'Ноль', quantity: 1, price: 0 },
      { name: 'Чай', quantity: 0, price: 120 },
    ],
  });
  assert.equal(r.merchant, 'Ромашка');
  assert.equal(r.tipPercent, 10);
  assert.deepEqual(r.items.map((i) => [i.name, i.price, i.quantity]), [['Борщ', 700, 2], ['Скидка', -50, 1], ['Чай', 120, 1]]);
  assert.equal(normalizeReceipt({ merchant: null, total: null, serviceFeePercent: 99, items: [] }).tipPercent, 0);
});

test('sends a structured-output request to Claude and parses the answer', async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), headers: new Headers(init.headers), body: JSON.parse(init.body) });
    const answer = { merchant: 'Кафе', total: 500, serviceFeePercent: 0, items: [{ name: 'Кофе', quantity: 1, price: 500 }] };
    return new Response(JSON.stringify({
      id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', stop_sequence: null,
      content: [{ type: 'text', text: JSON.stringify(answer) }], usage: { input_tokens: 1, output_tokens: 1 },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const r = await recognizeReceipt('sk-test', 'AAAA');
  assert.equal(r.items[0].name, 'Кофе');
  const [call] = calls;
  assert.match(call.url, /\/v1\/messages/);
  assert.equal(call.headers.get('x-api-key'), 'sk-test');
  assert.match(call.headers.get('anthropic-beta'), /server-side-fallback-2026-07-01/);
  assert.equal(call.body.model, 'claude-opus-5-5');
  assert.equal(call.body.fallbacks, 'default');
  assert.equal(call.body.output_config.format.type, 'json_schema');
  assert.equal(call.body.messages[0].content[0].source.data, 'AAAA');

  globalThis.fetch = async () => new Response(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'bad' } }), { status: 401 });
  await assert.rejects(recognizeReceipt('bad', 'AAAA'), /Неверный API-ключ/);
});
