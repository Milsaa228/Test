// Тесты чистой логики (без React Native): компилируем src/lib в CommonJS и проверяем через node:test.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const out = mkdtempSync(join(tmpdir(), 'geo-notes-test-'));
execFileSync('npx', ['tsc', '--outDir', out, '--module', 'commonjs', '--target', 'es2020', '--ignoreConfig', '--types', 'node',
  '--skipLibCheck', '--strict', 'src/lib/geo.ts', 'src/lib/share.ts', 'src/lib/mapHtml.ts', 'src/lib/types.ts'], { stdio: 'inherit' });
writeFileSync(join(out, 'package.json'), '{"type":"commonjs"}');
const require = createRequire(join(out, 'x.js'));
const {
  distanceMeters, formatDistance, nearbyTriggers, applyGeofenceEvent, canFire, isSpent, pickGeofenceRegions, sortByDistance,
  exitMargin, isValidLatLng, MAX_ACCURACY_M,
} = require('./geo.js');
const {
  utf8Encode, utf8Decode, base64UrlEncode, base64UrlDecode, encodeNotes, decodeNotes, buildImportLink, extractData, mergeNotes,
  yandexMapsUrl, geoUri, shareText,
} = require('./share.js');
const { buildMapHtml, commandScript, jsonForScript, parseMapEvent, LEAFLET_JS, LEAFLET_CSS } = require('./mapHtml.js');

// Красная площадь и окрестности. 1° широты ≈ 111 195 м.
const BASE = { latitude: 55.7539, longitude: 37.6208 };
const M_PER_DEG = 111194.9;
/** Точка в `m` метрах к северу от BASE. */
const north = (m, from = BASE) => ({ latitude: from.latitude + m / M_PER_DEG, longitude: from.longitude });

const note = (id, over = {}) => ({
  id, text: `заметка ${id}`, emoji: '📍', ...BASE, radius: 100, repeat: 'always', createdAt: '2026-10-01T10:00:00.000Z', ...over,
});

const MIN = 60_000;
const COOLDOWN = 60 * MIN;
const T0 = Date.UTC(2026, 9, 20, 12, 0, 0);

test('haversine distance', () => {
  assert.equal(distanceMeters(BASE, BASE), 0);
  assert.ok(Math.abs(distanceMeters(BASE, north(100)) - 100) < 0.5);
  // Москва — Санкт-Петербург ≈ 634 км
  const spb = { latitude: 59.9386, longitude: 30.3141 };
  const d = distanceMeters({ latitude: 55.7558, longitude: 37.6173 }, spb);
  assert.ok(Math.abs(d - 634_000) < 5_000, `got ${d}`);
  // симметрия и антиподы
  assert.equal(Math.round(distanceMeters(BASE, spb)), Math.round(distanceMeters(spb, BASE)));
  assert.ok(Math.abs(distanceMeters({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 180 }) - Math.PI * 6371008.8) < 1);
  // через 180-й меридиан
  assert.ok(distanceMeters({ latitude: 0, longitude: 179.9999 }, { latitude: 0, longitude: -179.9999 }) < 30);
});

test('formatDistance', () => {
  assert.equal(formatDistance(3), '≈ 10 м');
  assert.equal(formatDistance(118), '≈ 120 м');
  assert.equal(formatDistance(994), '≈ 990 м');
  assert.equal(formatDistance(1234), '≈ 1,2 км');
  assert.equal(formatDistance(9960), '≈ 10,0 км');
  assert.equal(formatDistance(15400), '≈ 15 км');
});

test('sortByDistance keeps order without position', () => {
  const a = note('a', north(500));
  const b = note('b', north(50));
  assert.deepEqual(sortByDistance([a, b], BASE).map((r) => r.item.id), ['b', 'a']);
  assert.deepEqual(sortByDistance([a, b], null).map((r) => [r.item.id, r.distance]), [['a', null], ['b', null]]);
});

