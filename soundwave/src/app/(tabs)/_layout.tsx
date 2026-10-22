import { BottomTabBar, Tabs } from 'expo-router/js-tabs';

import { Icon } from '../../components/Icon';
import { MiniPlayer } from '../../components/MiniPlayer';
import { colors } from '../../components/theme';

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => (
        <>
          <MiniPlayer />
          <BottomTabBar {...props} />
        </>
      )}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.bg },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Главная', tabBarIcon: ({ color }) => <Icon name="home" size={24} color={color} /> }} />
      <Tabs.Screen name="search" options={{ title: 'Поиск', tabBarIcon: ({ color }) => <Icon name="search" size={24} color={color} /> }} />
      <Tabs.Screen name="library" options={{ title: 'Медиатека', tabBarIcon: ({ color }) => <Icon name="library" size={24} color={color} /> }} />
    </Tabs>
  );
}
