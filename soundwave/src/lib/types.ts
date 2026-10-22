export type Track = {
  id: string;
  title: string;
  artist: string;
  album: string;
  /** asset:<файл> — встроенный трек, file://… — файл на устройстве, https://… — поток из интернета. */
  uri: string;
  /** Длительность в секундах, если известна заранее. */
  duration?: number;
  /** Два цвета градиента обложки. */
  colors: [string, string];
  genre?: string;
  /** Файл, сохранённый на устройстве. */
  local?: boolean;
  /** Трек из интернета, который играет потоком. */
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

export type LibraryState = {
  liked: string[];
  playlists: Playlist[];
  recent: string[];
  /** Добавленные пользователем треки: файлы и треки из интернета. */
  localTracks: Track[];
  /** Длительности, которые плеер узнал при воспроизведении. */
  durations: Record<string, number>;
};

export type Collection = {
  id: string;
  kind: 'playlist' | 'album' | 'artist' | 'liked' | 'local' | 'genre';
  title: string;
  subtitle: string;
  colors: [string, string];
  tracks: Track[];
  /** Пользовательский плейлист: можно удалять треки и сам плейлист. */
  editable: boolean;
};
