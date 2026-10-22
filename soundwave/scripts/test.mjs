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
  '--skipLibCheck', '--strict', 'src/lib/queue.ts', 'src/lib/library.ts', 'src/lib/archive.ts', 'src/lib/genres.ts', 'src/lib/recommend.ts', 'src/lib/reco.ts', 'src/lib/textq.ts', 'src/lib/lyrics.ts', 'src/lib/images.ts'], { stdio: 'inherit' });
writeFileSync(join(out, 'package.json'), '{"type":"commonjs"}');
const require = createRequire(join(out, 'x.js'));
const Q = require('./queue.js');
const L = require('./library.js');
const A = require('./archive.js');
const G = require('./genres.js');
const R = require('./recommend.js');
const Reco = require('./reco.js');
const Q2 = require('./textq.js');
const Ly = require('./lyrics.js');
const Img = require('./images.js');

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

// ---------- медиатека ----------

const lib = (patch = {}) => ({ ...L.EMPTY_LIBRARY, ...patch });
const NT = (id, extra = {}) => ({ ...T(id), online: true, uri: `https://x/${id}.mp3`, ...extra });

test('library reducer: likes, dislikes, playlists, history, stats', () => {
  let s = L.libraryReducer(L.EMPTY_LIBRARY, { type: 'addTracks', tracks: [NT('a1'), NT('a2')] });
  s = L.libraryReducer(s, { type: 'toggleLike', id: 'a1' });
  s = L.libraryReducer(s, { type: 'toggleLike', id: 'a2' });
  assert.deepEqual(s.liked, ['a2', 'a1']);
  s = L.libraryReducer(s, { type: 'dislike', track: NT('a2', { artist: 'Bad' }) });
  assert.deepEqual(s.liked, ['a1'], 'dislike removes like');
  assert.deepEqual(s.disliked.map((d) => [d.id, d.artist]), [['a2', 'Bad']]);

  s = L.libraryReducer(s, { type: 'createPlaylist', id: 'p1', name: '  ', now: 1 });
  assert.equal(s.playlists[0].name, 'Мой плейлист № 1');
  s = L.libraryReducer(s, { type: 'addToPlaylist', playlistId: 'p1', trackId: 'a1' });
  s = L.libraryReducer(s, { type: 'addToPlaylist', playlistId: 'p1', trackId: 'a1' });
  assert.deepEqual(s.playlists[0].trackIds, ['a1'], 'no duplicates');
  s = L.libraryReducer(s, { type: 'renamePlaylist', id: 'p1', name: 'Дорога' });
  assert.equal(s.playlists[0].name, 'Дорога');

  for (let i = 1; i <= 35; i++) s = L.libraryReducer(s, { type: 'played', track: NT(`t${i}`), now: i });
  s = L.libraryReducer(s, { type: 'played', track: NT('t10'), now: 100 });
  s = L.libraryReducer(s, { type: 'skipped', track: NT('t10'), now: 101 });
  assert.equal(s.recentTracks.length, 30);
  assert.equal(s.recentTracks[0].id, 't10');
  assert.deepEqual([s.stats.t10.plays, s.stats.t10.skips, s.stats.t10.last], [2, 1, 101]);

  s = L.libraryReducer(s, { type: 'setPrefs', genres: ['jazz', 'jazz'], artists: [' Bach ', ''] });
  assert.deepEqual(s.prefs, { genres: ['jazz'], artists: ['Bach'], onboarded: true });
  s = L.libraryReducer(s, { type: 'setSettings', settings: { offline: true } });
  assert.deepEqual(s.settings, { offline: true, autoDownloadLiked: false });
  s = L.libraryReducer(s, { type: 'clearHistory' });
  assert.deepEqual([s.recentTracks, s.stats, s.disliked, s.liked], [[], {}, [], ['a1']]);
});

