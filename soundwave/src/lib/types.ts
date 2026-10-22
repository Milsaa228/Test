export type Track = {
  id: string;
  title: string;
  artist: string;
  album: string;
  /** https://… — поток из интернета, file://… — скачанный или импортированный файл. */
  uri: string;
  /** Исходная ссылка на поток (сохраняется после скачивания, чтобы можно было удалить файл и слушать снова онлайн). */
  remoteUri?: string;
  /** Длительность в секундах, если известна заранее. */
  duration?: number;
  /** Два цвета градиента обложки. */
  colors: [string, string];
  /** id жанра из genres.ts, если известен. */
  genre?: string;
  /** Темы (subject) из Internet Archive — по ним определяется жанр для рекомендаций. */
  tags?: string[];
  /** Файл на устройстве: скачан или импортирован. */
  local?: boolean;
  /** Трек из интернета. */
  online?: boolean;
  /** Ссылка на лицензию и страница источника — для указания авторства. */
  license?: string;
  sourceUrl?: string;
};

export type Playlist = {
  id: string;
  name: string;
  description?: string;
  trackIds: string[];
  colors: [string, string];
  createdAt: number;
};

export type RepeatMode = 'off' | 'all' | 'one';

/** Краткие сведения о треке для статистики и «не нравится» (без ссылки на файл). */
export type TrackStat = { artist: string; tags?: string[]; genre?: string; plays: number; skips: number; last: number };
export type Disliked = { id: string; artist: string; tags?: string[]; genre?: string };

export type Prefs = { genres: string[]; artists: string[]; onboarded: boolean };
export type Settings = { offline: boolean; autoDownloadLiked: boolean };

export type LibraryState = {
  liked: string[];
  disliked: Disliked[];
  playlists: Playlist[];
  /** Последние прослушанные треки целиком (могут быть и не сохранены в медиатеке). */
  recentTracks: Track[];
  /** Треки в медиатеке: сохранённые из интернета (поток), скачанные и импортированные. */
  localTracks: Track[];
  /** Длительности, которые плеер узнал при воспроизведении. */
  durations: Record<string, number>;
  stats: Record<string, TrackStat>;
  prefs: Prefs;
  settings: Settings;
};

export type Collection = {
  id: string;
  kind: 'playlist' | 'artist' | 'album' | 'liked' | 'local' | 'mix' | 'recent';
  title: string;
  subtitle: string;
  colors: [string, string];
  tracks: Track[];
  /** Пользовательский плейлист: можно удалять треки и сам плейлист. */
  editable: boolean;
};
