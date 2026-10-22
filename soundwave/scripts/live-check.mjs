// Проверка рекомендаций на живом Internet Archive (запускается в GitHub Actions, где есть доступ к archive.org):
// компилирует src/lib, собирает миксы и порцию «Моей волны» реальным кодом приложения и печатает итог.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = mkdtempSync(join(tmpdir(), 'soundwave-live-'));
execFileSync('npx', ['tsc', '--outDir', out, '--module', 'commonjs', '--target', 'es2020', '--ignoreConfig', '--types', 'node', '--skipLibCheck', '--strict', 'src/lib/reco.ts', 'src/lib/images.ts', 'src/lib/lyrics.ts'], { stdio: 'inherit' });
writeFileSync(join(out, 'package.json'), '{"type":"commonjs"}');
const require = createRequire(join(out, 'x.js'));
const { EMPTY_LIBRARY } = require('./library.js');
const { buildMix, waveBatch, shelfItems, buildRadio } = require('./reco.js');
const { findArtistImage } = require('./images.js');
const { fetchLyrics } = require('./lyrics.js');
const { GENRES, ARTISTS } = require('./genres.js');
const { archiveTracks, searchArchive } = require('./archive.js');

const profiles = [
  { name: 'jazz+lofi', genres: ['jazz', 'lofi'], artists: [] },
  { name: 'rock artists', genres: [], artists: ['Nine Inch Nails', 'Grateful Dead'] },
  { name: 'classical', genres: ['classical', 'piano'], artists: ['Chopin'] },
  { name: 'nothing chosen', genres: [], artists: [] },
];
let failures = 0;
const fail = (msg) => {
  failures++;
  console.log('FAIL', msg);
};