test('load migrates old state: drops removed built-in tracks and fills defaults', () => {
  const s = L.libraryReducer(L.EMPTY_LIBRARY, {
    type: 'load',
    state: { liked: ['km-galway', 'n1'], playlists: [{ id: 'p', name: 'x', trackIds: ['km-dreamer', 'n1'], colors: ['#000', '#fff'], createdAt: 0 }], localTracks: [NT('n1')], recent: ['km-galway'] },
  });
  assert.deepEqual(s.liked, ['n1']);
  assert.deepEqual(s.playlists[0].trackIds, ['n1']);
  assert.deepEqual(s.prefs, { genres: [], artists: [], onboarded: false });
  assert.deepEqual(s.recentTracks, []);
});

test('downloaded track replaces stream; removing cleans references', () => {
  let s = L.libraryReducer(L.EMPTY_LIBRARY, { type: 'addTracks', tracks: [NT('n1')] });
  s = L.libraryReducer(s, { type: 'addTracks', tracks: [{ ...NT('n1'), uri: 'file:///m/n1.mp3', remoteUri: 'https://x/n1.mp3', local: true }] });
  assert.equal(s.localTracks.length, 1);
  assert.deepEqual([s.localTracks[0].local, s.localTracks[0].uri], [true, 'file:///m/n1.mp3']);
  s = L.libraryReducer(s, { type: 'toggleLike', id: 'n1' });
  s = L.libraryReducer(s, { type: 'duration', id: 'n1', seconds: 61.4 });
  s = L.libraryReducer(s, { type: 'createPlaylist', id: 'p', name: 'x', now: 0, trackIds: ['n1'] });
  assert.equal(s.durations.n1, 61);
  s = L.libraryReducer(s, { type: 'removeLocal', id: 'n1' });
  assert.deepEqual([s.localTracks, s.liked, s.playlists[0].trackIds, s.durations], [[], [], [], {}]);
  assert.equal(L.isPlayable(NT('z'), true), false);
  assert.equal(L.isPlayable({ ...NT('z'), local: true }, true), true);
  assert.equal(L.isPlayable(NT('z'), false), true);
});

test('resolveCollection: liked, my tracks, recent, playlist, artist, album', () => {
  let s = L.libraryReducer(L.EMPTY_LIBRARY, { type: 'addTracks', tracks: [NT('n1', { artist: 'Bach', album: 'Organ' }), NT('n2', { artist: 'Bach', album: 'Organ' })] });
  s = L.libraryReducer(s, { type: 'createPlaylist', id: 'p', name: 'Мой', now: 0, trackIds: ['n2', 'missing'] });
  s = L.libraryReducer(s, { type: 'duration', id: 'n2', seconds: 300 });
  s = L.libraryReducer(s, { type: 'played', track: NT('net-only'), now: 1 });
  const own = L.resolveCollection('pl:p', s);
  assert.equal(own.editable, true);
  assert.deepEqual(own.tracks.map((t) => [t.id, t.duration]), [['n2', 300]]);
  assert.equal(L.resolveCollection('local', s).tracks.length, 2);
  assert.deepEqual(L.resolveCollection('recent', s).tracks.map((t) => t.id), ['net-only'], 'recent includes unsaved tracks');
  assert.equal(L.resolveCollection('artist:Bach', s).tracks.length, 2);
  assert.equal(L.resolveCollection(L.albumKey('Bach', 'Organ'), s).tracks.length, 2);
  assert.equal(L.resolveCollection('liked', s).tracks.length, 0);
  assert.equal(L.resolveCollection('pl:nope', s), null);
  assert.equal(L.resolveCollection('weird', s), null);
});

test('search, parseFileName and plural labels', () => {
  const tracks = [NT('a', { title: 'Взлёт', artist: 'Orbit' }), NT('b', { title: 'Bossa', artist: 'Blue Room', album: 'Evening' })];
  assert.deepEqual(L.search('взлет', tracks).tracks.map((t) => t.id), ['a']);
  assert.equal(L.search('blue evening', tracks).tracks.length, 1);
  assert.deepEqual(L.search('orbit', tracks).artists.map((a) => a.name), ['Orbit']);
  assert.equal(L.search('  ', tracks).tracks.length, 0);
  assert.deepEqual(L.parseFileName('Artist - Song_name.mp3'), { artist: 'Artist', title: 'Song name' });
  assert.deepEqual(L.parseFileName('track01.m4a'), { artist: 'Неизвестный исполнитель', title: 'track01' });
  assert.deepEqual([1, 2, 5, 11, 21, 22, 112].map(L.tracksLabel), ['1 трек', '2 трека', '5 треков', '11 треков', '21 трек', '22 трека', '112 треков']);
});

