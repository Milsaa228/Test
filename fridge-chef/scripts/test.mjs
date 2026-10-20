// Тесты чистой логики (без React Native): компилируем src/lib в CommonJS и проверяем через node:test.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const out = mkdtempSync(join(tmpdir(), 'fridge-test-'));
execFileSync('npx', ['tsc', '--outDir', out, '--module', 'commonjs', '--target', 'es2020', '--ignoreConfig', '--types', 'node',
  '--skipLibCheck', '--strict', 'src/lib/expiry.ts', 'src/lib/inventory.ts', 'src/lib/fridge.ts', 'src/lib/recipes.ts', 'src/lib/ai.ts'], { stdio: 'inherit' });
writeFileSync(join(out, 'package.json'), '{"type":"commonjs"}');
const require = createRequire(join(out, 'x.js'));
const { addDays, dateKey, daysLeft, expiryDigest, expiryLabel, expiryStatus, formatRuDate, parseRuDate, plural, sortByExpiry } = require('./expiry.js');
const { consumeIngredients, consumeOne, convert, formatAmount, mergeProducts, normalizeName } = require('./inventory.js');
const { asCategory, asUnit, normalizeFridge, recognizeFridge, toNumber } = require('./fridge.js');
const { buildRecipeRequest, normalizeRecipes, suggestRecipes } = require('./recipes.js');
const { DEFAULT_AI } = require('./ai.js');

const NOW = new Date(2026, 9, 20, 12, 0); // 20 октября 2026, полдень по местному времени
const product = (name, expiresAt, extra = {}) => ({
  id: name, name, amount: 1, unit: 'шт', category: 'Другое', addedAt: '2026-10-18', expiresAt, ...extra,
});
const SETTINGS = { diet: 'вегетарианская', exclusions: 'орехи', maxMinutes: 30, servings: 2, notifications: false, aiBaseUrl: DEFAULT_AI.baseUrl, aiModel: DEFAULT_AI.model };

test('dates and days left', () => {
  assert.equal(dateKey(NOW), '2026-10-20');
  assert.equal(addDays('2026-10-30', 3), '2026-11-02');
  assert.equal(addDays('2026-03-28', 2), '2026-03-30'); // без сдвига из-за перехода на летнее время
  assert.equal(daysLeft('2026-10-20', NOW), 0);
  assert.equal(daysLeft('2026-10-22', NOW), 2);
  assert.equal(daysLeft('2026-10-18', NOW), -2);
  assert.equal(daysLeft('2026-10-21', new Date(2026, 9, 20, 23, 59)), 1);
});

test('expiry status and labels', () => {
  assert.equal(expiryStatus('2026-10-19', NOW), 'expired');
  assert.equal(expiryStatus('2026-10-20', NOW), 'soon');
  assert.equal(expiryStatus('2026-10-22', NOW), 'soon');
  assert.equal(expiryStatus('2026-10-23', NOW), 'ok');
  assert.equal(expiryLabel('2026-10-21', NOW), 'истекает завтра');
  assert.equal(expiryLabel('2026-10-20', NOW), 'истекает сегодня');
  assert.equal(expiryLabel('2026-10-19', NOW), 'просрочено вчера');
  assert.equal(expiryLabel('2026-10-15', NOW), 'просрочено 5 дней назад');
  assert.equal(expiryLabel('2026-10-23', NOW), 'ещё 3 дня');
  assert.equal(expiryLabel('2026-11-10', NOW), 'ещё 21 день');
  assert.deepEqual([1, 2, 5, 11, 12, 21, 22, 25, 111].map((n) => plural(n, ['день', 'дня', 'дней'])),
    ['день', 'дня', 'дней', 'дней', 'дней', 'день', 'дня', 'дней', 'дней']);
});

test('sorts by expiry then name', () => {
  const list = [product('Сыр', '2026-10-25'), product('Молоко', '2026-10-21'), product('Йогурт', '2026-10-21')];
  assert.deepEqual(sortByExpiry(list).map((p) => p.name), ['Йогурт', 'Молоко', 'Сыр']);
  assert.equal(list[0].name, 'Сыр', 'does not mutate');
});

