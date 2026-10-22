import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { colors } from '../components/theme';
import { LibraryProvider } from '../context/LibraryContext';
import { PlayerProvider } from '../context/PlayerContext';
import { RecoProvider } from '../context/RecoContext';
import { TrackMenuProvider } from '../context/TrackMenuContext';

export default function RootLayout() {
  return (
    <LibraryProvider>
      <PlayerProvider>
        <RecoProvider>
          <TrackMenuProvider>
            <StatusBar style="light" />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="collection/[id]" />
              <Stack.Screen name="net/[id]" />
              <Stack.Screen name="artist/[name]" />
              <Stack.Screen name="radio/[id]" />
              <Stack.Screen name="lyrics" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
              <Stack.Screen name="credits" />
              <Stack.Screen name="settings" />
              <Stack.Screen name="onboarding" options={{ animation: 'fade', gestureEnabled: false }} />
              <Stack.Screen name="player" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
              <Stack.Screen name="queue" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            </Stack>
          </TrackMenuProvider>
        </RecoProvider>
      </PlayerProvider>
    </LibraryProvider>
  );
}