// ---------- Internet Archive ----------

test('archive.org queries: license filter, no speech, artist/genre helpers', () => {
  const q = A.buildArchiveQuery('lo-fi "beats" (2020)');
  assert.ok(q.startsWith('((lo-fi beats 2020) OR (ло-фи беац 2020)) AND mediatype:(audio)'), q);
  assert.ok(A.buildArchiveQuery('металлика').includes('(Metallica)'), 'russian spelling → canonical name');
  assert.ok(A.creatorSearchQuery('кино').startsWith('(creator:(кино) OR creator:(kino)) AND'));
  for (const part of ['licenseurl:(*creativecommons.org* OR *publicdomain*)', '-collection:(librivoxaudio', '-subject:(podcast']) assert.ok(q.includes(part), part);
  assert.ok(A.artistQuery('Nine "Inch" Nails').startsWith('creator:("Nine Inch Nails") AND mediatype'));
  assert.ok(A.genreQuery('subject:(jazz)').startsWith('(subject:(jazz)) AND '));
  const url = A.archiveQueryUrl('x', { rows: 12, page: 2 });
  assert.ok(url.includes('fl[]=subject') && url.includes('rows=12') && url.includes('page=2'));
  const items = A.parseArchiveSearch({ response: { docs: [
    { identifier: 'a1', title: 'Album', creator: ['X', 'Y'], licenseurl: 'http://creativecommons.org/licenses/by-nc/3.0/', subject: ['Jazz', 'swing; bebop'] },
    { identifier: 'a2' },
    { title: 'no id' },
  ] } });
  assert.deepEqual(items.map((i) => [i.id, i.creator, i.tags]), [['a1', 'X, Y', ['jazz', 'swing; bebop']], ['a2', 'Неизвестный исполнитель', []]]);
  assert.deepEqual(A.parseTags('Jazz; Swing, jazz'), ['jazz', 'swing']);
});

test('archive.org metadata: one mp3 per original, ordered, with urls, tags and durations', () => {
  const tracks = A.parseArchiveMetadata('my item', {
    metadata: { title: 'Live 1999', creator: 'Band', licenseurl: 'https://creativecommons.org/publicdomain/zero/1.0/', subject: 'blues; live' },
    files: [
      { name: '02 Second.flac', format: 'Flac', source: 'original', track: '2' },
      { name: '02 Second.mp3', format: 'VBR MP3', original: '02 Second.flac', track: '2', title: 'Second', length: '03:05' },
      { name: '02 Second_64kb.mp3', format: '64Kbps MP3', original: '02 Second.flac', track: '2' },
      { name: 'disc/01 First.mp3', format: 'VBR MP3', track: '1', length: '61.6', creator: 'Guest' },
      { name: 'cover.jpg', format: 'JPEG' },
    ],
  });
  assert.deepEqual(tracks.map((t) => [t.title, t.artist, t.duration]), [['First', 'Guest', 62], ['Second', 'Band', 185]]);
  assert.equal(tracks[0].uri, 'https://archive.org/download/my%20item/disc/01%20First.mp3');
  assert.deepEqual(tracks[1].tags, ['blues', 'live']);
  assert.ok(tracks.every((t) => t.online && t.id.startsWith('net-') && t.sourceUrl === 'https://archive.org/details/my%20item'));
  assert.equal(A.netTrackId(tracks[0].uri), tracks[0].id, 'stable id');
});

test('archive titles and creators are tidied', () => {
  const cases = [['01 Oasis is Myth', 1, 'Oasis is Myth'], ['7 Picasso Moon', '7', 'Picasso Moon'], ['201. TMK - Zombi', undefined, 'TMK - Zombi'], ['02_ I - Allegro', undefined, 'I - Allegro'],
    ['000 Grande Valse', undefined, 'Grande Valse'], ['1,000,000', 3, '1,000,000'], ['99 Luftballons', 3, '99 Luftballons'], ['42', 1, '42']];
  for (const [title, track, want] of cases) assert.equal(A.cleanTitle(title, track), want, title);
  assert.equal(A.shortCreator('burgmüller, friedrich ; schubert, franz ; chopin'), 'burgmüller, friedrich и др.');
  assert.equal(A.shortCreator('Grateful Dead'), 'Grateful Dead');
});

