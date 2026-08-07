/**
 * Desktop/tablet navigation rail.
 *
 * Replaces the bottom tab bar on wide windows (see `useIsWide`). Vertical
 * icon + label items for the five tabs, with an active highlight and web hover
 * states. Kept as dumb as possible: the caller passes the same tab metadata
 * the bottom-bar `Tabs` navigator uses, so both layouts stay in lockstep.
 */
import { router, usePathname, type Href } from 'expo-router';
import type { LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { InterFonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type SidebarItem = {
  name: string;
  title: string;
  Icon: LucideIcon;
};

/** Width of the rail; content columns sit to its right. */
export const SidebarWidth = 240;

/** Route path → tab `name`, so the active item follows the URL. */
function activeTabName(pathname: string): string {
  if (pathname === '/') {
    return 'index';
  }
  return pathname.split('/')[1] || 'index';
}

/** Typed href per tab so `router.navigate` stays route-validated. */
const TAB_HREFS: Record<string, Href> = {
  index: '/',
  history: '/history',
  khata: '/khata',
  reports: '/reports',
  settings: '/settings',
};

export function Sidebar({ items }: { items: SidebarItem[] }) {
  const theme = useTheme();
  const pathname = usePathname();
  const active = activeTabName(pathname);

  return (
    <View style={[styles.rail, { backgroundColor: theme.card, borderRightColor: theme.border }]}>
      <View style={styles.brand}>
        <View style={[styles.brandMark, { backgroundColor: theme.primary }]}>
          <Text style={styles.brandMarkText}>K</Text>
        </View>
        <Text style={[styles.brandName, { color: theme.text }]}>DailyKhata</Text>
      </View>

      <View style={styles.nav}>
        {items.map(({ name, title, Icon }) => {
          const isActive = name === active;
          return (
            <Pressable
              key={name}
              onPress={() => router.navigate(TAB_HREFS[name])}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={title}
              style={({ hovered }) => [
                styles.item,
                isActive && { backgroundColor: theme.primarySoft },
                hovered && !isActive && { backgroundColor: theme.backgroundElement },
              ]}>
              <Icon
                size={20}
                color={isActive ? theme.primary : theme.textSecondary}
                strokeWidth={isActive ? 2.4 : 2}
              />
              <Text
                style={[
                  styles.itemLabel,
                  {
                    color: isActive ? theme.primary : theme.textSecondary,
                    fontFamily: isActive ? InterFonts.semibold : InterFonts.medium,
                  },
                ]}>
                {title}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    width: SidebarWidth,
    borderRightWidth: 1,
    paddingVertical: Spacing.four,
    paddingHorizontal: Spacing.three,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingBottom: Spacing.four,
    marginBottom: Spacing.two,
  },
  brandMark: {
    width: 36,
    height: 36,
    borderRadius: Radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMarkText: {
    color: '#FFFFFF',
    fontFamily: InterFonts.bold,
    fontSize: 18,
  },
  brandName: {
    fontFamily: InterFonts.bold,
    fontSize: 17,
  },
  nav: {
    gap: Spacing.one,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two + 4,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.input,
  },
  itemLabel: {
    fontSize: 15,
  },
});