test('ru date parse/format', () => {
  assert.equal(formatRuDate('2026-10-05'), '05.10.2026');
  assert.equal(parseRuDate('5.10.2026'), '2026-10-05');
  assert.equal(parseRuDate('05.10.26'), '2026-10-05');
  assert.equal(parseRuDate('1.11', NOW), '2026-11-01');
  assert.equal(parseRuDate('31.02.2026'), null);
  assert.equal(parseRuDate('завтра'), null);
});

test('morning digest: tomorrow-expiring products at next 9:00', () => {
  const list = [product('Кефир', '2026-10-21'), product('Сыр', '2026-10-22'), product('Хлеб', '2026-10-20')];
  // в полдень ближайшее утро — завтра, 21-го: истекают 22-го
  const noon = expiryDigest(list, NOW, 9);
  assert.equal(dateKey(noon.fireAt), '2026-10-21');
  assert.equal(noon.fireAt.getHours(), 9);
  assert.deepEqual(noon.names, ['Сыр']);
  // в 7 утра уведомление сегодня в 9: истекают завтра, 21-го
  const early = expiryDigest(list, new Date(2026, 9, 20, 7, 0), 9);
  assert.equal(dateKey(early.fireAt), '2026-10-20');
  assert.deepEqual(early.names, ['Кефир']);
  assert.deepEqual(expiryDigest([], NOW).names, []);
});

test('normalizes names for dedupe', () => {
  assert.equal(normalizeName('  Йогурт «Греческий», 2%  '), 'йогурт греческий 2%');
  assert.equal(normalizeName('Свёкла'), normalizeName('свекла'));
});

test('unit conversion and formatting', () => {
  assert.equal(convert(0.5, 'кг', 'г'), 500);
  assert.equal(convert(250, 'мл', 'л'), 0.25);
  assert.equal(convert(2, 'шт', 'г'), null);
  assert.equal(formatAmount(1.5, 'л'), '1,5 л');
});

test('merges recognized products into inventory without duplicates', () => {
  const existing = [product('Молоко', '2026-10-22', { amount: 1, unit: 'л' }), product('Яйца', '2026-11-01', { amount: 10 })];
  const incoming = [
    product('молоко', '2026-10-27', { id: 'n1', amount: 500, unit: 'мл' }),
    product('Помидоры', '2026-10-25', { id: 'n2', amount: 3 }),
    product('помидоры ', '2026-10-24', { id: 'n3', amount: 2 }), // те же помидоры на втором фото другой полки
    product('  ', '2026-10-24', { id: 'n4' }),
  ];
  const { merged, added, updated } = mergeProducts(existing, incoming);
  assert.equal(added, 1);
  assert.equal(updated, 1);
  assert.equal(merged.length, 3);
  const milk = merged.find((p) => p.id === 'Молоко');
  assert.deepEqual([milk.name, milk.amount, milk.unit, milk.expiresAt], ['Молоко', 500, 'мл', '2026-10-22'], 'keeps known expiry, updates amount');
  const tomatoes = merged.find((p) => normalizeName(p.name) === 'помидоры');
  assert.deepEqual([tomatoes.amount, tomatoes.expiresAt, tomatoes.name], [5, '2026-10-24', 'Помидоры']);
  // повторное добавление того же не создаёт дублей
  assert.equal(mergeProducts(merged, incoming).merged.length, 3);
});

test('mark used: pieces decrement, rest removed', () => {
  const list = [product('Яйца', '2026-10-30', { amount: 3 }), product('Молоко', '2026-10-22', { amount: 1, unit: 'л' })];
  assert.equal(consumeOne(list, 'Яйца')[0].amount, 2);
  assert.deepEqual(consumeOne(list, 'Молоко').map((p) => p.name), ['Яйца']);
  assert.deepEqual(consumeOne([product('Лимон', '2026-10-30')], 'Лимон'), []);
});

test('cooking consumes recipe ingredients', () => {
  const list = [
    product('Молоко', '2026-10-22', { amount: 1, unit: 'л' }),
    product('Яйца', '2026-10-30', { amount: 3 }),
    product('Сыр', '2026-10-29', { amount: 200, unit: 'г' }),
    product('Соль', '2027-10-29', { amount: 1, unit: 'уп' }),
    product('Хлеб', '2026-10-21', { amount: 1 }),
  ];
  const res = consumeIngredients(list, [
    { name: 'молоко', amount: 300, unit: 'мл' },
    { name: 'Яйца', amount: 3, unit: 'шт' },
    { name: 'Сыр', amount: 2, unit: 'шт' }, // несовместимые единицы — считаем, что ушёл весь
    { name: 'Соль', amount: null, unit: 'г' },
  ]);
  assert.deepEqual(res.products.map((p) => [p.name, p.amount]), [['Молоко', 0.7], ['Соль', 1], ['Хлеб', 1]]);
  assert.deepEqual(res.removed, ['Яйца', 'Сыр']);
  assert.deepEqual(res.decreased, ['Молоко']);
});