test('archive helpers: length, extension, license label, fetch errors', async () => {
  assert.deepEqual(['125.4', '2:05', '1:00:01', 'x', undefined].map(A.parseLength), [125, 125, 3601, undefined, undefined]);
  assert.deepEqual(['https://a/b.MP3', 'https://a/b.m4a?x=1', 'https://a/stream', 'https://a/b.flac#t'].map(A.audioExtension), ['mp3', 'm4a', 'mp3', 'flac']);
  assert.equal(A.licenseLabel('https://creativecommons.org/licenses/by-sa/4.0/'), 'CC BY-SA 4.0');
  assert.equal(A.licenseLabel('http://creativecommons.org/publicdomain/mark/1.0/'), 'Общественное достояние');
  assert.deepEqual(await A.searchArchive('  ', async () => assert.fail('no request for empty query')), []);
  await assert.rejects(A.searchArchive('x', async () => ({ ok: false, status: 503, json: async () => ({}) })), /503/);
});

// ---------- жанры и рекомендации ----------

test('genres: ids unique, artists reference genres, whole-word tag matching', () => {
  assert.equal(new Set(G.GENRES.map((g) => g.id)).size, G.GENRES.length);
  assert.ok(G.ARTISTS.every((a) => G.genreById(a.genre)), 'artist genres exist');
  assert.deepEqual(G.genresOfTrack({ tags: ['Jazz', 'live'] }), ['jazz']);
  assert.deepEqual(G.genresOfTrack({ tags: ['hip hop instrumental'] }), ['hiphop', 'instrumental']);
  assert.ok(G.GENRES.length >= 35, 'many genres to choose from');
  assert.deepEqual(G.genresOfTrack({ tags: ['trap', 'scrapbook'] }), [], '"rap" is not matched inside other words');
  assert.deepEqual(G.genresOfTrack({ genre: 'classical' }), ['classical']);
});

test('period keys: day, ISO week (Monday start, year boundary), month', () => {
  const d = (y, m, day) => new Date(y, m - 1, day, 12);
  assert.equal(R.periodKey('day', d(2026, 10, 22)), '2026-10-22');
  assert.equal(R.periodKey('month', d(2026, 10, 22)), '2026-10');
  assert.equal(R.periodKey('week', d(2026, 10, 19)), R.periodKey('week', d(2026, 10, 25)), 'Mon..Sun same week');
  assert.notEqual(R.periodKey('week', d(2026, 10, 25)), R.periodKey('week', d(2026, 10, 26)), 'new week on Monday');
  assert.equal(R.periodKey('week', d(2026, 10, 22)), '2026-W43');
  assert.equal(R.periodKey('week', d(2027, 1, 1)), '2026-W53');
  assert.equal(R.periodKey('week', d(2025, 12, 29)), '2026-W01');
});

test('seeded random is deterministic per key', () => {
  const a = R.seededRandom('day:2026-10-22');
  const b = R.seededRandom('day:2026-10-22');
  const c = R.seededRandom('day:2026-10-23');
  const xs = [a(), a(), a()];
  assert.deepEqual(xs, [b(), b(), b()]);
  assert.notDeepEqual(xs, [c(), c(), c()]);
  assert.ok(xs.every((x) => x >= 0 && x < 1));
});

test('taste profile: prefs, likes, plays, skips and dislikes', () => {
  const s = lib({
    prefs: { genres: ['jazz'], artists: ['Bach'], onboarded: true },
    localTracks: [NT('l1', { artist: 'Miles', tags: ['jazz'] })],
    liked: ['l1'],
    stats: { x: { artist: 'Skippy', plays: 1, skips: 4, last: Date.now() } },
    disliked: [{ id: 'd', artist: 'Noise', tags: ['experimental'] }],
  });
  const t = R.tasteProfile(s);
  assert.equal(t.genres.get('jazz'), 4.5);
  assert.equal(t.artists.get('Bach'), 3);
  assert.equal(t.artists.get('Miles'), 2);
  assert.ok(t.artists.get('Skippy') < 0, 'skips lower the weight');
  assert.equal(t.artists.get('Noise'), -2);
  assert.ok(t.genres.get('experimental') < 0);
});

