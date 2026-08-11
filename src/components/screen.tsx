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
  /**
   * True when this screen is rendered inside the bottom tab navigator. The tab
   * bar already extends to the bottom safe-area inset, so the screen must NOT
   * re-apply it — otherwise a blank gap opens between the last item and the tab
   * bar. Leave false for pushed/modal screens, which own their whole window.
   */
  hasTabBar?: boolean;
};

export function Screen({ children, scroll = true, hasTabBar = false }: ScreenProps) {
  const theme = useTheme();
  const { contentMaxWidth, isWide } = useResponsiveLayout();

  // Wider column once the sidebar layout is active, so desktop screens use the
  // extra width instead of staying a phone-sized strip.
  // Non-scroll screens need flex:1 here so their children's own flex:1 columns
  // can fill the window — otherwise the wrapper sizes to content and sticky
  // bottom actions collapse up under the list instead of pinning to the bottom.
  const content = (
    <View style={[styles.content, !scroll && styles.contentFill, { maxWidth: contentMaxWidth }]}>
      {children}
    </View>
  );

  // Wide windows swap the tab bar for a sidebar, so the screen is full-window
  // again and the bottom inset belongs to the screen once more.
  const tabBarOwnsBottom = hasTabBar && !isWide;

  // KeyboardAvoidingView for Android to prevent keyboard overlap
  const keyboardBehavior = Platform.OS === 'android' ? 'padding' : 'height';

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: theme.background }]}
      edges={tabBarOwnsBottom ? ['top', 'left', 'right'] : undefined}>
      <KeyboardAvoidingView
        behavior={keyboardBehavior}
        style={styles.keyboardAvoiding}
        keyboardVerticalOffset={0}
      >
        {scroll ? (
          <ScrollView
            contentContainerStyle={[styles.scroll, tabBarOwnsBottom && styles.scrollTabSafe]}
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
  // The tab bar owns the bottom inset; only a small breathing gap is needed
  // above it instead of the generous stack-screen bottom padding.
  scrollTabSafe: {
    paddingBottom: Spacing.three,
  },
  content: {
    width: '100%',
    gap: Spacing.three,
  },
  // Only applied when scroll={false}: lets a screen fill the window so a
  // flex:1 body + sticky bottom actions lay out correctly.
  contentFill: {
    flex: 1,
  },
});
