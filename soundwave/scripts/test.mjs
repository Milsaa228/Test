// Тесты чистой логики (без React Native): компилируем src/lib в CommonJS и проверяем через node:test.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const out = mkdtempSync(join(tmpdir(), 'soundwave-test-'));
execFileSync('npx', ['tsc', '--outDir', out, '--module', 'commonjs', '--target', 'es2020', '--ignoreConfig', '--types', 'node',
  '--skipLibCheck', '--strict', 'src/lib/queue.ts', 'src/lib/library.ts', 'src/lib/catalog.ts', 'src/lib/archive.ts'], { stdio: 'inherit' });
writeFileSync(join(out, 'package.json'), '{"type":"commonjs"}');
const require = createRequire(join(out, 'x.js'));
const Q = require('./queue.js');
const L = require('./library.js');
const { CATALOG, FEATURED, GENRES } = require('./catalog.js');
const A = require('./archive.js');

const T = (id) => ({ id, title: id, artist: 'A', album: 'B', uri: `u/${id}`, colors: ['#000', '#fff'] });
const tracks = ['a', 'b', 'c', 'd', 'e'].map(T);
const ids = (q) => q.tracks.map((t) => t.id).join('');
let seed = 1;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

test('startQueue keeps order and start index without shuffle', () => {
  const q = Q.startQueue(Q.EMPTY_QUEUE, tracks, 2);
  assert.equal(ids(q), 'abcde');
  assert.equal(q.index, 2);
});

test('shuffle keeps the chosen track first and all tracks present', () => {
  const q = Q.startQueue(Q.EMPTY_QUEUE, tracks, 3, { shuffle: true, rand });
  assert.equal(q.index, 0);
  assert.equal(q.tracks[0].id, 'd');
  assert.deepEqual([...ids(q)].sort().join(''), 'abcde');
});

test('toggling shuffle off restores original order at current track', () => {
  let q = Q.startQueue(Q.EMPTY_QUEUE, tracks, 1);
  q = Q.toggleShuffle(q, rand);
  assert.equal(q.tracks[0].id, 'b');
  q = { ...q, index: 2 };
  const cur = q.tracks[2].id;
  q = Q.toggleShuffle(q, rand);
  assert.equal(ids(q), 'abcde');
  assert.equal(q.tracks[q.index].id, cur);
});

test('next/prev respect repeat modes', () => {
  const end = { ...Q.startQueue(Q.EMPTY_QUEUE, tracks, 4) };
  assert.equal(Q.nextIndex(end, true), null);
  assert.equal(Q.nextIndex({ ...end, repeat: 'all' }, true), 0);
  assert.equal(Q.nextIndex({ ...end, repeat: 'one' }, true), 4);
  assert.equal(Q.nextIndex({ ...end, repeat: 'one', index: 1 }, false), 2, 'manual next skips even in repeat-one');
  assert.equal(Q.prevIndex(end, 10), 4, 'restart current after 3s');
  assert.equal(Q.prevIndex(end, 1), 3);
  assert.equal(Q.prevIndex({ ...end, index: 0 }, 1), 0);
  assert.equal(Q.prevIndex({ ...end, index: 0, repeat: 'all' }, 1), 4);
  assert.deepEqual(['off', 'all', 'one'].map(Q.cycleRepeat), ['all', 'one', 'off']);
});

test('playNext, removeAt and dropTrack keep index on the same track', () => {
  let q = Q.startQueue(Q.EMPTY_QUEUE, tracks, 1);
  q = Q.playNext(q, T('x'));
  assert.equal(ids(q), 'abxcde');
  assert.equal(q.original.map((t) => t.id).join(''), 'abxcde');
  q = Q.removeAt(q, 0);
  assert.equal(ids(q), 'bxcde');
  assert.equal(q.tracks[q.index].id, 'b');
  assert.equal(Q.removeAt(q, q.index), q, 'current track cannot be removed');
  q = Q.dropTrack({ ...q, index: 3 }, 'x');
  assert.equal(ids(q), 'bcde');
  assert.equal(q.tracks[q.index].id, 'd');
  assert.equal(Q.playNext(Q.EMPTY_QUEUE, T('z')).index, 0);
});