test('fires when entering radius, not while staying inside', () => {
  const notes = [note('a')];
  let r = nearbyTriggers(notes, north(300), {}, T0, COOLDOWN);
  assert.equal(r.fired.length, 0);
  assert.deepEqual(r.state, { a: { inside: false } });

  r = nearbyTriggers(notes, north(60), r.state, T0 + MIN, COOLDOWN);
  assert.equal(r.fired.length, 1);
  assert.equal(r.fired[0].note.id, 'a');
  assert.ok(Math.abs(r.fired[0].distance - 60) < 1);
  assert.deepEqual(r.state.a, { inside: true, lastFiredAt: T0 + MIN });

  // остаёмся внутри — тишина, даже когда пауза прошла
  r = nearbyTriggers(notes, north(10), r.state, T0 + 5 * COOLDOWN, COOLDOWN);
  assert.equal(r.fired.length, 0);
  assert.equal(r.state.a.lastFiredAt, T0 + MIN);
});

test('first position already inside counts as entering', () => {
  const r = nearbyTriggers([note('a')], BASE, {}, T0, COOLDOWN);
  assert.equal(r.fired.length, 1);
});

test('cooldown blocks re-entry, then allows after it passes', () => {
  const notes = [note('a')];
  let r = nearbyTriggers(notes, BASE, {}, T0, COOLDOWN);
  r = nearbyTriggers(notes, north(500), r.state, T0 + MIN, COOLDOWN); // вышли
  assert.equal(r.state.a.inside, false);
  r = nearbyTriggers(notes, BASE, r.state, T0 + 30 * MIN, COOLDOWN); // вернулись через 30 мин
  assert.equal(r.fired.length, 0, 'cooldown not passed');
  assert.equal(r.state.a.inside, true, 'still marked inside so it does not fire while staying');
  assert.equal(r.state.a.lastFiredAt, T0);
  r = nearbyTriggers(notes, north(500), r.state, T0 + 50 * MIN, COOLDOWN);
  r = nearbyTriggers(notes, BASE, r.state, T0 + COOLDOWN, COOLDOWN); // ровно через паузу
  assert.equal(r.fired.length, 1);
  assert.equal(r.state.a.lastFiredAt, T0 + COOLDOWN);
});

test('"once" notes fire a single time ever', () => {
  const notes = [note('a', { repeat: 'once' })];
  let r = nearbyTriggers(notes, BASE, {}, T0, COOLDOWN);
  assert.equal(r.fired.length, 1);
  assert.equal(isSpent(notes[0], r.state), true);
  r = nearbyTriggers(notes, north(1000), r.state, T0 + MIN, COOLDOWN);
  r = nearbyTriggers(notes, BASE, r.state, T0 + 100 * COOLDOWN, COOLDOWN);
  assert.equal(r.fired.length, 0);
  assert.equal(canFire(notes[0], r.state.a, T0 + 1e12, 0), false);
  assert.equal(isSpent(notes[0], {}), false);
  assert.equal(isSpent(note('b'), { b: { inside: false, lastFiredAt: T0 } }), false, '"always" is never spent');
});

test('hysteresis: GPS jitter at the edge does not re-fire', () => {
  const notes = [note('a', { radius: 100 })];
  assert.equal(exitMargin(100), 20);
  assert.equal(exitMargin(300), 60);
  let r = nearbyTriggers(notes, north(95), {}, T0, 0);
  assert.equal(r.fired.length, 1);
  // дрожим между 95 и 115 м с нулевой паузой — всё ещё «внутри»
  for (let i = 1; i <= 6; i++) {
    r = nearbyTriggers(notes, north(i % 2 ? 115 : 95), r.state, T0 + i * MIN, 0);
    assert.equal(r.fired.length, 0, `jitter step ${i}`);
    assert.equal(r.state.a.inside, true);
  }
  r = nearbyTriggers(notes, north(125), r.state, T0 + 10 * MIN, 0); // за пределами radius + 20
  assert.equal(r.state.a.inside, false);
  // а вход снаружи требует попасть именно в radius
  r = nearbyTriggers(notes, north(110), r.state, T0 + 11 * MIN, 0);
  assert.equal(r.fired.length, 0);
  assert.equal(r.state.a.inside, false);
  r = nearbyTriggers(notes, north(99), r.state, T0 + 12 * MIN, 0);
  assert.equal(r.fired.length, 1);
});

