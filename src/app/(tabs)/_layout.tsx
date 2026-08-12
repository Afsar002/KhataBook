import { Slot, Tabs } from 'expo-router';
import { BarChart3, BookOpen, Home, NotebookPen, Settings } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Sidebar, type SidebarItem } from '@/components/sidebar';
import { InterFonts } from '@/constants/theme';
import { useResponsiveLayout } from '@/hooks/use-responsive';
import { useTheme } from '@/hooks/use-theme';

/**
 * Route → tab title/icon, kept in one place so renames are a one-liner.
 *
 * `index` is the Cashbook: expo-router resolves `/` to the `index` route, so
 * making the Cashbook the index (not the `initialRouteName` prop, which
 * expo-router overrides with the URL on cold start) is what makes the app
 * open on the Cashbook instead of Home. Home lives at `/home` right beside it.
 */
const TAB_META: SidebarItem[] = [
  { name: 'home', title: 'Home', Icon: Home },
  { name: 'index', title: 'Cashbook', Icon: NotebookPen },
  { name: 'khata', title: 'Khata', Icon: BookOpen },
  { name: 'reports', title: 'Reports', Icon: BarChart3 },
  { name: 'settings', title: 'Settings', Icon: Settings },
];

export default function TabsLayout() {
  const theme = useTheme();
  const { isWide } = useResponsiveLayout();

  // Wide windows (tablet landscape / desktop) swap the bottom tab bar for a
  // left navigation rail; the active tab renders into the Slot beside it.
  if (isWide) {
    return (
      <View style={[styles.desktopShell, { backgroundColor: theme.background }]}>
        <Sidebar items={TAB_META} />
        <View style={styles.desktopContent}>
          <Slot />
        </View>
      </View>
    );
  }

  return (
    <Tabs
      initialRouteName="index"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: { backgroundColor: theme.card, borderTopColor: theme.border },
        tabBarLabelStyle: { fontSize: 12, fontFamily: InterFonts.medium },
      }}>
      {TAB_META.map(({ name, title, Icon }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title,
            tabBarIcon: ({ color, size }) => <Icon size={size} color={color} />,
          }}
        />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  desktopShell: {
    flex: 1,
    flexDirection: 'row',
  },
  desktopContent: {
    flex: 1,
  },
});