test('formatTime', () => {
  assert.equal(Q.formatTime(0), '0:00');
  assert.equal(Q.formatTime(65.9), '1:05');
  assert.equal(Q.formatTime(3725), '1:02:05');
  assert.equal(Q.formatTime(NaN), '–:––');
  assert.equal(Q.formatTotal(90 * 60), '1 ч 30 мин');
});

test('library reducer: likes, playlists, recent', () => {
  let s = L.EMPTY_LIBRARY;
  s = L.libraryReducer(s, { type: 'toggleLike', id: 'a1' });
  s = L.libraryReducer(s, { type: 'toggleLike', id: 'a2' });
  assert.deepEqual(s.liked, ['a2', 'a1']);
  s = L.libraryReducer(s, { type: 'toggleLike', id: 'a2' });
  assert.deepEqual(s.liked, ['a1']);

  s = L.libraryReducer(s, { type: 'createPlaylist', id: 'p1', name: '  ', now: 1 });
  assert.equal(s.playlists[0].name, 'Мой плейлист № 1');
  s = L.libraryReducer(s, { type: 'addToPlaylist', playlistId: 'p1', trackId: 'sh3' });
  s = L.libraryReducer(s, { type: 'addToPlaylist', playlistId: 'p1', trackId: 'sh3' });
  s = L.libraryReducer(s, { type: 'addToPlaylist', playlistId: 'p1', trackId: 'sh4' });
  assert.deepEqual(s.playlists[0].trackIds, ['sh3', 'sh4'], 'no duplicates');
  s = L.libraryReducer(s, { type: 'removeFromPlaylist', playlistId: 'p1', index: 0 });
  assert.deepEqual(s.playlists[0].trackIds, ['sh4']);
  s = L.libraryReducer(s, { type: 'renamePlaylist', id: 'p1', name: 'Дорога' });
  assert.equal(s.playlists[0].name, 'Дорога');

  for (let i = 1; i <= 25; i++) s = L.libraryReducer(s, { type: 'played', id: `t${i}` });
  s = L.libraryReducer(s, { type: 'played', id: 't10' });
  assert.equal(s.recent.length, 20);
  assert.equal(s.recent[0], 't10');
  assert.equal(new Set(s.recent).size, 20);
});

test('removing a local track cleans every reference', () => {
  const local = { ...T('local-1'), local: true };
  let s = L.libraryReducer(L.EMPTY_LIBRARY, { type: 'addTracks', tracks: [{ ...local, local: false, online: true, uri: 'https://x/a.mp3' }] });
  s = L.libraryReducer(s, { type: 'addTracks', tracks: [local] });
  assert.equal(s.localTracks.length, 1, 'same id is updated, not duplicated');
  assert.deepEqual([s.localTracks[0].local, s.localTracks[0].uri], [true, 'u/local-1'], 'download replaces stream');
  s = L.libraryReducer(s, { type: 'toggleLike', id: 'local-1' });
  s = L.libraryReducer(s, { type: 'played', id: 'local-1' });
  s = L.libraryReducer(s, { type: 'duration', id: 'local-1', seconds: 61.4 });
  s = L.libraryReducer(s, { type: 'createPlaylist', id: 'p', name: 'x', now: 0, trackIds: ['local-1', 'km-galway'] });
  assert.equal(s.durations['local-1'], 61);
  s = L.libraryReducer(s, { type: 'removeLocal', id: 'local-1' });
  assert.deepEqual([s.localTracks, s.liked, s.recent, s.playlists[0].trackIds, s.durations], [[], [], [], ['km-galway'], {}]);
});