test('multiple notes: each with its own radius, fired sorted by distance', () => {
  const notes = [
    note('far', { ...north(250), radius: 300 }),
    note('near', { ...north(30), radius: 50 }),
    note('out', { ...north(200), radius: 50 }),
  ];
  const r = nearbyTriggers(notes, BASE, {}, T0, COOLDOWN);
  assert.deepEqual(r.fired.map((f) => f.note.id), ['near', 'far']);
  assert.deepEqual(Object.keys(r.state).sort(), ['far', 'near', 'out']);
  assert.equal(r.state.out.inside, false);
});

test('inaccurate positions are ignored; state of deleted notes dropped', () => {
  const state = { a: { inside: false }, gone: { inside: true, lastFiredAt: T0 } };
  const bad = nearbyTriggers([note('a')], { ...BASE, accuracy: MAX_ACCURACY_M + 1 }, state, T0, COOLDOWN);
  assert.equal(bad.fired.length, 0);
  assert.equal(bad.state, state, 'state untouched');
  const ok = nearbyTriggers([note('a')], { ...BASE, accuracy: 30 }, state, T0, COOLDOWN);
  assert.equal(ok.fired.length, 1);
  assert.equal(ok.state.gone, undefined);
  // null-точность (web) не мешает
  assert.equal(nearbyTriggers([note('a')], { ...BASE, accuracy: null }, {}, T0, COOLDOWN).fired.length, 1);
});

test('input state is not mutated', () => {
  const state = Object.freeze({ a: Object.freeze({ inside: false }) });
  const r = nearbyTriggers([note('a')], BASE, state, T0, COOLDOWN);
  assert.equal(r.fired.length, 1);
  assert.deepEqual(state, { a: { inside: false } });
});

test('no notes — nothing fires', () => {
  assert.deepEqual(nearbyTriggers([], BASE, {}, T0, COOLDOWN), { fired: [], state: {} });
});

test('background geofence events follow the same rules', () => {
  const n = note('a');
  let r = applyGeofenceEvent(n, 'enter', {}, T0, COOLDOWN);
  assert.equal(r.fire, true);
  assert.deepEqual(r.state.a, { inside: true, lastFiredAt: T0 });
  // повторный enter без exit (ОС прислала дважды)
  assert.equal(applyGeofenceEvent(n, 'enter', r.state, T0 + 2 * COOLDOWN, COOLDOWN).fire, false);
  r = applyGeofenceEvent(n, 'exit', r.state, T0 + MIN, COOLDOWN);
  assert.deepEqual(r.state.a, { inside: false, lastFiredAt: T0 });
  r = applyGeofenceEvent(n, 'enter', r.state, T0 + 2 * MIN, COOLDOWN);
  assert.equal(r.fire, false, 'cooldown');
  assert.equal(r.state.a.inside, true);
  r = applyGeofenceEvent(n, 'exit', r.state, T0 + 3 * MIN, COOLDOWN);
  assert.equal(applyGeofenceEvent(n, 'enter', r.state, T0 + COOLDOWN, COOLDOWN).fire, true);
  const once = note('o', { repeat: 'once' });
  const s = applyGeofenceEvent(once, 'enter', {}, T0, COOLDOWN).state;
  const s2 = applyGeofenceEvent(once, 'exit', s, T0 + 1, COOLDOWN).state;
  assert.equal(applyGeofenceEvent(once, 'enter', s2, T0 + 1e9, COOLDOWN).fire, false);
});

test('geofence regions: nearest active notes, max 20', () => {
  const notes = Array.from({ length: 30 }, (_, i) => note(`n${i}`, north((30 - i) * 100)));
  const state = { n29: { inside: false, lastFiredAt: T0 } }; // «всегда» — остаётся
  notes.push(note('spent', { repeat: 'once' }));
  state.spent = { inside: true, lastFiredAt: T0 };
  const regions = pickGeofenceRegions(notes, state, BASE);
  assert.equal(regions.length, 20);
  assert.equal(regions[0].identifier, 'n29');
  assert.ok(!regions.some((r) => r.identifier === 'spent'));
  assert.deepEqual(Object.keys(regions[0]).sort(), ['identifier', 'latitude', 'longitude', 'notifyOnEnter', 'notifyOnExit', 'radius']);
  assert.equal(pickGeofenceRegions(notes, state, null, 5).length, 5);
});

