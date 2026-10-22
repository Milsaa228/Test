export type Track = {
  id: string;
  title: string;
  artist: string;
  album: string;
  uri: string;
  /** Длительность в секундах, если известна заранее. */
  duration?: number;
  /** Два цвета градиента обложки. */
  colors: [string, string];
  genre?: string;
  local?: boolean;
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
