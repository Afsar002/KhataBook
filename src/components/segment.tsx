/** Segmented control for filtering (e.g. All / Income / Expense). */
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { InterFonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { selection } from '@/utils/haptics';

export type SegmentOption = {
  key: string;
  label: string;
};

type SegmentProps = {
  options: SegmentOption[];
  value: string;
  onChange: (key: string) => void;
};

export function Segment({ options, value, onChange }: SegmentProps) {
  const theme = useTheme();

  return (
    <View
      style={[styles.track, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <Pressable
            key={option.key}
            onPress={() => {
              if (!selected) {
                selection();
                onChange(option.key);
              }
            }}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[
              styles.segment,
              { backgroundColor: selected ? theme.primary : 'transparent' },
            ]}>
            <ThemedText
              type="smallBold"
              style={[styles.label, { color: selected ? '#FFFFFF' : theme.textSecondary }]}>
              {option.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderRadius: Radius.chip,
    borderWidth: 1,
    padding: Spacing.one,
    gap: Spacing.one,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Radius.chip - Spacing.one,
  },
  label: {
    fontFamily: InterFonts.semibold,
  },
});
