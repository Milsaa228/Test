// Тесты чистой логики (без React Native): компилируем src/lib в CommonJS и проверяем через node:test.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const out = mkdtempSync(join(tmpdir(), 'split-test-'));
execFileSync('npx', ['tsc', '--outDir', out, '--module', 'commonjs', '--target', 'es2020', '--ignoreConfig', '--types', 'node',
  '--skipLibCheck', '--strict', 'src/lib/split.ts', 'src/lib/receipt.ts', 'src/lib/ai.ts'], { stdio: 'inherit' });
writeFileSync(join(out, 'package.json'), '{"type":"commonjs"}');
const require = createRequire(join(out, 'x.js'));
const { allocate, computeShares, formatRub, shareMessage } = require('./split.js');
const { normalizeReceipt, recognizeReceipt } = require('./receipt.js');
const { extractJson, pickFreeModels, askText, DEFAULT_AI } = require('./ai.js');

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

test('normalizes numbers sent as strings', () => {
  const r = normalizeReceipt({ merchant: 5, total: '1 250,50 ₽', serviceFeePercent: '10', items: [{ name: 'Суп', quantity: '2', price: '450,5' }] });
  assert.equal(r.merchant, undefined);
  assert.equal(r.total, 1250.5);
  assert.equal(r.tipPercent, 10);
  assert.deepEqual(r.items.map((i) => [i.name, i.price, i.quantity]), [['Суп', 450.5, 2]]);
  assert.deepEqual(normalizeReceipt({ items: 'нет' }).items, []);
});

test('extracts JSON from chatty model output', () => {
  assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
  assert.deepEqual(extractJson('Вот ответ:\n```json\n{"a": [1, 2]}\n```\nГотово'), { a: [1, 2] });
  assert.deepEqual(extractJson('<think>хм {"x":0}</think>Результат: {"b": "с } скобкой", "c": {"d": 2}} конец'), { b: 'с } скобкой', c: { d: 2 } });
  assert.throws(() => extractJson('не знаю'), /JSON/);
});

const CATALOG = [
  { id: 'paid/model', pricing: { prompt: '0.000001', completion: '0.000002' }, architecture: { input_modalities: ['text', 'image'] } },
  { id: 'small/text:free', context_length: 8000, pricing: { prompt: '0', completion: '0' }, architecture: { input_modalities: ['text'] } },
  { id: 'big/vision:free', context_length: 128000, pricing: { prompt: '0', completion: '0' }, architecture: { input_modalities: ['text', 'image'] } },
  { id: 'mid/vision:free', context_length: 32000, pricing: { prompt: '0', completion: '0' }, architecture: { input_modalities: ['image', 'text'] } },
  { id: 'openrouter/free', context_length: 1000, pricing: { prompt: '0', completion: '0' }, architecture: { input_modalities: ['text', 'image'] } },
];

test('picks free models, vision-capable when needed', () => {
  assert.deepEqual(pickFreeModels(CATALOG, true), ['openrouter/free', 'big/vision:free', 'mid/vision:free']);
  assert.deepEqual(pickFreeModels(CATALOG, false), ['openrouter/free', 'big/vision:free', 'mid/vision:free', 'small/text:free']);
});

function reply(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

test('recognizes a receipt via OpenRouter, falling back when a free model is busy', async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith('/models')) return reply(200, { data: CATALOG });
    const body = JSON.parse(init.body);
    calls.push({ url: String(url), auth: new Headers(init.headers).get('authorization'), body });
    if (body.model === 'openrouter/free') return reply(429, { error: { message: 'rate limited' } });
    const answer = '```json\n{"merchant":"Кафе","total":500,"serviceFeePercent":0,"items":[{"name":"Кофе","quantity":1,"price":"500"}]}\n```';
    return reply(200, { choices: [{ message: { content: answer } }] });
  };
  const r = await recognizeReceipt({ ...DEFAULT_AI, apiKey: 'sk-or-test' }, 'AAAA');
  assert.equal(r.items[0].name, 'Кофе');
  assert.equal(r.items[0].price, 500);
  assert.deepEqual(calls.map((c) => c.body.model), ['openrouter/free', 'big/vision:free']);
  const [call] = calls;
  assert.equal(call.url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(call.auth, 'Bearer sk-or-test');
  assert.equal(call.body.messages[0].role, 'system');
  assert.equal(call.body.messages[1].content[0].image_url.url, 'data:image/jpeg;base64,AAAA');
});

test('does not retry on a bad key and requires a key', async () => {
  let n = 0;
  globalThis.fetch = async () => (n++, reply(401, { error: { message: 'No auth' } }));
  await assert.rejects(recognizeReceipt({ apiKey: 'bad', baseUrl: 'https://example.com/v1', model: 'x' }, 'AAAA'), /Неверный API-ключ/);
  assert.equal(n, 1);
  await assert.rejects(askText({ ...DEFAULT_AI, apiKey: ' ' }, { system: '', messages: [] }), /ключ/);
  await assert.rejects(askText({ apiKey: 'k', baseUrl: 'https://example.com/v1', model: 'auto' }, { system: '', messages: [] }), /модель вручную/);
});