test('normalizes fridge recognition', () => {
  const items = normalizeFridge({
    products: [
      { name: 'молоко', amount: 930, unit: 'мл', category: 'Молочное', shelfLifeDays: 4 },
      { name: 'кетчуп', amount: 0, unit: 'бутылка', category: 'Соусы', shelfLifeDays: 9999 },
      { name: 'зелень', amount: 1, unit: 'уп', category: 'Зелень', shelfLifeDays: -3 },
      { name: '   ', amount: 1, unit: 'шт', category: 'Другое', shelfLifeDays: 3 },
    ],
  }, NOW);
  assert.equal(items.length, 3);
  assert.deepEqual([items[0].name, items[0].amount, items[0].unit, items[0].category, items[0].addedAt, items[0].expiresAt],
    ['Молоко', 930, 'мл', 'Молочное', '2026-10-20', '2026-10-24']);
  assert.deepEqual([items[1].amount, items[1].unit, items[1].category, items[1].expiresAt], [1, 'шт', 'Другое', '2027-10-20']);
  assert.equal(items[2].expiresAt, '2026-10-20');
  assert.notEqual(items[0].id, items[1].id);
  assert.deepEqual(normalizeFridge({ products: [] }, NOW), []);
  assert.deepEqual(normalizeFridge(null, NOW), []);
});

test('recipe request lists products by expiry and preferences', () => {
  const text = buildRecipeRequest([product('Сыр', '2026-10-28'), product('Кефир', '2026-10-21', { amount: 0.5, unit: 'л' })], SETTINGS, NOW);
  const lines = text.split('\n');
  assert.equal(lines[1], '- Кефир: 0,5 л, осталось дней: 1 — СКОРО ИСПОРТИТСЯ');
  assert.equal(lines[2], '- Сыр: 1 шт, осталось дней: 8');
  assert.match(text, /Диета: вегетарианская/);
  assert.match(text, /Исключить .*: орехи/);
  assert.match(text, /не больше 30 минут/);
  const loose = buildRecipeRequest([], { ...SETTINGS, maxMinutes: 0, exclusions: ' ' }, NOW);
  assert.match(loose, /Исключений нет/);
  assert.match(loose, /не ограничено/);
});

test('normalizes recipes against inventory', () => {
  const inventory = [product('Кефир', '2026-10-21', { amount: 1, unit: 'л' }), product('Яйца', '2026-10-30', { amount: 6 })];
  const recipes = normalizeRecipes({
    recipes: [
      {
        title: ' Оладьи на кефире ', description: 'Быстро', minutes: 25, difficulty: 'легко', servings: 2,
        uses: [
          { name: 'кефир', amount: 500, unit: 'мл' },
          { name: 'Яйца', amount: 2, unit: 'шт' },
          { name: 'Яйца', amount: 1, unit: 'шт' },
          { name: 'Мука', amount: 300, unit: 'г' },
        ],
        missing: ['Сахар', ''],
        steps: ['Смешать', '  ', 'Жарить'],
      },
      { title: 'Без шагов', description: '', minutes: 10, difficulty: 'легко', servings: 1, uses: [], missing: [], steps: [] },
      { title: 'Омлет', description: '', minutes: -5, difficulty: 'экстрим', servings: 0, uses: [{ name: 'Яйца', amount: null, unit: 'шт' }], missing: [], steps: ['Взбить'] },
    ],
  }, inventory, NOW);
  assert.equal(recipes.length, 2);
  const [a, b] = recipes;
  assert.equal(a.title, 'Оладьи на кефире');
  assert.deepEqual(a.uses, [{ name: 'Кефир', amount: 500, unit: 'мл' }, { name: 'Яйца', amount: 2, unit: 'шт' }]);
  assert.deepEqual(a.missing, ['Сахар', 'Мука']);
  assert.deepEqual(a.steps, ['Смешать', 'Жарить']);
  assert.deepEqual([b.minutes, b.difficulty, b.servings, b.uses[0].amount], [30, 'средне', 2, null]);
  assert.equal(normalizeRecipes({ recipes: Array(8).fill({ ...a, uses: [], missing: [] }) }, inventory).length, 5);
  assert.deepEqual(normalizeRecipes(undefined, inventory), []);
});