for (const p of profiles) {
  const s = { ...EMPTY_LIBRARY, prefs: { genres: p.genres, artists: p.artists, onboarded: true } };
  const t0 = Date.now();
  try {
    const mix = await buildMix('day', s);
    const artists = new Set(mix.tracks.map((t) => t.artist));
    console.log(`\n== ${p.name}: day mix ${mix.tracks.length} tracks, ${artists.size} artists, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    for (const t of mix.tracks.slice(0, 8)) console.log(`  ${t.artist} — ${t.title} [${t.duration ?? '?'}s] ${t.license ?? 'NO LICENSE'}`);
    if (mix.tracks.length < 12) fail(`${p.name}: day mix too small (${mix.tracks.length})`);
    if (mix.tracks.some((t) => !t.license)) fail(`${p.name}: track without license`);

    // Лайкаем 5 треков из микса и проверяем, что следующий микс почти их не содержит.
    const liked = mix.tracks.slice(0, 5);
    const s2 = { ...s, localTracks: liked, liked: liked.map((t) => t.id) };
    const week = await buildMix('week', s2);
    const likedIn = week.tracks.filter((t) => s2.liked.includes(t.id)).length;
    console.log(`  week mix ${week.tracks.length} tracks, liked inside: ${likedIn}`);
    if (likedIn > Math.floor(week.tracks.length * 0.1)) fail(`${p.name}: too many liked in week mix`);

    const wave = await waveBatch(s2, { exclude: new Set() });
    console.log(`  wave batch ${wave.length}: ${wave.map((t) => t.artist).join(' | ')}`);
    if (wave.length < 4) fail(`${p.name}: wave batch too small`);
  } catch (e) {
    fail(`${p.name}: ${e.message}`);
  }
}

// Каждый жанр и исполнитель стартового экрана должен давать записи; у исполнителей проверяем и фото.
for (const g of GENRES) {
  const items = await shelfItems({ kind: 'genre', value: g.id }).catch(() => []);
  console.log(`genre ${g.id}: ${items.length} items`);
  if (items.length < 6) fail(`genre ${g.id}: only ${items.length} items`);
}
let withPhoto = 0;
for (const a of ARTISTS) {
  const items = await shelfItems({ kind: 'artist', value: a.name }).catch(() => []);
  const img = await findArtistImage(a.name).catch(() => null);
  if (img) withPhoto++;
  console.log(`artist ${a.name}: ${items.length} items, photo: ${img ? 'yes' : 'no'}`);
  if (items.length < 3) fail(`artist ${a.name}: only ${items.length} items`);
}
console.log(`artists with photo: ${withPhoto}/${ARTISTS.length}`);
if (withPhoto < ARTISTS.length / 2) fail('too few artist photos');

// Поиск с разбором текста: русское написание, транслит и неверная раскладка должны находить то же, что и оригинал.
for (const [q, expect] of [['моцарт', 'mozart'], ['Шопен', 'chopin'], ['vjwfhn', 'mozart'], ['бах', 'bach'], ['nine inch nails', 'nine inch nails'], ['найн инч нейлз', null]]) {
  const res = await searchArchive(q).catch((e) => (fail(`search ${q}: ${e.message}`), []));
  const hit = expect ? res.some((it) => `${it.title} ${it.creator}`.toLowerCase().includes(expect)) : null;
  console.log(`search "${q}": ${res.length} items${expect ? `, contains ${expect}: ${hit}` : ''}`);
  if (expect && !hit) fail(`search "${q}" did not find ${expect}`);
}

// Плейлисты по треку и по исполнителю.
{
  const s = { ...EMPTY_LIBRARY, prefs: { genres: ['jazz'], artists: [], onboarded: true } };
  const seedMix = await buildMix('day', s);
  const seedTrack = seedMix.tracks[0];
  const byTrack = await buildRadio({ kind: 'track', track: seedTrack }, s);
  console.log(`\nradio by track "${seedTrack.title}" (${seedTrack.artist}): ${byTrack.length} tracks, artists: ${new Set(byTrack.map((t) => t.artist)).size}`);
  if (byTrack.length < 10 || byTrack[0].id !== seedTrack.id) fail('radio by track');
  const byArtist = await buildRadio({ kind: 'artist', name: 'Kevin MacLeod' }, s);
  const own = byArtist.filter((t) => t.artist === 'Kevin MacLeod').length;
  console.log(`radio by artist Kevin MacLeod: ${byArtist.length} tracks, own: ${own}`);
  if (byArtist.length < 10 || own < 3) fail('radio by artist');
}

// Тексты песен.
for (const t of [{ artist: 'Кино', title: 'Группа крови' }, { artist: 'Metallica', title: 'Nothing Else Matters (Remastered)' }]) {
  const ly = await fetchLyrics(t).catch((e) => (fail(`lyrics ${t.title}: ${e.message}`), null));
  console.log(`lyrics ${t.artist} — ${t.title}: synced ${ly?.synced?.length ?? 0} lines, plain ${ly?.plain ? 'yes' : 'no'}`);
  if (!ly?.synced?.length) fail(`no synced lyrics for ${t.title}`);
}

// Обычный поиск и разбор метаданных.
const found = await searchArchive('jazz piano');
console.log(`\nsearch "jazz piano": ${found.length} items, first: ${found[0]?.title}`);
const meta = found[0] && (await archiveTracks(found[0].id));
console.log(`  ${meta?.tracks.length ?? 0} tracks, e.g. ${meta?.tracks[0]?.title} → ${meta?.tracks[0]?.uri}`);
if (!meta?.tracks.length) fail('search result has no tracks');
// Сам файл трека доступен (HEAD).
if (meta?.tracks[0]) {
  const res = await fetch(meta.tracks[0].uri, { method: 'HEAD', redirect: 'follow' });
  console.log(`  HEAD ${res.status} ${res.headers.get('content-type')}`);
  if (!res.ok) fail('track file not reachable');
}

console.log(failures ? `\n${failures} failure(s)` : '\nall live checks passed');
process.exit(failures ? 1 : 0);