test('lat/lng validation', () => {
  assert.equal(isValidLatLng(BASE), true);
  assert.equal(isValidLatLng({ latitude: 91, longitude: 0 }), false);
  assert.equal(isValidLatLng({ latitude: NaN, longitude: 0 }), false);
  assert.equal(isValidLatLng(null), false);
});

test('utf-8 and base64url round trip', () => {
  const s = 'тут лучшая шаурма 🌯 — код 1234 ❤️ "кавычки" & ?=/';
  assert.deepEqual(utf8Encode(s), [...Buffer.from(s, 'utf8')]);
  assert.equal(utf8Decode(utf8Encode(s)), s);
  for (let len = 0; len < 7; len++) {
    const bytes = Array.from({ length: len }, (_, i) => (i * 97 + 200) & 255);
    const enc = base64UrlEncode(bytes);
    assert.equal(enc, Buffer.from(bytes).toString('base64url'));
    assert.deepEqual(base64UrlDecode(enc), bytes);
    assert.deepEqual(base64UrlDecode(Buffer.from(bytes).toString('base64')), bytes, 'standard base64 accepted');
  }
  assert.throws(() => utf8Decode([0xd0]), /Повреждённые/);
});

test('share link round trip', () => {
  const notes = [
    note('a', { text: 'код домофона 1234', emoji: '🔑', latitude: 55.75391234567, repeat: 'once' }),
    note('b', { text: 'купить молоко в этом магазине', emoji: '🛒', radius: 300 }),
  ];
  const link = buildImportLink(notes);
  assert.match(link, /^geonotes:\/\/import\?data=[A-Za-z0-9_-]+$/);
  const back = decodeNotes(link);
  assert.equal(back.length, 2);
  assert.deepEqual(back[0], { ...notes[0], latitude: 55.753912 });
  assert.deepEqual(back[1], notes[1]);
  // голый код, ссылка Expo Go, ссылка в тексте сообщения
  assert.equal(decodeNotes(encodeNotes(notes)).length, 2);
  assert.equal(decodeNotes(`exp://192.168.1.5:8081/--/import?data=${encodeNotes(notes)}`).length, 2);
  assert.equal(extractData(`Смотри!\n${link}\n`), encodeNotes(notes));
  assert.equal(extractData(`geonotes://import?x=1&data=${encodeNotes(notes)}`), encodeNotes(notes));
});

test('decodeNotes rejects garbage with Russian messages', () => {
  assert.throws(() => decodeNotes(''), /пустая/);
  assert.throws(() => decodeNotes('geonotes://import?data=!!!'), /недопустимые/);
  assert.throws(() => decodeNotes('abcd'), /обрезана/);
  const enc = (obj) => base64UrlEncode(utf8Encode(JSON.stringify(obj)));
  assert.throws(() => decodeNotes(enc({ v: 2, n: [] })), /формат/);
  assert.throws(() => decodeNotes(enc({ v: 1, n: [{ i: 'x', t: 'y', a: 200, o: 0 }] })), /нет заметок/);
  // мусорные поля чинятся, плохие записи пропускаются
  const [n] = decodeNotes(enc({ v: 1, n: [{ i: 'x', t: 'y', a: 55, o: 37, r: -5 }, { i: 1 }, null] }));
  assert.deepEqual(n, { id: 'x', text: 'y', emoji: '📍', latitude: 55, longitude: 37, radius: 100, repeat: 'always', createdAt: new Date(0).toISOString() });
  // обрезанная ссылка
  const link = buildImportLink([note('a')]);
  assert.throws(() => decodeNotes(link.slice(0, -10)), /обрезана/);
});

