/** Large, thumb-friendly action button (docs: very large buttons, 16px radius). */
import type { LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { InterFonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { impact } from '@/utils/haptics';

export type ButtonVariant = 'income' | 'expense' | 'primary' | 'outline' | 'danger';

type LargeButtonProps = {
  title: string;
  subtitle?: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: LucideIcon;
  disabled?: boolean;
  height?: number;
  style?: ViewStyle;
};

export function LargeButton({
  title,
  subtitle,
  onPress,
  variant = 'primary',
  icon: Icon,
  disabled = false,
  height = 64,
  style,
}: LargeButtonProps) {
  const theme = useTheme();

  const isOutline = variant === 'outline';
  const backgroundColor = isOutline
    ? theme.card
    : variant === 'income'
      ? theme.income
      : variant === 'expense'
        ? theme.expense
        : variant === 'danger'
          ? theme.danger
          : theme.primary;
  const foreground = isOutline ? theme.text : '#FFFFFF';
  const borderColor = isOutline ? theme.border : 'transparent';

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
      accessibilityLabel={title}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor,
          borderColor,
          minHeight: height,
        },
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}>
      {Icon ? <Icon size={26} color={foreground} strokeWidth={2.4} /> : null}
      <View style={styles.labelWrap}>
        <ThemedText style={[styles.title, { color: foreground }]}>{title}</ThemedText>
        {subtitle ? (
          <ThemedText
            style={[
              styles.subtitle,
              { color: isOutline ? theme.textSecondary : 'rgba(255, 255, 255, 0.9)' },
            ]}>
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    borderRadius: Radius.button,
    borderWidth: 1,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  disabled: {
    opacity: 0.5,
  },
  labelWrap: {
    alignItems: 'center',
  },
  title: {
    fontFamily: InterFonts.semibold,
    fontSize: 22,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: InterFonts.regular,
    fontSize: 13,
    marginTop: Spacing.half,
    textAlign: 'center',
  },
});
