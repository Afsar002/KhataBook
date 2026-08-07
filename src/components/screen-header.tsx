/**
 * Shared screen header: a top-left back button + title (and optional right-side
 * actions). Standardizes the hand-rolled header rows that used to be copied
 * into every pushed screen. Back defaults to `router.back()`; override with
 * `onBack` when the screen needs custom behavior (e.g. unsaved-changes guard).
 */
import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ScreenHeaderProps = {
  title: string;
  /** Optional helper text under the title (e.g. "Choose a customer"). */
  subtitle?: string;
  /** Optional element rendered before the title (e.g. an icon bubble). */
  leading?: ReactNode;
  /** Right-side actions (buttons, icons) rendered after the title. */
  right?: ReactNode;
  /** Override the default `router.back()`. */
  onBack?: () => void;
  /** Accessibility label for the back button. */
  backLabel?: string;
};

export function ScreenHeader({
  title,
  subtitle,
  leading,
  right,
  onBack,
  backLabel = 'Back',
}: ScreenHeaderProps) {
  const theme = useTheme();

  return (
    <View style={styles.header}>
      <Pressable
        onPress={onBack ?? (() => router.back())}
        accessibilityRole="button"
        accessibilityLabel={backLabel}
        hitSlop={8}
        style={styles.back}>
        <ChevronLeft size={28} color={theme.text} />
      </Pressable>
      {leading}
      <View style={styles.titleWrap}>
        <ThemedText type="subtitle" numberOfLines={1}>
          {title}
        </ThemedText>
        {subtitle ? (
          <ThemedText type="small" themeColor="textSecondary">
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  back: {
    paddingVertical: Spacing.one,
    paddingRight: Spacing.two,
    marginLeft: -Spacing.two,
  },
  titleWrap: {
    flex: 1,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
