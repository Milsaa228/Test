import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { colors } from '../components/theme';
import { DataProvider } from '../context/DataContext';

export default function RootLayout() {
  return (
    <DataProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerShadowVisible: false,
          headerTitleStyle: { fontWeight: '700' },
          headerTintColor: colors.text,
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="scan" options={{ title: 'Фото холодильника' }} />
        <Stack.Screen name="product" options={{ title: 'Продукт', presentation: 'modal' }} />
        <Stack.Screen name="recipe/[id]" options={{ title: 'Рецепт' }} />
      </Stack>
    </DataProvider>
  );
}