test('seeds: mix of genres and artists, defaults without taste', () => {
  const rand = R.seededRandom('s');
  const taste = { genres: new Map([['jazz', 3], ['rock', 1], ['bogus', 5]]), artists: new Map([['Bach', 3], ['Hated', -2]]) };
  const seeds = R.pickSeeds(taste, 4, rand);
  assert.equal(seeds.length, 3, 'only positive known seeds: jazz, rock, Bach');
  assert.ok(seeds.some((x) => x.kind === 'genre') && seeds.some((x) => x.kind === 'artist'));
  assert.ok(!seeds.some((x) => x.value === 'Hated' || x.value === 'bogus'));
  const def = R.pickSeeds({ genres: new Map(), artists: new Map() }, 3, rand);
  assert.equal(def.length, 3);
  assert.ok(def.every((x) => x.kind === 'genre'));
});

// ПРАВИЛО ПРОДУКТА: в миксах дня/недели/месяца понравившихся треков как можно меньше.
test('RULE: mixes prefer fresh tracks and use at most 10% liked ones', () => {
  const fresh = Array.from({ length: 30 }, (_, i) => NT(`f${i}`, { artist: `A${i % 15}` }));
  const liked = Array.from({ length: 10 }, (_, i) => NT(`l${i}`, { artist: `L${i}` }));
  const likedIds = new Set(liked.map((t) => t.id));
  const enough = R.assembleMix([...liked, ...fresh], { size: 20, likedIds, maxLikedShare: R.MIX_MAX_LIKED_SHARE, rand: R.seededRandom('a') });
  assert.equal(enough.length, 20);
  assert.equal(enough.filter((t) => likedIds.has(t.id)).length, 0, 'enough fresh tracks → no liked at all');

  const scarce = R.assembleMix([...liked, ...fresh.slice(0, 12)], { size: 20, likedIds, maxLikedShare: R.MIX_MAX_LIKED_SHARE, rand: R.seededRandom('b') });
  assert.equal(scarce.filter((t) => likedIds.has(t.id)).length, 2, 'not enough fresh → liked only as filler, ≤10%');
  assert.equal(scarce.length, 14);
  assert.equal(R.MIX_MAX_LIKED_SHARE, 0.1);
});

test('assembleMix: avoids recent, drops disliked, caps per artist, spreads artists', () => {
  const pool = [
    ...Array.from({ length: 6 }, (_, i) => NT(`same${i}`, { artist: 'Same' })),
    ...Array.from({ length: 6 }, (_, i) => NT(`o${i}`, { artist: `O${i}` })),
    NT('recent1', { artist: 'R' }),
    NT('bad', { artist: 'B' }),
  ];
  const mix = R.assembleMix(pool, {
    size: 8, likedIds: new Set(), maxLikedShare: 0.1, perArtist: 2, rand: R.seededRandom('c'),
    avoidIds: new Set(['recent1']), dislikedIds: new Set(['bad']),
  });
  assert.equal(mix.length, 8);
  assert.ok(!mix.some((t) => t.id === 'bad'));
  assert.ok(!mix.some((t) => t.id === 'recent1'), 'recent used only if nothing else');
  assert.equal(mix.filter((t) => t.artist === 'Same').length, 2);
  for (let i = 1; i < mix.length; i++) assert.notEqual(mix[i].artist, mix[i - 1].artist);
});

// ---------- сборка миксов и волны с подменённым archive.org ----------