test('resolveCollection for every kind', () => {
  const net = { ...T('net-1'), online: true, uri: 'https://x/1.mp3' };
  let s = L.libraryReducer(L.EMPTY_LIBRARY, { type: 'createPlaylist', id: 'p', name: 'Мой', now: 0, trackIds: ['net-1', 'missing'] });
  s = L.libraryReducer(s, { type: 'addTracks', tracks: [net] });
  s = L.libraryReducer(s, { type: 'duration', id: 'net-1', seconds: 300 });
  const own = L.resolveCollection('pl:p', s);
  assert.equal(own.editable, true);
  assert.deepEqual(own.tracks.map((t) => t.id), ['net-1'], 'unknown ids skipped');
  assert.equal(own.tracks[0].duration, 300, 'learned duration attached');
  assert.deepEqual(L.resolveCollection('local', s).tracks.map((t) => t.id), ['net-1'], 'user tracks collection');
  const feat = L.resolveCollection(`pl:${FEATURED[0].id}`, s);
  assert.equal(feat.editable, false);
  assert.equal(feat.tracks.length, FEATURED[0].trackIds.length);
  const t = CATALOG[0];
  assert.equal(L.resolveCollection(L.albumKey(t.artist, t.album), s).tracks.length, CATALOG.length);
  assert.equal(L.resolveCollection(`artist:${t.artist}`, s).tracks.every((x) => x.artist === t.artist), true);
  assert.equal(L.resolveCollection('genre:Джаз', s).tracks.length, 2);
  assert.equal(L.resolveCollection('liked', s).tracks.length, 0);
  assert.equal(L.resolveCollection('pl:nope', s), null);
  assert.equal(L.resolveCollection('weird', s), null);
});

test('catalog: bundled files, featured playlists and genres are consistent', () => {
  const known = new Set(CATALOG.map((t) => t.id));
  for (const p of FEATURED) assert.ok(p.trackIds.every((id) => known.has(id)), p.id);
  const manifest = JSON.parse(readFileSync('assets/music/manifest.json', 'utf8'));
  assert.deepEqual(CATALOG.map((t) => t.uri.replace('asset:', '')).sort(), manifest.map((m) => m.file).sort(), 'catalog = manifest');
  for (const m of manifest) {
    assert.ok(existsSync(`assets/music/${m.file}`), m.file);
    assert.equal(CATALOG.find((t) => t.uri === `asset:${m.file}`).duration, m.duration, `${m.file} duration`);
  }
  const assets = readFileSync('src/lib/musicAssets.ts', 'utf8');
  for (const m of manifest) assert.ok(assets.includes(`'${m.file}': require('../../assets/music/${m.file}')`), `require for ${m.file}`);
  assert.ok(CATALOG.every((t) => t.license && t.sourceUrl), 'attribution data');
  assert.equal(new Set(GENRES.map((g) => g.name)).size, GENRES.length);
});

test('search matches title/artist/album, ignores case and ё', () => {
  const r = L.search('BOSSA', CATALOG);
  assert.deepEqual(r.tracks.map((t) => t.title), ['Bossa Antigua']);
  assert.equal(L.search('macleod docks', CATALOG).tracks.length, 1);
  assert.deepEqual(L.search('kevin', CATALOG).artists.map((a) => a.name), ['Kevin MacLeod']);
  assert.equal(L.search('несуществующее', CATALOG).tracks.length, 0);
  assert.equal(L.search('  ', CATALOG).tracks.length, 0);
  assert.equal(L.search('взлет', [{ ...T('x'), title: 'Взлёт' }]).tracks.length, 1);
});

test('parseFileName and plural labels', () => {
  assert.deepEqual(L.parseFileName('Artist - Song_name.mp3'), { artist: 'Artist', title: 'Song name' });
  assert.deepEqual(L.parseFileName('track01.m4a'), { artist: 'Неизвестный исполнитель', title: 'track01' });
  assert.deepEqual([1, 2, 5, 11, 21, 22, 112].map(L.tracksLabel), ['1 трек', '2 трека', '5 треков', '11 треков', '21 трек', '22 трека', '112 треков']);
});

