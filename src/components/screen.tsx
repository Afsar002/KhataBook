/** Standard scrollable screen wrapper: safe area + centered max-width content. */
import { type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useResponsiveLayout } from '@/hooks/use-responsive';
import { useTheme } from '@/hooks/use-theme';

type ScreenProps = {
  children: ReactNode;
  scroll?: boolean;
};

export function Screen({ children, scroll = true }: ScreenProps) {
  const theme = useTheme();
  const { contentMaxWidth } = useResponsiveLayout();

  // Wider column once the sidebar layout is active, so desktop screens use the
  // extra width instead of staying a phone-sized strip.
  const content = <View style={[styles.content, { maxWidth: contentMaxWidth }]}>{children}</View>;

  // KeyboardAvoidingView for Android to prevent keyboard overlap
  const keyboardBehavior = Platform.OS === 'android' ? 'padding' : 'height';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        behavior={keyboardBehavior}
        style={styles.keyboardAvoiding}
        keyboardVerticalOffset={0}
      >
        {scroll ? (
          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled">
            {content}
          </ScrollView>
        ) : (
          content
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  keyboardAvoiding: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    padding: Spacing.three,
    paddingBottom: Spacing.seven,
  },
  content: {
    width: '100%',
    gap: Spacing.three,
  },
});