test('tolerant number, unit and category parsing', () => {
  assert.equal(toNumber(5), 5);
  assert.equal(toNumber('1 250,5'), 1250.5);
  assert.equal(toNumber('около 3 шт'), 3);
  assert.equal(toNumber('2-3'), 2);
  assert.ok(Number.isNaN(toNumber('по вкусу')));
  assert.ok(Number.isNaN(toNumber(null)));
  assert.ok(Number.isNaN(toNumber({ value: 1 })));
  assert.deepEqual(['Г.', 'грамм', 'ml', 'Литров', 'упаковка', 'kg', 7, 'ведро'].map(asUnit), ['г', 'г', 'мл', 'л', 'уп', 'кг', 'шт', 'шт']);
  assert.deepEqual([' овощи ', 'МОЛОЧНОЕ', 'Еда', 42].map(asCategory), ['Овощи', 'Молочное', 'Другое', 'Другое']);
});

test('fridge normalization survives sloppy free-model output', () => {
  const items = normalizeFridge({
    products: [
      { name: 'сыр', amount: '200 г', unit: 'гр', category: 'молочное', shelfLifeDays: '10', brand: 'лишнее поле' },
      { name: 'яйца', quantity: 6, unit: 'шт.', category: null, days: 14 },
      'огурцы',
      { name: 123, amount: 'много', unit: ['шт'], category: {}, shelfLifeDays: 'неделя' },
      { title: 'кефир' },
      null,
      42,
      { name: { ru: 'нет' } },
    ],
    comment: 'Вот что я нашёл',
  }, NOW);
  assert.deepEqual(items.map((p) => [p.name, p.amount, p.unit, p.category, p.expiresAt]), [
    ['Сыр', 200, 'г', 'Молочное', '2026-10-30'],
    ['Яйца', 6, 'шт', 'Другое', '2026-11-03'],
    ['Огурцы', 1, 'шт', 'Другое', '2026-10-27'],
    ['123', 1, 'шт', 'Другое', '2026-10-27'],
    ['Кефир', 1, 'шт', 'Другое', '2026-10-27'],
  ]);
  // Другие формы корня: голый массив, другой ключ, вложенность, мусор.
  assert.equal(normalizeFridge([{ name: 'хлеб' }], NOW)[0].name, 'Хлеб');
  assert.equal(normalizeFridge({ items: ['масло'] }, NOW)[0].name, 'Масло');
  assert.equal(normalizeFridge({ result: { products: ['соль'] } }, NOW)[0].name, 'Соль');
  for (const junk of [undefined, 'текст', 5, { products: 'молоко' }, { products: {} }, []]) assert.ok(Array.isArray(normalizeFridge(junk, NOW)));
});

test('recipe normalization survives sloppy free-model output', () => {
  const inventory = [product('Кефир', '2026-10-21', { amount: 1, unit: 'л' }), product('Яйца', '2026-10-30', { amount: 6 })];
  const recipes = normalizeRecipes([
    {
      name: 'Омлет', minutes: '15 минут', difficulty: 'Легко', servings: '2 порции', extra: true,
      ingredients: ['Яйца', { name: 'кефир', amount: 'по вкусу', unit: 'стакан' }, { name: 'Молоко', amount: '100' }],
      missing: 'Зелёный лук, сыр',
      steps: '1. Взбить яйца\n2) Жарить',
    },
    { title: 'Шаги объектами', uses: { amount: 3 }, missing: [{ name: 'Мука' }, 5, null], steps: [{ text: 'Шаг 1. Смешать' }, null, 7] },
    { title: 'Без шагов', steps: false },
    { title: '   ', steps: ['x'] },
    'просто строка',
    null,
  ], inventory, NOW);
  assert.equal(recipes.length, 2);
  const [a, b] = recipes;
  assert.deepEqual([a.title, a.description, a.minutes, a.difficulty, a.servings], ['Омлет', '', 15, 'легко', 2]);
  assert.deepEqual(a.uses, [{ name: 'Яйца', amount: null, unit: 'шт' }, { name: 'Кефир', amount: null, unit: 'шт' }]);
  assert.deepEqual(a.missing, ['Зелёный лук', 'сыр', 'Молоко']);
  assert.deepEqual(a.steps, ['Взбить яйца', 'Жарить']);
  assert.deepEqual([b.uses, b.missing, b.steps, b.minutes, b.servings], [[], ['Мука', '5'], ['Смешать', '7'], 30, 2]);
  for (const junk of [undefined, null, 'текст', { recipes: 'нет' }, { recipes: [{}] }]) assert.deepEqual(normalizeRecipes(junk, inventory), []);
});