test('archive.org search: query, url and parsing', () => {
  const q = A.buildArchiveQuery('lo-fi "beats" (2020)');
  assert.ok(q.startsWith('(lo-fi beats 2020) AND mediatype:(audio)'), q);
  assert.ok(q.includes('-collection:(librivoxaudio'));
  const url = A.archiveSearchUrl('jazz');
  assert.ok(url.startsWith('https://archive.org/advancedsearch.php?q='));
  assert.ok(url.includes('fl[]=identifier') && url.includes('output=json'));
  const items = A.parseArchiveSearch({ response: { docs: [
    { identifier: 'a1', title: 'Album', creator: ['X', 'Y'], licenseurl: 'http://creativecommons.org/licenses/by-nc/3.0/' },
    { identifier: 'a2' },
    { title: 'no id' },
  ] } });
  assert.deepEqual(items, [
    { id: 'a1', title: 'Album', creator: 'X, Y', license: 'http://creativecommons.org/licenses/by-nc/3.0/' },
    { id: 'a2', title: 'a2', creator: 'Неизвестный исполнитель', license: undefined },
  ]);
});

test('archive.org metadata: one mp3 per original, ordered, with urls and durations', () => {
  const tracks = A.parseArchiveMetadata('my item', {
    metadata: { title: 'Live 1999', creator: 'Band', licenseurl: 'https://creativecommons.org/publicdomain/zero/1.0/' },
    files: [
      { name: '02 Second.flac', format: 'Flac', source: 'original', track: '2' },
      { name: '02 Second.mp3', format: 'VBR MP3', original: '02 Second.flac', track: '2', title: 'Second', length: '03:05' },
      { name: '02 Second_64kb.mp3', format: '64Kbps MP3', original: '02 Second.flac', track: '2' },
      { name: 'disc/01 First.mp3', format: 'VBR MP3', track: '1', length: '61.6', creator: 'Guest' },
      { name: 'cover.jpg', format: 'JPEG' },
    ],
  });
  assert.equal(tracks.length, 2);
  assert.deepEqual(tracks.map((t) => [t.title, t.artist, t.duration]), [['01 First', 'Guest', 62], ['Second', 'Band', 185]]);
  assert.equal(tracks[0].uri, 'https://archive.org/download/my%20item/disc/01%20First.mp3');
  assert.equal(tracks[1].album, 'Live 1999');
  assert.ok(tracks.every((t) => t.online && t.id.startsWith('net-') && t.sourceUrl === 'https://archive.org/details/my%20item'));
  assert.equal(A.netTrackId(tracks[0].uri), tracks[0].id, 'stable id');
  assert.notEqual(tracks[0].id, tracks[1].id);
});

test('archive helpers: length, extension, license label', () => {
  assert.deepEqual(['125.4', '2:05', '1:00:01', 'x', undefined].map(A.parseLength), [125, 125, 3601, undefined, undefined]);
  assert.deepEqual(['https://a/b.MP3', 'https://a/b.m4a?x=1', 'https://a/stream', 'https://a/b.flac#t'].map(A.audioExtension), ['mp3', 'm4a', 'mp3', 'flac']);
  assert.equal(A.licenseLabel('https://creativecommons.org/licenses/by-sa/4.0/'), 'CC BY-SA 4.0');
  assert.equal(A.licenseLabel('http://creativecommons.org/publicdomain/mark/1.0/'), 'Общественное достояние');
  assert.equal(A.licenseLabel(undefined), undefined);
});

test('searchArchive uses fetch and reports HTTP errors', async () => {
  const calls = [];
  const ok = async (url) => (calls.push(url), { ok: true, status: 200, json: async () => ({ response: { docs: [{ identifier: 'z' }] } }) });
  assert.deepEqual((await A.searchArchive('blues', ok)).map((i) => i.id), ['z']);
  assert.equal(calls.length, 1);
  assert.deepEqual(await A.searchArchive('  ', ok), []);
  await assert.rejects(A.searchArchive('x', async () => ({ ok: false, status: 503, json: async () => ({}) })), /503/);
});
