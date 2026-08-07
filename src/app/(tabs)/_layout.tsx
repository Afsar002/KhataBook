import { Tabs } from 'expo-router';
import { BarChart3, BookOpen, History, Home, Settings, type LucideIcon } from 'lucide-react-native';

import { InterFonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Route → tab title/icon, kept in one place so renames are a one-liner. */
const TAB_META: { name: string; title: string; Icon: LucideIcon }[] = [
  { name: 'index', title: 'Home', Icon: Home },
  { name: 'history', title: 'History', Icon: History },
  { name: 'khata', title: 'Khata', Icon: BookOpen },
  { name: 'reports', title: 'Reports', Icon: BarChart3 },
  { name: 'settings', title: 'Settings', Icon: Settings },
];

export default function TabsLayout() {
  const theme = useTheme();

  return (
    <Tabs
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
