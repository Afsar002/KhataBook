/** Tappable pill used for selection (accounts, categories, filters). */
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { InterFonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { impact } from '@/utils/haptics';

type ChipProps = {
  label: string;
  selected: boolean;
  onPress?: () => void;
  icon?: ReactNode;
  style?: ViewStyle;
  disabled?: boolean;
};

export function Chip({ label, selected, onPress, icon, style, disabled = false }: ChipProps) {
  const theme = useTheme();

  const handlePress = () => {
    if (!disabled) {
      impact('light');
      onPress();
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected
            ? theme.primary
            : disabled
              ? theme.backgroundElement
              : theme.backgroundElement,
          borderColor: selected
            ? theme.primary
            : disabled
              ? theme.border
              : theme.border,
          opacity: disabled ? 0.5 : 1,
        },
        pressed && styles.pressed,
        style,
      ]}>
      {icon}
      <ThemedText
        type="smallBold"
        style={[
          styles.label,
          {
            color: selected
              ? '#FFFFFF'
              : disabled
                ? theme.textSecondary
                : theme.text,
          },
        ]}
        numberOfLines={1}>
        {label}
      </ThemedText>
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
