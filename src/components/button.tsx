/**
 * Button — the shadcn `button` primitive, ported to React Native.
 *
 * Keeps the shadcn API surface (`buttonVariants`, `variant`, `size`, `asChild`)
 * while following DailyKhata's design system: `Pressable` + theme tokens instead
 * of DOM + Tailwind, `Radius.button` (16) corners, the 8px `Spacing` grid, and
 * `MinTouchTarget` (56) as the minimum height on every size — the web's 32–40px
 * heights sit below the touch-target guidance this app targets, so `size`
 * changes padding/font rather than bare height. `link` is the one exception
 * (an inline text link, not a touch target).
 *
 *   <Button>Save</Button>
 *   <Button variant="destructive" size="lg" onPress={onDelete}>Delete</Button>
 *   <Button variant="outline" asChild><Link href="/x">Open</Link></Button>
 *
 * `asChild` is the RN equivalent of Radix's `Slot`: it renders a single child
 * element with this button's style + `onPress` merged in (the child's own
 * `style` wins on conflict). The pressed feedback is lost with `asChild`.
 *
 * String children are rendered as a themed label sized to the button; anything
 * else (an icon, a composed row) is rendered as-is with the consumer owning
 * its color.
 */
import * as React from 'react';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { impact } from '@/utils/haptics';

export type ButtonVariant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
export type ButtonSize = 'default' | 'sm' | 'lg' | 'icon';

/** Shape of the resolved palette — identical keys in light and dark. */
type ThemeColors = (typeof Colors)[keyof typeof Colors];

export interface ButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Render this button's style + handler into a single child (RN `Slot`). */
  asChild?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  /** Merged after the variant/size styles so callers can override. */
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

/** Per-variant color mapping (mirrors the shadcn variant classes). */
function variantPalette(
  variant: ButtonVariant,
  theme: ThemeColors
): { background: string; foreground: string; border?: string; shadow?: boolean } {
  switch (variant) {
    case 'destructive':
      return { background: theme.danger, foreground: '#FFFFFF', shadow: true };
    case 'outline':
      return { background: theme.card, foreground: theme.text, border: theme.border, shadow: true };
    case 'secondary':
      return { background: theme.backgroundElement, foreground: theme.text, shadow: true };
    case 'ghost':
      return { background: 'transparent', foreground: theme.text };
    case 'link':
      return { background: 'transparent', foreground: theme.primary };
    default:
      return { background: theme.primary, foreground: '#FFFFFF', shadow: true };
  }
}

/** Per-size geometry (shadcn `h-8/9/10` → `MinTouchTarget`, padded wider). */
function sizeStyle(size: ButtonSize): ViewStyle {
  switch (size) {
    case 'sm':
      return { minHeight: MinTouchTarget, paddingHorizontal: Spacing.two + Spacing.one };
    case 'lg':
      return { minHeight: MinTouchTarget, paddingHorizontal: Spacing.four };
    case 'icon':
      return { width: MinTouchTarget, height: MinTouchTarget, paddingHorizontal: 0 };
    default:
      return { minHeight: MinTouchTarget, paddingHorizontal: Spacing.three };
  }
}

/** Per-size label font (shadcn `text-xs` → `text-sm` → `text-base`). */
function labelFont(size: ButtonSize): { fontSize: number } {
  switch (size) {
    case 'sm':
      return { fontSize: 13 };
    case 'lg':
      return { fontSize: 16 };
    default:
      return { fontSize: 15 };
  }
}

const BASE: ViewStyle = {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: Spacing.two,
  paddingVertical: Spacing.two,
};

const LINK_BASE: ViewStyle = {
  alignSelf: 'flex-start',
  paddingVertical: Spacing.one,
  paddingHorizontal: Spacing.one,
};

/** Resolves a variant+size pair into a static style (the RN mirror of `cva`). */
export function buttonVariants(
  { variant = 'default', size = 'default' }: Pick<ButtonProps, 'variant' | 'size'>,
  theme: ThemeColors
): ViewStyle {
  const palette = variantPalette(variant, theme);
  const isLink = variant === 'link';
  return {
    ...BASE,
    backgroundColor: palette.background,
    ...(palette.border ? { borderColor: palette.border, borderWidth: 1 } : null),
    ...(isLink ? LINK_BASE : sizeStyle(size)),
    ...(isLink ? null : { borderRadius: Radius.button }),
    ...(palette.shadow
      ? {
          shadowColor: '#000',
          shadowOpacity: 0.06,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 },
          elevation: 2,
        }
      : null),
  };
}

export function Button({
  variant = 'default',
  size = 'default',
  asChild = false,
  disabled = false,
  onPress,
  accessibilityLabel,
  style,
  children,
}: ButtonProps) {
  const theme = useTheme();
  const palette = variantPalette(variant, theme);
  const isLink = variant === 'link';

  const handlePress = () => {
    if (disabled) {
      return;
    }
    impact('light');
    onPress?.();
  };

  const resolved = [buttonVariants({ variant, size }, theme), disabled && styles.disabled];

  // asChild — merge our style + handler into a single child element.
  if (asChild) {
    const child = React.isValidElement(children)
      ? (children as React.ReactElement<any, any>)
      : null;
    if (!child) {
      return null;
    }
    const childProps = child.props as { style?: StyleProp<ViewStyle> };
    return React.cloneElement(child, {
      onPress: handlePress,
      disabled,
      accessibilityRole: 'button',
      accessibilityLabel,
      style: [resolved, childProps.style],
    });
  }

  const label =
    typeof children === 'string' ? (
      <ThemedText style={[labelFont(size), { color: palette.foreground }]}>{children}</ThemedText>
    ) : (
      children
    );

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        resolved,
        pressed && (isLink ? styles.linkPressed : styles.pressed),
        pressed &&
          !isLink &&
          (variant === 'outline' || variant === 'ghost' || variant === 'secondary') && {
            backgroundColor: theme.backgroundSelected,
          },
        style,
      ]}>
      {label}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  linkPressed: {
    opacity: 0.7,
  },
});