test('merge dedupes by id, local version wins', () => {
  const mine = [note('a', { text: 'моя' }), note('b')];
  const incoming = [note('a', { text: 'чужая' }), note('c'), note('c')];
  const { merged, added, skipped } = mergeNotes(mine, incoming);
  assert.deepEqual(merged.map((n) => n.id), ['a', 'b', 'c']);
  assert.equal(merged[0].text, 'моя');
  assert.equal(added.length, 1);
  assert.equal(skipped, 2);
});

test('map links and share text', () => {
  assert.equal(yandexMapsUrl(BASE), 'https://yandex.ru/maps/?pt=37.6208,55.7539&z=17&l=map');
  assert.equal(geoUri(BASE, 'шаурма'), 'geo:55.7539,37.6208?q=55.7539,37.6208(%D1%88%D0%B0%D1%83%D1%80%D0%BC%D0%B0)');
  const text = shareText([note('a', { text: 'тут лучшая шаурма', emoji: '🌯' })]);
  assert.match(text, /^🌯 тут лучшая шаурма\nhttps:\/\/yandex\.ru\/maps/);
  assert.match(text, /geonotes:\/\/import\?data=/);
  assert.equal(decodeNotes(text).length, 1, 'whole shared message can be pasted into import');
  assert.match(shareText([note('a'), note('b')]), /^Гео-заметки \(2\):/);
});

// Страница карты выполняется в песочнице с заглушками Leaflet и DOM: проверяем протокол и что текст не попадает в HTML.
function runMapPage(init) {
  const html = buildMapHtml(init);
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const sent = [];
  const el = () => ({ style: {}, children: [], className: '', textContent: '', setAttribute() {}, appendChild(c) { this.children.push(c); } });
  const layer = () => ({ layers: [], handlers: {}, addTo(g) { if (g && g.layers) g.layers.push(this); return this; }, clearLayers() { this.layers = []; },
    on(ev, fn) { this.handlers[ev] = fn; return this; }, bindPopup(c) { this.popup = c; return this; } });
  const mapObj = { handlers: {}, views: [], setView() { return this; }, on(ev, fn) { this.handlers[ev] = fn; }, flyTo(at, z) { this.views.push([at, z]); },
    getZoom: () => 12, attributionControl: { setPrefix() {} } };
  const L = {
    map: () => mapObj, tileLayer: () => layer(), layerGroup: () => layer(),
    circle: (at, o) => Object.assign(layer(), { kind: 'circle', at, o }),
    circleMarker: (at, o) => Object.assign(layer(), { kind: 'dot', at, o }),
    marker: (at, o) => Object.assign(layer(), { kind: 'marker', at, o }),
    divIcon: (o) => o,
    Control: { extend: (proto) => function () { return { addTo(m) { proto.onAdd(m); return this; } }; } },
    DomUtil: { create: el }, DomEvent: { disableClickPropagation() {}, on() {} },
  };
  const window = { L, ReactNativeWebView: { postMessage: (m) => sent.push(JSON.parse(m)) } };
  const document = { createElement: el, getElementById: () => el() };
  const ctx = vm.createContext({ window, document, L, Date, Math, String, Array, JSON, isFinite });
  for (const code of scripts) vm.runInContext(code, ctx);
  return { html, sent, map: mapObj, update: (cmd) => vm.runInContext(commandScript(cmd), ctx), window };
}

test('map page: leaflet pinned with SRI, OSM attribution', () => {
  const { html } = runMapPage({ center: BASE, zoom: 15, colors: { zone: 'z', zoneStroke: 's', text: 't', danger: 'd', muted: 'm' } });
  assert.match(LEAFLET_JS.src, /leaflet@1\.9\.4\/dist\/leaflet\.js$/);
  assert.ok(html.includes(`integrity="${LEAFLET_JS.integrity}"`) && html.includes(`integrity="${LEAFLET_CSS.integrity}"`));
  assert.ok(html.includes('https://tile.openstreetmap.org/{z}/{x}/{y}.png'));
  assert.ok(html.includes('OpenStreetMap'));
});

