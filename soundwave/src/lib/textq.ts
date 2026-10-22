// Разбор поискового запроса: кириллица ↔ латиница, неверная раскладка, русские написания иностранных имён.
// Каталоги (Deezer, Internet Archive) ищут буквально: «Металлика» не находит Metallica, а «kino» — группу «Кино».
// Поэтому ищем по нескольким вариантам запроса и сводим результаты.

const RU_LAYOUT = 'йцукенгшщзхъфывапролджэячсмитьбю.ё';
const EN_LAYOUT = "qwertyuiop[]asdfghjkl;'zxcvbnm,./`";

export const hasCyrillic = (s: string) => /[а-яё]/i.test(s);
export const hasLatin = (s: string) => /[a-z]/i.test(s);

/** Для сравнения: нижний регистр, ё→е, без пунктуации и артикля the. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/^the\s+/, '')
    .trim();
}

/** Текст, набранный не в той раскладке: «vtnfkkbrf» → «металлика», «ьуефддшсф» → «metallica». */
export function swapLayout(s: string): string {
  const lower = s.toLowerCase();
  let out = '';
  for (const ch of lower) {
    const ri = RU_LAYOUT.indexOf(ch);
    const ei = EN_LAYOUT.indexOf(ch);
    out += ri >= 0 ? EN_LAYOUT[ri] : ei >= 0 ? RU_LAYOUT[ei] : ch;
  }
  return out;
}

const RU_EN: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
  р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/** Русские буквы → латиница по-английски: «эминем» → «eminem», «скриптонит» → «skriptonit», «джей» → «jay». */
export function ruToLatin(s: string): string {
  const t = s
    .toLowerCase()
    .replace(/дж/g, 'j')
    .replace(/кс/g, 'x')
    .replace(/ай(?![аеиоуыэюя])/g, 'ai')
    .replace(/ей(?![аеиоуыэюя])/g, 'ey');
  let out = '';
  for (const ch of t) out += RU_EN[ch] ?? ch;
  return out;
}

const EN_RU_MULTI: [RegExp, string][] = [
  [/shch|sch/g, 'щ'], [/zh/g, 'ж'], [/kh/g, 'х'], [/ch/g, 'ч'], [/sh/g, 'ш'], [/ts/g, 'ц'], [/yo/g, 'ё'], [/yu/g, 'ю'], [/ya/g, 'я'], [/ye/g, 'е'],
  [/iy\b/g, 'ий'], [/y\b/g, 'й'], [/x/g, 'кс'], [/ph/g, 'ф'], [/th/g, 'т'], [/w/g, 'в'], [/q/g, 'к'],
];
const EN_RU: Record<string, string> = {
  a: 'а', b: 'б', c: 'к', d: 'д', e: 'е', f: 'ф', g: 'г', h: 'х', i: 'и', j: 'дж', k: 'к', l: 'л', m: 'м', n: 'н', o: 'о', p: 'п',
  r: 'р', s: 'с', t: 'т', u: 'у', v: 'в', y: 'ы', z: 'з',
};

/** Латиница → кириллица: «kino» → «кино», «basta» → «баста», «zemfira» → «земфира». */
export function latinToRu(s: string): string {
  let t = s.toLowerCase();
  for (const [re, to] of EN_RU_MULTI) t = t.replace(re, to);
  let out = '';
  for (const ch of t) out += EN_RU[ch] ?? ch;
  return out;
}

/**
 * Популярные иностранные исполнители в русском написании (несколько вариантов на имя).
 * Каталоги их не находят ни по-русски, ни по транслиту («рианна» → rianna ≠ Rihanna).
 */
