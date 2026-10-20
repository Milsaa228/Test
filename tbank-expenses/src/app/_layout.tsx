import { Tabs } from 'expo-router/js-tabs';
import { StatusBar } from 'expo-status-bar';
import { Text } from 'react-native';

import { colors } from '../components/theme';
import { DataProvider } from '../context/DataContext';

function TabIcon({ glyph, focused }: { glyph: string; focused: boolean }) {
  return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.45 }}>{glyph}</Text>;
}

export default function RootLayout() {
  return (
    <DataProvider>
      <StatusBar style="dark" />
      <Tabs
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerShadowVisible: false,
          headerTitleStyle: { fontWeight: '700' },
          tabBarActiveTintColor: colors.text,
          tabBarInactiveTintColor: colors.muted,
          tabBarStyle: { backgroundColor: colors.card },
          sceneStyle: { backgroundColor: colors.bg },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Аналитика', tabBarIcon: ({ focused }) => <TabIcon glyph="📊" focused={focused} /> }} />
        <Tabs.Screen name="operations" options={{ title: 'Операции', tabBarIcon: ({ focused }) => <TabIcon glyph="🧾" focused={focused} /> }} />
        <Tabs.Screen name="settings" options={{ title: 'Источники', tabBarIcon: ({ focused }) => <TabIcon glyph="⚙️" focused={focused} /> }} />
      </Tabs>
    </DataProvider>
  );
}
