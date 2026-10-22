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
  { id: 'ambient', name: 'Эмбиент', query: 'subject:(ambient)', color: '#27856A', keywords: ['ambient', 'drone', 'dark ambient'] },
  { id: 'classical', name: 'Классика', query: 'subject:(classical)', color: '#503750', keywords: ['classical', 'orchestra', 'symphony', 'baroque', 'sonata', 'opera'] },
  { id: 'pop', name: 'Поп', query: 'subject:(pop)', color: '#E8115B', keywords: ['pop', 'synthpop', 'indie pop', 'electropop'] },
  { id: 'lofi', name: 'Лоу-фай', query: 'subject:(lofi OR "lo-fi")', color: '#7D4B32', keywords: ['lofi', 'lo-fi', 'chillhop'] },
  { id: 'house', name: 'Хаус и техно', query: 'subject:(house OR techno)', color: '#0D73EC', keywords: ['house', 'techno', 'deep house', 'minimal'] },
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
  { id: 'rnb', name: 'R&B', query: 'subject:("r&b" OR rnb OR "rhythm and blues")', color: '#A0306B', keywords: ['r&b', 'rnb', 'rhythm and blues'] },
  { id: 'dance', name: 'Танцевальная', query: 'subject:(dance OR edm)', color: '#E91E63', keywords: ['dance', 'edm', 'club'] },
  { id: 'alternative', name: 'Альтернатива', query: 'subject:(alternative)', color: '#5D4037', keywords: ['alternative', 'alt rock'] },
  { id: 'indie', name: 'Инди', query: 'subject:(indie)', color: '#00897B', keywords: ['indie', 'indie rock', 'indie pop'] },
  { id: 'country', name: 'Кантри', query: 'subject:(country)', color: '#A1887F', keywords: ['country', 'bluegrass'] },
  { id: 'latin', name: 'Латина', query: 'subject:(latin OR salsa OR cumbia OR bossa)', color: '#FF7043', keywords: ['latin', 'salsa', 'cumbia', 'bossa', 'tango'] },
  { id: 'disco', name: 'Диско', query: 'subject:(disco)', color: '#D500F9', keywords: ['disco', 'nu disco'] },
  { id: 'trance', name: 'Транс', query: 'subject:(trance)', color: '#3D5AFE', keywords: ['trance', 'psytrance', 'goa'] },
  { id: 'dnb', name: 'Драм-н-бейс', query: 'subject:("drum and bass" OR "drum & bass" OR dnb OR jungle)', color: '#00B8D4', keywords: ['drum and bass', 'drum & bass', 'dnb', 'jungle'] },
  { id: 'dubstep', name: 'Дабстеп', query: 'subject:(dubstep)', color: '#64DD17', keywords: ['dubstep', 'bass music'] },
  { id: 'triphop', name: 'Трип-хоп', query: 'subject:("trip-hop" OR "trip hop" OR triphop)', color: '#6A1B9A', keywords: ['trip-hop', 'trip hop', 'triphop'] },
  { id: 'postrock', name: 'Пост-рок', query: 'subject:("post-rock" OR "post rock" OR postrock)', color: '#455A64', keywords: ['post-rock', 'post rock', 'postrock', 'shoegaze'] },
  { id: 'synthwave', name: 'Синтвейв', query: 'subject:(synthwave OR retrowave OR vaporwave)', color: '#FF4081', keywords: ['synthwave', 'retrowave', 'vaporwave', 'outrun'] },
  { id: 'chill', name: 'Чилл', query: 'subject:(chill OR chillout OR downtempo)', color: '#26A69A', keywords: ['chill', 'chillout', 'downtempo', 'relax'] },
  { id: 'instrumental', name: 'Инструментал', query: 'subject:(instrumental)', color: '#8D6E63', keywords: ['instrumental'] },
  { id: 'world', name: 'Музыка мира', query: 'subject:(world OR ethnic)', color: '#F9A825', keywords: ['world', 'ethnic', 'world music', 'african', 'celtic'] },
  { id: 'swing', name: 'Свинг', query: 'subject:(swing OR "big band")', color: '#BF360C', keywords: ['swing', 'big band', 'electro swing'] },
  { id: 'russian', name: 'На русском', query: 'subject:(russian OR русский OR русская OR "русский рок" OR "русский рэп")', color: '#C62828', keywords: ['russian', 'русский', 'русская', 'русский рок', 'русский рэп'] },
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
