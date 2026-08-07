/**
 * First-run tutorial — a short, swipeable guide to the app's main ideas.
 *
 * Shown once per device (flag in AsyncStorage). Reaching the last step marks
 * it complete; "Skip" dismisses it immediately.
 */
import { router } from 'expo-router';
import { Cloud, Scale, Store, Users, Wallet, X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import {
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LargeButton } from '@/components/large-button';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { setOnboardingComplete } from '@/services/onboarding/prefs';
import { impact } from '@/utils/haptics';

const { width: viewportWidth } = Dimensions.get('window');

interface Step {
  icon: typeof Store;
  title: string;
  text: string;
  /** A second tint used for the icon bubble background. */
  soft: string;
  accent: string;
}

const STEPS: Step[] = [
  {
    icon: Store,
    title: 'Welcome to DailyKhata',
    text: "Your shop's accounts, kept simply. Track every rupee — income, expense, credit and cash — even without internet.",
    soft: '#E7F6EC',
    accent: '#16A34A',
  },
  {
    icon: Wallet,
    title: 'Record money in & out',
    text: 'Tap the + button on the Home screen to add income or expense. Pick an account, a category and a note — done in seconds.',
    soft: '#E7F6EC',
    accent: '#16A34A',
  },
  {
    icon: Users,
    title: 'Track credit given',
    text: 'Add customers and suppliers, then record Give / Receive (or Take / Pay). Each khata balance updates automatically.',
    soft: '#E7F6EC',
    accent: '#16A34A',
  },
  {
    icon: Scale,
    title: 'Reconcile your cash',
    text: 'Count the cash in hand at closing time. The Cash Book compares it with what the books expect, so nothing slips away.',
    soft: '#E7F6EC',
    accent: '#16A34A',
  },
  {
    icon: Cloud,
    title: 'Optional cloud sync',
    text: 'Sign in from Settings to keep your data safe and stay in sync across phones. Works fully offline too.',
    soft: '#E7F6EC',
    accent: '#16A34A',
  },
];

interface OnboardingScreenProps {
  /** Called after the tutorial is marked complete. The first-run gate renders
   * this screen inline and uses the callback to leave the tutorial; the route
   * is still reachable directly (e.g. deep link), in which case it is omitted. */
  onDone?: () => void;
}

export default function OnboardingScreen({ onDone }: OnboardingScreenProps) {
  const theme = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const last = page === STEPS.length - 1;

  const goTo = (index: number) => {
    impact('light');
    scrollRef.current?.scrollTo({ x: index * viewportWidth, animated: true });
  };

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / viewportWidth);
    if (next !== page) {
      setPage(next);
    }
  };

  const finish = () => {
    void setOnboardingComplete().then(() => {
      onDone?.();
      router.replace('/');
    });
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.skipRow}>
        <Pressable
          onPress={() => {
            impact('medium');
            finish();
          }}
          accessibilityRole="button"
          accessibilityLabel="Skip tutorial"
          hitSlop={8}
          style={styles.skip}>
          <X size={20} color={theme.textSecondary} />
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}>
        {STEPS.map((step, index) => {
          const Icon = step.icon;
          return (
            <View key={step.title} style={[styles.page, { width: viewportWidth }]}>
              <View style={[styles.iconBubble, { backgroundColor: step.soft }]}>
                <Icon size={44} color={step.accent} />
              </View>
              <ThemedText type="title" style={styles.stepTitle}>
                {step.title}
              </ThemedText>
              <ThemedText
                type="default"
                themeColor="textSecondary"
                style={styles.stepText}>
                {step.text}
              </ThemedText>
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.stepCount}>
                {index + 1} of {STEPS.length}
              </ThemedText>
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.dots}>
          {STEPS.map((step, index) => (
            <View
              key={step.title}
              style={[
                styles.dot,
                {
                  backgroundColor: index === page ? theme.primary : theme.border,
                  width: index === page ? 22 : 8,
                },
              ]}
            />
          ))}
        </View>
        <View style={styles.actions}>
          {page > 0 ? (
            <LargeButton
              title="Back"
              variant="outline"
              onPress={() => {
                impact('light');
                goTo(page - 1);
              }}
              style={styles.actionButton}
            />
          ) : null}
          <LargeButton
            title={last ? 'Get Started' : 'Next'}
            variant="primary"
            onPress={() => {
              impact(last ? 'medium' : 'light');
              if (last) {
                finish();
              } else {
                goTo(page + 1);
              }
            }}
            style={styles.actionButton}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  skipRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
  skip: {
    width: 40,
    height: 40,
    borderRadius: Radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  page: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.five,
    gap: Spacing.three,
  },
  iconBubble: {
    width: 112,
    height: 112,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  stepTitle: {
    textAlign: 'center',
  },
  stepText: {
    textAlign: 'center',
    lineHeight: 22,
  },
  stepCount: {
    marginTop: Spacing.two,
  },
  footer: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
    gap: Spacing.three,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.one,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  actionButton: {
    flex: 1,
  },
});