test('map page: protocol and safe note text', () => {
  const page = runMapPage({ center: BASE, zoom: 15, colors: { zone: 'z', zoneStroke: 's', text: 't', danger: 'd', muted: 'm' } });
  assert.deepEqual(page.sent, [{ type: 'ready' }]);
  const evil = '</script><img src=x onerror=alert(1)>\u2028\u2029';
  page.update({ type: 'options', pickerMode: false, canPick: true, canOpen: false });
  page.update({ type: 'notes', notes: [{ id: 'n1', latitude: 55.75, longitude: 37.62, radius: 100, emoji: '🍔', text: evil }] });
  const html = buildMapHtml({ center: BASE, zoom: 15, colors: { zone: 'z', zoneStroke: 's', text: 't', danger: 'd', muted: 'm' } });
  assert.ok(!html.includes('innerHTML'));
  assert.ok(!commandScript({ type: 'notes', notes: [{ id: 'x', latitude: 0, longitude: 0, radius: 1, emoji: '', text: evil }] }).includes('</script>'));
  assert.equal(JSON.parse(jsonForScript(evil)), evil);

  page.update({ type: 'options', pickerMode: false, canPick: true, canOpen: true });
  page.map.handlers.contextmenu({ latlng: { wrap: () => ({ lat: 55.7, lng: 37.6 }) } });
  page.map.handlers.contextmenu({ latlng: { wrap: () => ({ lat: 55.7, lng: 37.6 }) } }); // повтор долгого нажатия гасится
  page.map.handlers.click({ latlng: { wrap: () => ({ lat: 1, lng: 2 }) } }); // не режим выбора — касание не выбирает
  assert.deepEqual(page.sent.slice(1), [{ type: 'pick', point: { latitude: 55.7, longitude: 37.6 } }]);
  page.update({ type: 'view', center: BASE, zoom: 17 });
  assert.equal(JSON.stringify(page.map.views), JSON.stringify([[[BASE.latitude, BASE.longitude], 17]]));
});

test('map page: markers use text nodes, open note on tap', () => {
  const page = runMapPage({ center: BASE, zoom: 15, colors: { zone: 'z', zoneStroke: 's', text: 't', danger: 'd', muted: 'm' } });
  const markers = [];
  const origMarker = page.window.L.marker;
  page.window.L.marker = (at, o) => { const m = origMarker(at, o); markers.push(m); return m; };
  page.update({ type: 'options', pickerMode: false, canPick: false, canOpen: false });
  page.update({ type: 'notes', notes: [{ id: 'n1', latitude: 55.75, longitude: 37.62, radius: 100, emoji: '<b>', text: '<img src=x onerror=alert(1)>' }] });
  assert.equal(markers.length, 1);
  assert.equal(markers[0].o.icon.html.textContent, '<b>');
  assert.equal(markers[0].popup.children[0].textContent, '<b> <img src=x onerror=alert(1)>');
  page.update({ type: 'options', pickerMode: false, canPick: false, canOpen: true });
  markers[1].handlers.click();
  assert.deepEqual(page.sent.at(-1), { type: 'open', id: 'n1' });
  page.update({ type: 'options', pickerMode: true, canPick: true, canOpen: true });
  assert.equal(markers[2].o.interactive, false, 'in picker mode taps go to the map');
});

test('map events from the page are validated', () => {
  assert.deepEqual(parseMapEvent('{"type":"pick","point":{"latitude":55.7,"longitude":37.6}}'), { type: 'pick', point: { latitude: 55.7, longitude: 37.6 } });
  assert.deepEqual(parseMapEvent('{"type":"open","id":"n1"}'), { type: 'open', id: 'n1' });
  assert.equal(parseMapEvent('{"type":"pick","point":{"latitude":"55","longitude":37}}'), null);
  assert.equal(parseMapEvent('{"type":"pick","point":{"latitude":95,"longitude":37}}'), null);
  assert.equal(parseMapEvent('{"type":"open","id":5}'), null);
  assert.equal(parseMapEvent('{"type":"eval"}'), null);
  assert.equal(parseMapEvent('not json'), null);
});
