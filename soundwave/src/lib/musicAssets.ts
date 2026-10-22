import type { AudioSource } from 'expo-audio';

import type { Track } from './types';

// Встроенные треки (Metro упаковывает их в приложение — играют без интернета).
const MUSIC_ASSETS: Record<string, number> = {
  'local-forecast-elevator.mp3': require('../../assets/music/local-forecast-elevator.mp3'),
  'monkeys-spinning-monkeys.mp3': require('../../assets/music/monkeys-spinning-monkeys.mp3'),
  'bossa-antigua.mp3': require('../../assets/music/bossa-antigua.mp3'),
  'itty-bitty-8-bit.mp3': require('../../assets/music/itty-bitty-8-bit.mp3'),
  'gymnopedie-no-1.mp3': require('../../assets/music/gymnopedie-no-1.mp3'),
  'hyperfun.mp3': require('../../assets/music/hyperfun.mp3'),
  'galway.mp3': require('../../assets/music/galway.mp3'),
  'sneaky-snitch.mp3': require('../../assets/music/sneaky-snitch.mp3'),
  'funky-chunk.mp3': require('../../assets/music/funky-chunk.mp3'),
  'night-on-the-docks-sax.mp3': require('../../assets/music/night-on-the-docks-sax.mp3'),
  'volatile-reaction.mp3': require('../../assets/music/volatile-reaction.mp3'),
  'dreamer.mp3': require('../../assets/music/dreamer.mp3'),
};

/** Источник для expo-audio: встроенный файл, файл на устройстве или поток по ссылке. */
export function audioSource(track: Track): AudioSource {
  if (track.uri.startsWith('asset:')) return MUSIC_ASSETS[track.uri.slice(6)] ?? null;
  return { uri: track.uri };
}