function fakeArchive({ fail = false } = {}) {
  const calls = { search: 0, meta: 0 };
  const fetchFn = async (url) => {
    if (fail) throw new Error('offline');
    if (url.includes('advancedsearch.php')) {
      calls.search++;
      const q = decodeURIComponent(url.match(/q=([^&]*)/)[1]);
      const key = (q.match(/creator:\("([^"]+)"\)/)?.[1] ?? q.match(/subject:\(([a-z]+)/)?.[1] ?? 'x').replace(/\W/g, '');
      return { ok: true, status: 200, json: async () => ({ response: { docs: Array.from({ length: 6 }, (_, i) => ({ identifier: `${key}-item${i}`, title: `${key} ${i}`, creator: `${key} artist ${i}`, subject: [key] })) } }) };
    }
    calls.meta++;
    const id = decodeURIComponent(url.split('/metadata/')[1]);
    return { ok: true, status: 200, json: async () => ({
      metadata: { title: id, creator: `${id} by`, licenseurl: 'https://creativecommons.org/licenses/by/4.0/', subject: id.split('-')[0] },
      files: [
        { name: 'a.mp3', format: 'VBR MP3', length: '200', track: '1' },
        { name: 'b.mp3', format: 'VBR MP3', length: '240', track: '2' },
        { name: 'intro.mp3', format: 'VBR MP3', length: '20', track: '0' },
        { name: 'full.mp3', format: 'VBR MP3', length: '3600', track: '9' },
      ],
    }) };
  };
  return { fetchFn, calls };
}

test('buildMix: deterministic per period, sized, no liked when fresh available, skips intros and full albums', async () => {
  const s = lib({ prefs: { genres: ['jazz', 'rock'], artists: ['Bach'], onboarded: true } });
  const { fetchFn, calls } = fakeArchive();
  const now = new Date(2026, 9, 22, 12);
  const m1 = await Reco.buildMix('day', s, { now, fetchFn });
  const m2 = await Reco.buildMix('day', s, { now, fetchFn });
  assert.equal(m1.key, '2026-10-22');
  assert.equal(m1.tracks.length, 20);
  assert.deepEqual(m1.tracks.map((t) => t.id), m2.tracks.map((t) => t.id), 'same day → same mix');
  assert.ok(m1.tracks.every((t) => t.duration >= 60 && t.duration <= 900));
  assert.ok(calls.search > 0 && calls.meta > 0);

  const tomorrow = await Reco.buildMix('day', s, { now: new Date(2026, 9, 23, 12), fetchFn });
  assert.notDeepEqual(tomorrow.tracks.map((t) => t.id), m1.tracks.map((t) => t.id), 'next day → new mix');

  // Лайкнем половину сегодняшнего микса: новый микс того же дня должен их избегать.
  const likedTracks = m1.tracks.slice(0, 10);
  const s2 = { ...s, localTracks: likedTracks, liked: likedTracks.map((t) => t.id) };
  const m3 = await Reco.buildMix('day', s2, { now, fetchFn });
  const likedIn = m3.tracks.filter((t) => s2.liked.includes(t.id)).length;
  assert.ok(likedIn <= 2, `liked in mix: ${likedIn}`);

  const week = await Reco.buildMix('week', s, { now, fetchFn, avoidIds: new Set(m1.tracks.map((t) => t.id)) });
  assert.equal(week.tracks.length, 30);
  assert.ok(week.tracks.filter((t) => m1.tracks.some((d) => d.id === t.id)).length <= 5, 'week mostly differs from day');
});

test('buildMix reports network failure; waveBatch excludes queue and disliked', async () => {
  const s = lib({ prefs: { genres: ['jazz'], artists: [], onboarded: true } });
  await assert.rejects(Reco.buildMix('day', s, { fetchFn: fakeArchive({ fail: true }).fetchFn }), /archive\.org|подобрать/);
  const { fetchFn } = fakeArchive();
  const first = await Reco.waveBatch(s, { exclude: new Set(), fetchFn, rand: R.seededRandom('w') });
  assert.ok(first.length > 0 && first.length <= 8);
  assert.equal(first.length, 8);
  for (let i = 1; i < first.length; i++) assert.notEqual(first[i].artist, first[i - 1].artist, 'same artist never twice in a row');
  assert.equal(new Set(first.slice(0, 6).map((t) => t.artist)).size, 6, 'one track per artist while there are enough artists');
  const second = await Reco.waveBatch({ ...s, disliked: [{ id: first[1].id, artist: first[1].artist }] }, { exclude: new Set([first[0].id]), fetchFn, rand: R.seededRandom('w') });
  assert.ok(!second.some((t) => t.id === first[0].id || t.id === first[1].id));
});

test('offline wave uses only given tracks, prefers taste, skips disliked', () => {
  const tracks = [NT('j1', { artist: 'J', tags: ['jazz'], local: true }), NT('r1', { artist: 'R', tags: ['rock'], local: true }), NT('d1', { artist: 'D', local: true })];
  const s = lib({ prefs: { genres: ['jazz'], artists: [], onboarded: true }, disliked: [{ id: 'd1', artist: 'D' }] });
  const w = R.offlineWave(tracks, s, 5, R.seededRandom('o'), new Set());
  assert.deepEqual(w.map((t) => t.id).sort(), ['j1', 'r1']);
});

test('mapLimit keeps order, limits concurrency and isolates failures', async () => {
  let active = 0;
  let peak = 0;
  const res = await Reco.mapLimit([1, 2, 3, 4, 5], 2, async (n) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 5));
    active--;
    if (n === 3) throw new Error('x');
    return n * 10;
  });
  assert.equal(peak, 2);
  assert.deepEqual(res.map((r) => (r.status === 'fulfilled' ? r.value : 'err')), [10, 20, 'err', 40, 50]);
});

