import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { colors } from '../components/theme';
import { LibraryProvider } from '../context/LibraryContext';
import { PlayerProvider } from '../context/PlayerContext';
import { TrackMenuProvider } from '../context/TrackMenuContext';

export default function RootLayout() {
  return (
    <LibraryProvider>
      <PlayerProvider>
        <TrackMenuProvider>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="collection/[id]" />
            <Stack.Screen name="player" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="queue" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          </Stack>
        </TrackMenuProvider>
      </PlayerProvider>
    </LibraryProvider>
  );
}
