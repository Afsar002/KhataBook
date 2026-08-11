/**
 * Report duration dropdown: a card trigger that opens the same bottom-sheet
 * pattern as the export sheets, listing the four durations. Reuses
 * `rangePresets()` bounds so the report range always matches the ledger feed.
 */
import { Check, ChevronDown } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { AnimationDuration, InterFonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { rangePresets } from '@/utils/date-range';

export type DurationKey = 'thisWeek' | 'thisMonth' | 'thisYear' | 'allTime';

const DURATIONS: { key: DurationKey; label: string }[] = [
  { key: 'thisMonth', label: 'This Month' },
  { key: 'thisWeek', label: 'This Week' },
  { key: 'thisYear', label: 'This Year' },
  { key: 'allTime', label: 'All Time' },
];

export const DEFAULT_DURATION: DurationKey = 'thisMonth';

/** Inclusive `YYYY-MM-DD` bounds for a duration; `{}` for All Time. */
export function durationBounds(key: DurationKey, now = new Date()): { from?: string; to?: string } {
  if (key === 'allTime') {
    return {};
  }
  const preset = rangePresets(now).find((p) => p.key === key);
  return preset ? { from: preset.from, to: preset.to } : {};
}

type DurationPickerProps = {
  value: DurationKey;
  onChange: (key: DurationKey) => void;
};

export function DurationPicker({ value, onChange }: DurationPickerProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [translateY] = useState(() => new Animated.Value(640));
  const [backdrop] = useState(() => new Animated.Value(0));

  const activeLabel = DURATIONS.find((d) => d.key === value)?.label ?? 'This Month';

  useEffect(() => {
    if (open) {
      Animated.parallel([
        Animated.timing(backdrop, { toValue: 1, duration: AnimationDuration, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: AnimationDuration, useNativeDriver: true }),
      ]).start();
    }
  }, [open, backdrop, translateY]);

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(backdrop, { toValue: 0, duration: 160, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 640, duration: 160, useNativeDriver: true }),
    ]).start(() => setOpen(false));
  };

  return (
    <>
      <Card style={styles.trigger} pad={false}>
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Select report duration"
          style={({ pressed }) => [styles.triggerPress, pressed && styles.pressed]}>
          <View>
            <ThemedText type="small" themeColor="textSecondary">
              Report duration
            </ThemedText>
            <ThemedText style={styles.triggerLabel}>{activeLabel}</ThemedText>
          </View>
          <ChevronDown size={20} color={theme.text} />
        </Pressable>
      </Card>

      <Modal transparent visible={open} statusBarTranslucent onRequestClose={dismiss}>
        <Animated.View style={[styles.backdrop, { backgroundColor: theme.overlay, opacity: backdrop }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} accessibilityLabel="Close" />
          <Animated.View style={[styles.sheet, { backgroundColor: theme.card, transform: [{ translateY }] }]}>
            <View style={[styles.handle, { backgroundColor: theme.border }]} />
            <ThemedText type="smallBold" style={styles.title}>
              Select report duration
            </ThemedText>

            <View style={styles.options}>
              {DURATIONS.map((d) => {
                const selected = d.key === value;
                return (
                  <Pressable
                    key={d.key}
                    onPress={() => {
                      onChange(d.key);
                      dismiss();
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    style={({ pressed }) => [
                      styles.optionRow,
                      { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                      selected && { borderColor: theme.primary },
                      pressed && styles.pressed,
                    ]}>
                    <ThemedText
                      style={[
                        styles.optionLabel,
                        selected && { color: theme.primary, fontFamily: InterFonts.semibold },
                      ]}>
                      {d.label}
                    </ThemedText>
                    {selected ? <Check size={18} color={theme.primary} /> : null}
                  </Pressable>
                );
              })}
            </View>
            <View style={{ height: insets.bottom }} />
          </Animated.View>
        </Animated.View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    overflow: 'hidden',
  },
  triggerPress: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.three,
  },
  triggerLabel: {
    fontFamily: InterFonts.semibold,
    fontSize: 16,
    marginTop: Spacing.half,
  },
  pressed: {
    opacity: 0.85,
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    gap: Spacing.two,
    width: '100%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: Radius.chip,
    marginBottom: Spacing.one,
  },
  title: {
    textAlign: 'center',
    fontSize: 16,
  },
  options: {
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.input,
    borderWidth: 1,
  },
  optionLabel: {
    fontFamily: InterFonts.medium,
    fontSize: 15,
  },
});