function reply(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const CATALOG = [
  { id: 'openrouter/free', pricing: { prompt: '0', completion: '0' }, architecture: { input_modalities: ['text', 'image'] } },
  { id: 'big/vision:free', context_length: 128000, pricing: { prompt: '0', completion: '0' }, architecture: { input_modalities: ['text', 'image'] } },
  { id: 'small/text:free', context_length: 32000, pricing: { prompt: '0', completion: '0' }, architecture: { input_modalities: ['text'] } },
  { id: 'paid/vision', context_length: 200000, pricing: { prompt: '0.000003', completion: '0.000015' }, architecture: { input_modalities: ['text', 'image'] } },
];

test('recognizes fridge photos via OpenRouter free vision models with fallback', async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith('/models')) return reply(200, { data: CATALOG });
    const body = JSON.parse(init.body);
    calls.push({ url: String(url), auth: new Headers(init.headers).get('authorization'), body });
    if (body.model === 'openrouter/free') return reply(429, { error: { message: 'rate limited' } });
    const answer = 'Вот продукты:\n```json\n{"products":[{"name":"молоко","amount":"1 л","unit":"л","category":"Молочное","shelfLifeDays":"5"},'
      + '{"name":"помидоры","amount":3,"unit":"шт","category":"Овощи"}]}\n```';
    return reply(200, { choices: [{ message: { content: answer } }] });
  };
  const products = await recognizeFridge({ ...DEFAULT_AI, apiKey: 'sk-or-test' }, ['AAAA', 'BBBB', 'CCCC', 'DDDD']);
  assert.deepEqual(products.map((p) => [p.name, p.amount, p.unit, p.category]), [['Молоко', 1, 'л', 'Молочное'], ['Помидоры', 3, 'шт', 'Овощи']]);
  assert.equal(products[0].expiresAt, addDays(dateKey(new Date()), 5));
  assert.equal(products[1].expiresAt, addDays(dateKey(new Date()), 7));
  // Платная и текстовая модели не используются; после 429 — следующая бесплатная модель с поддержкой фото.
  assert.deepEqual(calls.map((c) => c.body.model), ['openrouter/free', 'big/vision:free']);
  const [call] = calls;
  assert.equal(call.url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(call.auth, 'Bearer sk-or-test');
  assert.equal(call.body.messages[0].role, 'system');
  assert.match(call.body.messages[0].content, /"shelfLifeDays"/);
  const content = call.body.messages[1].content;
  assert.equal(content.filter((p) => p.type === 'image_url').length, 3);
  assert.equal(content[0].image_url.url, 'data:image/jpeg;base64,AAAA');
  assert.equal(content.at(-1).type, 'text');
});

test('recipes use a custom OpenAI-compatible API without images', async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return reply(200, { choices: [{ message: { content: '{"recipes":[{"title":"Сырники","minutes":"20","steps":["Смешать","Жарить"],"uses":[{"name":"Творог","amount":"300"}]}]}' } }] });
  };
  const inventory = [product('Творог', '2026-10-21', { amount: 400, unit: 'г' })];
  const recipes = await suggestRecipes({ apiKey: 'k', baseUrl: 'http://localhost:11434/v1/', model: 'llama3' }, inventory, SETTINGS);
  assert.deepEqual([recipes[0].title, recipes[0].minutes, recipes[0].uses[0].amount], ['Сырники', 20, 300]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://localhost:11434/v1/chat/completions');
  assert.equal(calls[0].body.model, 'llama3');
  assert.equal(typeof calls[0].body.messages[1].content[0].text, 'string');
  assert.ok(!calls[0].body.messages[1].content.some((p) => p.type === 'image_url'));
});
