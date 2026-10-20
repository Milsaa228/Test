import { Tabs } from 'expo-router/js-tabs';
import { Text } from 'react-native';

import { colors } from '../../components/theme';

function TabIcon({ glyph, focused }: { glyph: string; focused: boolean }) {
  return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.45 }}>{glyph}</Text>;
}

export default function TabsLayout() {
  return (
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
      <Tabs.Screen name="index" options={{ title: 'Карта', tabBarIcon: ({ focused }) => <TabIcon glyph="🗺️" focused={focused} /> }} />
      <Tabs.Screen name="list" options={{ title: 'Рядом', tabBarIcon: ({ focused }) => <TabIcon glyph="📋" focused={focused} /> }} />
      <Tabs.Screen name="settings" options={{ title: 'Настройки', tabBarIcon: ({ focused }) => <TabIcon glyph="⚙️" focused={focused} /> }} />
    </Tabs>
  );
}