// ---------- разбор поискового запроса ----------

test('textq: layout swap, translit both ways, dictionary', () => {
  assert.equal(Q2.swapLayout('vtnfkkbrf'), 'металлика');
  assert.equal(Q2.swapLayout('ьуефддшсф'), 'metallica');
  assert.equal(Q2.ruToLatin('эминем'), 'eminem');
  assert.equal(Q2.ruToLatin('скриптонит'), 'skriptonit');
  assert.equal(Q2.ruToLatin('металлика'), 'metallika');
  assert.equal(Q2.latinToRu('kino'), 'кино');
  assert.equal(Q2.latinToRu('basta'), 'баста');
  assert.equal(Q2.latinToRu('zemfira'), 'земфира');
  assert.equal(Q2.latinToRu('shchedrin'), 'щедрин');
  assert.equal(Q2.dictionaryName('Рианна'), 'Rihanna');
  assert.equal(Q2.dictionaryName('имаджин драгонс'), 'Imagine Dragons');
  assert.equal(Q2.dictionaryName('имэджн драгонс'), 'Imagine Dragons', 'typo tolerated');
  assert.equal(Q2.dictionaryName('уикенд blinding lights'), 'The Weeknd', 'name at the start of a longer query');
  assert.equal(Q2.dictionaryName('кино'), null);
  assert.equal(Q2.dictionaryName('metallica'), null, 'latin queries are not looked up');
});

test('textq: query variants cover the cases found on the live catalog', () => {
  const v = (q) => Q2.queryVariants(q);
  assert.deepEqual(v('Металлика'), ['Металлика', 'Metallica', 'metallika']);
  assert.deepEqual(v('Эминем'), ['Эминем', 'Eminem']);
  assert.deepEqual(v('kino'), ['kino', 'кино']);
  assert.deepEqual(v('basta'), ['basta', 'баста']);
  assert.ok(v('vtnfkkbrf').includes('металлика') && v('vtnfkkbrf').includes('Metallica'), 'wrong layout → russian → dictionary');
  assert.ok(v('ьуефддшсф').includes('metallica'), 'wrong layout to latin');
  assert.deepEqual(v('  '), []);
  assert.ok(v('Кино группа крови').length <= 4);
  assert.equal(v('Imagine Dragons')[0], 'Imagine Dragons');
});

test('textq: match score and fuzzy includes for ranking and library search', () => {
  assert.equal(Q2.matchScore('Metallica', ['металлика', 'Metallica']), 1);
  assert.equal(Q2.matchScore('Кино', ['kino', 'кино']), 1);
  assert.ok(Q2.matchScore('The Weeknd', ['weeknd']) === 1, 'leading "the" ignored');
  assert.ok(Q2.matchScore('Коррозия Металла', ['Metallica']) < 0.6);
  assert.ok(Q2.fuzzyIncludes('Земфира — Хочешь', 'zemfira'));
  assert.ok(Q2.fuzzyIncludes('Skriptonit', 'скриптонит'));
  assert.ok(!Q2.fuzzyIncludes('Bach', 'mozart'));
  assert.ok(L.search('металлика', [NT('m', { artist: 'Metallica', title: 'One' })]).tracks.length === 1, 'library search uses variants');
});

