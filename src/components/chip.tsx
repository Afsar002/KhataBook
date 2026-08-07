/** Tappable pill used for selection (accounts, categories, filters). */
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';

import { InterFonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { impact } from '@/utils/haptics';

type ChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: ReactNode;
  style?: ViewStyle;
};

export function Chip({ label, selected, onPress, icon, style }: ChipProps) {
  const theme = useTheme();

  const handlePress = () => {
    impact('light');
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? theme.primary : theme.backgroundElement,
          borderColor: selected ? theme.primary : theme.border,
        },
        pressed && styles.pressed,
        style,
      ]}>
      {icon}
      <Text
        style={[styles.label, { color: selected ? '#FFFFFF' : theme.text }]}
        numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + Spacing.half,
    borderRadius: Radius.chip,
    borderWidth: 1,
    minHeight: 44,
  },
  pressed: {
    opacity: 0.85,
  },
  label: {
    fontFamily: InterFonts.semibold,
    fontSize: 15,
  },
});
