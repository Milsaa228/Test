import type { Track } from './types';

// Жанры и исполнители для стартового экрана и рекомендаций.
// Запросы проверены на живом Internet Archive (workflow soundwave-live-check): у каждого жанра
// тысячи записей под Creative Commons, у каждого исполнителя — от ~10 до сотен свободных записей.

export type GenreDef = { id: string; name: string; query: string; color: string; keywords: string[] };

export const GENRES: GenreDef[] = [
  { id: 'electronic', name: 'Электроника', query: 'subject:(electronic OR electronica)', color: '#8D67AB', keywords: ['electronic', 'electronica', 'idm', 'synth'] },
  { id: 'rock', name: 'Рок', query: 'subject:(rock)', color: '#E13300', keywords: ['rock', 'indie rock', 'alternative', 'grunge'] },
  { id: 'jazz', name: 'Джаз', query: 'subject:(jazz)', color: '#1E3264', keywords: ['jazz', 'swing', 'bebop', 'big band'] },
  { id: 'hiphop', name: 'Хип-хоп', query: 'subject:("hip-hop" OR "hip hop" OR hiphop)', color: '#BA5D07', keywords: ['hip-hop', 'hip hop', 'hiphop', 'rap', 'boom bap', 'beats'] },
  { id: 'ambient', name: 'Эмбиент', query: 'subject:(ambient)', color: '#27856A', keywords: ['ambient', 'drone', 'chillout', 'downtempo'] },
  { id: 'classical', name: 'Классика', query: 'subject:(classical)', color: '#503750', keywords: ['classical', 'orchestra', 'symphony', 'baroque', 'sonata', 'opera'] },
  { id: 'pop', name: 'Поп', query: 'subject:(pop)', color: '#E8115B', keywords: ['pop', 'synthpop', 'indie pop', 'electropop'] },
  { id: 'lofi', name: 'Лоу-фай', query: 'subject:(lofi OR "lo-fi")', color: '#7D4B32', keywords: ['lofi', 'lo-fi', 'chillhop'] },
  { id: 'house', name: 'Хаус и техно', query: 'subject:(house OR techno)', color: '#0D73EC', keywords: ['house', 'techno', 'trance', 'dance', 'edm'] },
  { id: 'piano', name: 'Фортепиано', query: 'subject:(piano)', color: '#477D95', keywords: ['piano'] },
  { id: 'folk', name: 'Фолк', query: 'subject:(folk)', color: '#148A08', keywords: ['folk', 'country', 'americana'] },
  { id: 'acoustic', name: 'Акустика', query: 'subject:(acoustic)', color: '#5F8D4E', keywords: ['acoustic', 'guitar', 'singer-songwriter'] },
  { id: 'funk', name: 'Фанк и соул', query: 'subject:(funk OR soul)', color: '#D84000', keywords: ['funk', 'soul', 'r&b', 'disco'] },
  { id: 'metal', name: 'Метал', query: 'subject:(metal)', color: '#3A3A3A', keywords: ['metal', 'heavy metal', 'death metal', 'black metal'] },
  { id: 'punk', name: 'Панк', query: 'subject:(punk)', color: '#AF2896', keywords: ['punk', 'hardcore', 'post-punk'] },
  { id: 'blues', name: 'Блюз', query: 'subject:(blues)', color: '#2D46B9', keywords: ['blues'] },
  { id: 'reggae', name: 'Регги и даб', query: 'subject:(reggae)', color: '#1E8C45', keywords: ['reggae', 'dub', 'ska'] },
  { id: 'soundtrack', name: 'Саундтреки', query: 'subject:(soundtrack OR cinematic)', color: '#B49BC8', keywords: ['soundtrack', 'cinematic', 'score', 'film music', 'game music'] },
  { id: 'chiptune', name: 'Чиптюн', query: 'subject:(chiptune OR 8bit OR "8-bit")', color: '#F59B23', keywords: ['chiptune', '8bit', '8-bit', 'chip'] },
  { id: 'experimental', name: 'Эксперимент', query: 'subject:(experimental)', color: '#606060', keywords: ['experimental', 'noise', 'avant-garde'] },
];

export const genreById = (id: string) => GENRES.find((g) => g.id === id);

export type ArtistDef = { name: string; genre: string };

/** Исполнители со свободно распространяемой музыкой (CC или общественное достояние) в Internet Archive. */
export const ARTISTS: ArtistDef[] = [
  { name: 'Kevin MacLeod', genre: 'soundtrack' },
  { name: 'Blue Dot Sessions', genre: 'acoustic' },
  { name: 'Nine Inch Nails', genre: 'rock' },
  { name: 'Grateful Dead', genre: 'rock' },
  { name: 'Josh Woodward', genre: 'acoustic' },
  { name: 'Jonathan Coulton', genre: 'pop' },
  { name: 'Lee Rosevere', genre: 'ambient' },
  { name: 'Chris Zabriskie', genre: 'ambient' },
  { name: 'Kai Engel', genre: 'piano' },
  { name: 'Jahzzar', genre: 'electronic' },
  { name: 'Lobo Loco', genre: 'folk' },
  { name: 'Komiku', genre: 'chiptune' },
  { name: 'ProleteR', genre: 'hiphop' },
  { name: 'Boogie Belgique', genre: 'jazz' },
  { name: 'Chenard Walcker', genre: 'funk' },
  { name: 'Robert Kunin', genre: 'blues' },
  { name: 'Messian Dread', genre: 'reggae' },
  { name: 'Revolution Void', genre: 'jazz' },
  { name: 'Broke For Free', genre: 'electronic' },
  { name: 'Loyalty Freak Music', genre: 'lofi' },
  { name: 'Dee Yan-Key', genre: 'experimental' },
  { name: 'Mozart', genre: 'classical' },
  { name: 'Bach', genre: 'classical' },
  { name: 'Chopin', genre: 'piano' },
  { name: 'Beethoven', genre: 'classical' },
  { name: 'Tchaikovsky', genre: 'classical' },
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Ключевое слово должно стоять отдельным словом: «rap» не совпадёт с «trap» или «scrapbook».
const KEYWORD_RE = new Map(GENRES.map((g) => [g.id, new RegExp(`(^|[^\\p{L}\\p{N}])(${g.keywords.map(escapeRe).join('|')})($|[^\\p{L}\\p{N}])`, 'u')]));

/** Жанры трека: по его тегам (темы из Internet Archive) и полю genre. */
export function genresOfTrack(t: Pick<Track, 'tags' | 'genre'>): string[] {
  const hay = [...(t.tags ?? []), t.genre ?? ''].map((s) => s.toLowerCase());
  return GENRES.filter((g) => t.genre === g.id || hay.some((h) => KEYWORD_RE.get(g.id)!.test(h))).map((g) => g.id);
}