// ---------- тексты песен и фото ----------

test('lyrics: synced parsing, current line, title cleanup, fetch fallback', async () => {
  const lines = Ly.parseSynced('[ar:Кино]\n[00:44.75] Тёплое место\n[00:48.42]Отпечатков наших ног\n[01:00.3][02:00.30] Припев\nбез метки');
  assert.deepEqual(lines.map((l) => [l.t, l.text]), [[44.75, 'Тёплое место'], [48.42, 'Отпечатков наших ног'], [60.3, 'Припев'], [120.3, 'Припев']]);
  assert.equal(Ly.currentLine(lines, 10), -1);
  assert.equal(Ly.currentLine(lines, 45), 0);
  assert.equal(Ly.currentLine(lines, 61), 2);
  assert.equal(Ly.currentLine(lines, 500), 3);
  assert.equal(Ly.cleanTrackTitle('Blackened (Remastered)'), 'Blackened');
  assert.equal(Ly.cleanTrackTitle('Song - Live at Wembley'), 'Song');
  assert.equal(Ly.cleanTrackTitle('Hit feat. Someone'), 'Hit');
  const calls = [];
  const fetchFn = async (url) => {
    calls.push(url);
    if (url.includes('/api/get')) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => [{ plainLyrics: 'a' }, { syncedLyrics: '[00:01.00] x', plainLyrics: 'x' }] };
  };
  const r = await Ly.fetchLyrics({ artist: 'A', title: 'T (Live)', duration: 200 }, fetchFn);
  assert.deepEqual(r.synced, [{ t: 1, text: 'x' }]);
  assert.ok(calls[0].includes('track_name=T') && calls[0].includes('duration=200'));
  assert.equal(await Ly.fetchLyrics({ artist: 'A', title: 'T' }, async (u) => (u.includes('/api/get') ? { ok: false, status: 404, json: async () => ({}) } : { ok: true, status: 200, json: async () => [] })), null);
});

test('artist image: exact name, most fans, no placeholder', () => {
  const res = [
    { name: 'Kino', nb_fan: 31, picture_medium: 'https://x/kino-small.jpg' },
    { name: 'Кино', nb_fan: 323314, picture_medium: 'https://x/kino.jpg' },
    { name: 'Кинопамять', nb_fan: 64, picture_medium: 'https://x/other.jpg' },
  ];
  assert.equal(Img.pickArtistImage('Кино', res), 'https://x/kino.jpg');
  assert.equal(Img.pickArtistImage('Kino', res), 'https://x/kino.jpg', 'translit equal → most popular');
  assert.equal(Img.pickArtistImage('Nobody', res), null);
  assert.equal(Img.pickArtistImage('X', [{ name: 'X', picture_medium: 'https://e-cdns-images.dzcdn.net/images/artist//250x250.jpg' }]), null);
});

// ---------- плейлист по треку и исполнителю ----------

test('radio by track starts with the track and mixes artist with similar genres', async () => {
  const { fetchFn } = fakeArchive();
  const seedTrack = NT('seed', { artist: 'jazz Band 1', tags: ['jazz'] });
  const r = await Reco.buildRadio({ kind: 'track', track: seedTrack }, lib(), { fetchFn, rand: R.seededRandom('r') });
  assert.equal(r[0].id, 'seed');
  assert.ok(r.length >= 10 && r.length <= Reco.RADIO_SIZE);
  assert.equal(new Set(r.map((t) => t.id)).size, r.length, 'no duplicates');
  const byArtist = await Reco.buildRadio({ kind: 'artist', name: 'Grateful Dead' }, lib(), { fetchFn, rand: R.seededRandom('a') });
  assert.ok(byArtist.length > 0 && byArtist.length <= Reco.RADIO_SIZE);
});