const RU_NAMES: Record<string, string[]> = {
  Metallica: ['металлика', 'металика'],
  Eminem: ['эминем', 'эменем'],
  Rihanna: ['рианна', 'рианa', 'риана'],
  'Imagine Dragons': ['имаджин драгонс', 'имэджин драгонс', 'имеджин драгонс', 'имаджин дрэгонс', 'имеджин дрэгонс'],
  'Billie Eilish': ['билли айлиш', 'били айлиш', 'билли эйлиш'],
  'The Weeknd': ['уикенд', 'викенд', 'уикэнд', 'зе уикенд', 'вийкенд'],
  'Taylor Swift': ['тейлор свифт', 'тэйлор свифт'],
  Drake: ['дрейк', 'дрэйк'],
  Beyoncé: ['бейонсе', 'бионсе', 'бейонс'],
  Adele: ['адель', 'адэль'],
  'Ed Sheeran': ['эд ширан', 'ширан'],
  'Lady Gaga': ['леди гага', 'гага'],
  'Bruno Mars': ['бруно марс'],
  'Dua Lipa': ['дуа липа'],
  'Ariana Grande': ['ариана гранде'],
  'Justin Bieber': ['джастин бибер', 'бибер'],
  'Post Malone': ['пост малон', 'пост мэлоун'],
  'Travis Scott': ['трэвис скотт', 'тревис скотт'],
  'Kanye West': ['канье уэст', 'канье вест', 'канье'],
  'Kendrick Lamar': ['кендрик ламар'],
  'Linkin Park': ['линкин парк'],
  Nirvana: ['нирвана'],
  Queen: ['квин', 'куин'],
  'The Beatles': ['битлз', 'битлс', 'битлы'],
  'The Rolling Stones': ['роллинг стоунз', 'роллинг стоунс'],
  'Pink Floyd': ['пинк флойд'],
  'Led Zeppelin': ['лед зеппелин'],
  'AC/DC': ['эйси диси', 'асидиси', 'ac dc', 'эйсидиси'],
  'Guns N\' Roses': ['ганз н роузес', 'ганс энд роузес', 'ганз энд роузес'],
  'Red Hot Chili Peppers': ['ред хот чили пепперс', 'рхчп'],
  Coldplay: ['колдплей', 'колдплэй'],
  'Arctic Monkeys': ['арктик манкис', 'арктик монкис'],
  Rammstein: ['рамштайн', 'раммштайн', 'рамштаин'],
  'Depeche Mode': ['депеш мод', 'депешмод'],
  'Michael Jackson': ['майкл джексон'],
  Madonna: ['мадонна'],
  'Britney Spears': ['бритни спирс'],
  'Lana Del Rey': ['лана дель рей', 'лана дел рей'],
  'The Neighbourhood': ['зе нейборхуд', 'нейборхуд'],
  'Twenty One Pilots': ['твенти уан пайлотс', 'твенти ван пайлотс'],
  'Green Day': ['грин дэй', 'грин дей'],
  'Linkin': ['линкин'],
  'Maroon 5': ['марун 5', 'марун файв'],
  Sia: ['сиа', 'сия'],
  'Shakira': ['шакира'],
  'Daft Punk': ['дафт панк'],
  'David Guetta': ['давид гетта', 'дэвид гетта'],
  Avicii: ['авичи', 'авиччи'],
  Skillet: ['скиллет'],
  Slipknot: ['слипнот'],
  'System of a Down': ['систем оф э даун', 'соад'],
  'The Prodigy': ['продиджи', 'зе продиджи'],
  'Bring Me the Horizon': ['бринг ми зе хорайзон', 'бмтх'],
  'BTS': ['бтс', 'битиэс'],
  'BLACKPINK': ['блэкпинк', 'блекпинк'],
  'Doja Cat': ['доджа кэт', 'доджа кет'],
  'SZA': ['сза'],
  'Bad Bunny': ['бэд банни', 'бед банни'],
  'The Chainsmokers': ['чейнсмокерс', 'зе чейнсмокерс'],
  Marshmello: ['маршмеллоу', 'маршмело'],
  'Lil Peep': ['лил пип'],
  XXXTENTACION: ['икс икс икс тентасьон', 'тентасьон', 'ххх'],
  'Frank Sinatra': ['фрэнк синатра', 'синатра'],
  'Elvis Presley': ['элвис пресли', 'элвис'],
  'Bob Marley': ['боб марли'],
  Mozart: ['моцарт'],
  Beethoven: ['бетховен'],
  Bach: ['бах'],
  Chopin: ['шопен'],
  Tchaikovsky: ['чайковский'],
  Vivaldi: ['вивальди'],
  'Hans Zimmer': ['ханс циммер', 'ганс циммер'],
  Scorpions: ['скорпионс', 'скорпионз'],
  'Bon Jovi': ['бон джови'],
  'Iron Maiden': ['айрон мэйден', 'айрон мейден'],
  'Black Sabbath': ['блэк саббат', 'блек сабат'],
  'Ozzy Osbourne': ['оззи осборн'],
  'Billy Joel': ['билли джоэл'],
  'Elton John': ['элтон джон'],
  'Stromae': ['стромае'],
  'Måneskin': ['манескин', 'монэскин'],
  'Kygo': ['кайго'],
  'Calvin Harris': ['кельвин харрис', 'калвин харрис'],
  'The Killers': ['зе киллерс', 'киллерс'],
  'Muse': ['мьюз', 'мюз'],
  'Radiohead': ['радиохед', 'рэдиохед'],
  'Oasis': ['оазис'],
  'U2': ['ю ту', 'юту'],
  'ABBA': ['абба'],
  'Modern Talking': ['модерн токинг'],
  'Enigma': ['энигма'],
  // Исполнители стартового экрана (свободная музыка в Internet Archive).
  'Kevin MacLeod': ['кевин маклауд', 'кевин маклеод', 'кевин маклеуд'],
  'Blue Dot Sessions': ['блю дот сешнс', 'блю дот сессионс'],
  'Nine Inch Nails': ['найн инч нейлз', 'найн инч нэйлз', 'найн инч нейлс'],
  'Grateful Dead': ['грейтфул дэд', 'грейтфул дед', 'грэйтфул дэд'],
  'Josh Woodward': ['джош вудворд'],
  'Jonathan Coulton': ['джонатан коултон', 'джонатан колтон'],
  'Lee Rosevere': ['ли роузвир', 'ли розвир'],
  'Chris Zabriskie': ['крис забриски'],
  'Kai Engel': ['кай энгель', 'кай энгел'],
  'Jahzzar': ['джаззар', 'джахзар'],
  'Lobo Loco': ['лобо локо'],
  'Komiku': ['комику'],
  'ProleteR': ['пролетер', 'пролитер'],
  'Boogie Belgique': ['буги бельжик', 'буги бельгик'],
  'Chenard Walcker': ['шенар валкер', 'ченард уолкер'],
  'Robert Kunin': ['роберт кунин'],
  'Messian Dread': ['мессиан дред'],
  'Revolution Void': ['революшн войд', 'революшен войд'],
  'Broke For Free': ['броук фор фри', 'брок фор фри'],
  'Loyalty Freak Music': ['лоялти фрик мьюзик'],
  'Dee Yan-Key': ['ди ян ки', 'диянки'],
};

