/** Friendly empty state with icon and message. */
import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  message?: string;
};

export function EmptyState({ icon: Icon, title, message }: EmptyStateProps) {
  const theme = useTheme();

  return (
    <View style={styles.wrap}>
      {Icon ? (
        <View style={[styles.iconWrap, { backgroundColor: theme.backgroundElement }]}>
          <Icon size={32} color={theme.textSecondary} />
        </View>
      ) : null}
      <ThemedText type="default" style={styles.title}>
        {title}
      </ThemedText>
      {message ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.message}>
          {message}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.six,
    paddingHorizontal: Spacing.four,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  title: {
    fontFamily: 'Inter_600SemiBold',
    textAlign: 'center',
  },
  message: {
    textAlign: 'center',
  },
});
