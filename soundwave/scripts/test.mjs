// Тесты чистой логики (без React Native): компилируем src/lib в CommonJS и проверяем через node:test.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const out = mkdtempSync(join(tmpdir(), 'soundwave-test-'));
execFileSync('npx', ['tsc', '--outDir', out, '--module', 'commonjs', '--target', 'es2020', '--ignoreConfig', '--types', 'node',
  '--skipLibCheck', '--strict', 'src/lib/queue.ts', 'src/lib/library.ts', 'src/lib/catalog.ts'], { stdio: 'inherit' });
writeFileSync(join(out, 'package.json'), '{"type":"commonjs"}');
const require = createRequire(join(out, 'x.js'));
const Q = require('./queue.js');
const L = require('./library.js');
const { CATALOG, FEATURED } = require('./catalog.js');

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
  s = L.libraryReducer(s, { type: 'toggleLike', id: 'sh1' });
  s = L.libraryReducer(s, { type: 'toggleLike', id: 'sh2' });
  assert.deepEqual(s.liked, ['sh2', 'sh1']);
  s = L.libraryReducer(s, { type: 'toggleLike', id: 'sh2' });
  assert.deepEqual(s.liked, ['sh1']);

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
  let s = L.libraryReducer(L.EMPTY_LIBRARY, { type: 'addLocal', tracks: [local] });
  s = L.libraryReducer(s, { type: 'addLocal', tracks: [local] });
  assert.equal(s.localTracks.length, 1);
  s = L.libraryReducer(s, { type: 'toggleLike', id: 'local-1' });
  s = L.libraryReducer(s, { type: 'played', id: 'local-1' });
  s = L.libraryReducer(s, { type: 'duration', id: 'local-1', seconds: 61.4 });
  s = L.libraryReducer(s, { type: 'createPlaylist', id: 'p', name: 'x', now: 0, trackIds: ['local-1', 'sh1'] });
  assert.equal(s.durations['local-1'], 61);
  s = L.libraryReducer(s, { type: 'removeLocal', id: 'local-1' });
  assert.deepEqual([s.localTracks, s.liked, s.recent, s.playlists[0].trackIds, s.durations], [[], [], [], ['sh1'], {}]);
});

test('resolveCollection for every kind', () => {
  let s = L.libraryReducer(L.EMPTY_LIBRARY, { type: 'createPlaylist', id: 'p', name: 'Мой', now: 0, trackIds: ['sh2', 'missing'] });
  s = L.libraryReducer(s, { type: 'duration', id: 'sh2', seconds: 300 });
  const own = L.resolveCollection('pl:p', s);
  assert.equal(own.editable, true);
  assert.deepEqual(own.tracks.map((t) => t.id), ['sh2'], 'unknown ids skipped');
  assert.equal(own.tracks[0].duration, 300, 'learned duration attached');
  const feat = L.resolveCollection(`pl:${FEATURED[0].id}`, s);
  assert.equal(feat.editable, false);
  assert.equal(feat.tracks.length, FEATURED[0].trackIds.length);
  const t = CATALOG[0];
  assert.equal(L.resolveCollection(L.albumKey(t.artist, t.album), s).tracks.length, 2);
  assert.equal(L.resolveCollection(`artist:${t.artist}`, s).tracks.every((x) => x.artist === t.artist), true);
  assert.ok(L.resolveCollection(`genre:${t.genre}`, s).tracks.length >= 2);
  assert.equal(L.resolveCollection('liked', s).tracks.length, 0);
  assert.equal(L.resolveCollection('pl:nope', s), null);
  assert.equal(L.resolveCollection('weird', s), null);
});

test('every featured playlist references real tracks', () => {
  const known = new Set(CATALOG.map((t) => t.id));
  for (const p of FEATURED) assert.ok(p.trackIds.every((id) => known.has(id)), p.id);
});

test('search matches title/artist/album, ignores case and ё', () => {
  const r = L.search('ПУЛЬС', CATALOG);
  assert.deepEqual(r.tracks.map((t) => t.title), ['Пульс мегаполиса']);
  assert.equal(L.search('helix ночной', CATALOG).tracks.length, 2);
  assert.deepEqual(L.search('lumen', CATALOG).artists.map((a) => a.name), ['Lumen']);
  assert.equal(L.search('Последнии', CATALOG).tracks.length, 0);
  assert.equal(L.search('  ', CATALOG).tracks.length, 0);
  assert.equal(L.search('взлет', [{ ...T('x'), title: 'Взлёт' }]).tracks.length, 1);
});

test('parseFileName and plural labels', () => {
  assert.deepEqual(L.parseFileName('Artist - Song_name.mp3'), { artist: 'Artist', title: 'Song name' });
  assert.deepEqual(L.parseFileName('track01.m4a'), { artist: 'Неизвестный исполнитель', title: 'track01' });
  assert.deepEqual([1, 2, 5, 11, 21, 22, 112].map(L.tracksLabel), ['1 трек', '2 трека', '5 треков', '11 треков', '21 трек', '22 трека', '112 треков']);
});