const DICT: { canon: string; key: string }[] = Object.entries(RU_NAMES).flatMap(([canon, list]) => list.map((v) => ({ canon, key: normalize(v) })));

/** Расстояние Левенштейна (для опечаток в русских написаниях). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** Каноническое имя из словаря: точное совпадение, опечатка (до 1–2 букв) или начало запроса («уикенд blinding lights»). */
export function dictionaryName(query: string): string | null {
  const q = normalize(query);
  if (!q || !hasCyrillic(q)) return null;
  let best: { canon: string; d: number } | null = null;
  for (const { canon, key } of DICT) {
    if (q === key || q.startsWith(`${key} `)) return canon;
    const limit = key.length >= 9 ? 2 : key.length >= 5 ? 1 : 0;
    const d = levenshtein(q, key);
    if (d <= limit && (!best || d < best.d)) best = { canon, d };
  }
  return best?.canon ?? null;
}

/** Похоже ли на слово, набранное в неверной раскладке (латиница со знаками ;[,. или кириллица из сплошных «ь,ъ,ж»…). */
function looksLikeWrongLayout(s: string): boolean {
  const swapped = swapLayout(s);
  if (hasLatin(s) && !hasCyrillic(s)) {
    // В латинском слове 4+ согласных подряд или «неанглийские» символы раскладки — вероятно, это русский текст.
    return /[;\[\]',.`]/.test(s) || /[bcdfghjklmnpqrstvwxz]{4,}/i.test(s.replace(/\s/g, ''));
  }
  if (hasCyrillic(s) && !hasLatin(s)) {
    // «ьуефддшсф»: в начале слова «ь/ъ/ы» или 3+ гласных-«ь» — русских слов так почти не бывает.
    return /(^|\s)[ьъы]/.test(s.toLowerCase()) || /[ьъ]{2}/.test(s) || swapped.length > 0 && /^[a-z\s]+$/.test(swapped) && /(^|\s)[ьъ]/.test(s.toLowerCase());
  }
  return false;
}

/**
 * Варианты запроса в порядке надёжности (без дубликатов, максимум 4):
 * исходный → имя из словаря → исправленная раскладка → транслит в другую сторону.
 */
export function queryVariants(query: string): string[] {
  const q = query.trim().replace(/\s+/g, ' ');
  if (!q) return [];
  const out: string[] = [q];
  const dict = dictionaryName(q);
  if (dict) out.push(dict);
  if (looksLikeWrongLayout(q)) {
    const swapped = swapLayout(q);
    out.push(swapped);
    const dictSwapped = dictionaryName(swapped);
    if (dictSwapped) out.push(dictSwapped);
  }
  if (hasCyrillic(q) && !hasLatin(q)) out.push(ruToLatin(q));
  else if (hasLatin(q) && !hasCyrillic(q)) out.push(latinToRu(q));
  const seen = new Set<string>();
  return out.filter((v) => {
    const k = normalize(v);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 4);
}

/** Насколько строка совпадает с одним из вариантов запроса (0…1): для ранжирования сведённых результатов. */
export function matchScore(name: string, variants: string[]): number {
  const n = normalize(name);
  const nl = ruToLatin(n);
  let best = 0;
  for (const v of variants) {
    const k = normalize(v);
    if (!k) continue;
    for (const cand of [n, nl]) {
      if (cand === k || cand === ruToLatin(k)) return 1;
      if (cand.startsWith(k) || k.startsWith(cand)) best = Math.max(best, 0.7);
      else if (cand.includes(k)) best = Math.max(best, 0.5);
      else {
        const d = levenshtein(cand, ruToLatin(k));
        if (d <= Math.max(1, Math.floor(k.length / 5))) best = Math.max(best, 0.6);
      }
    }
  }
  return best;
}

/** Совпадает ли текст с запросом с учётом транслита (для поиска по своей медиатеке). */
export function fuzzyIncludes(haystack: string, query: string): boolean {
  const words = normalize(query).split(' ').filter(Boolean);
  if (!words.length) return false;
  const h = normalize(haystack);
  const hl = ruToLatin(h);
  return words.every((w) => h.includes(w) || hl.includes(ruToLatin(w)) || hl.includes(w));
}
