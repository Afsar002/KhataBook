/**
 * Design system for DailyKhata.
 *
 * Tokens are derived from `docs/05-design-system.md`:
 * - Primary / income color: green
 * - Danger / expense color: red
 * - Button radius: 16px
 * - Typography: Inter
 * - Icons: Lucide
 * - Spacing: 8px system
 * - Animation: 200ms
 * - Cards: rounded, minimal, glass (no gradients)
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#111827',
    textSecondary: '#6B7280',
    background: '#F4F6F5',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E6ECE8',
    card: '#FFFFFF',
    border: '#E3E7E4',
    primary: '#16A34A',
    income: '#16A34A',
    expense: '#EF4444',
    danger: '#DC2626',
    info: '#2563EB',
    incomeSoft: '#E7F6EC',
    expenseSoft: '#FDEBEC',
    primarySoft: '#E7F6EC',
    warning: '#F59E0B',
    warningSoft: '#FEF3C7',
    overlay: 'rgba(17, 24, 39, 0.45)',
  },
  dark: {
    text: '#F9FAFB',
    textSecondary: '#9CA3AF',
    background: '#0E1210',
    backgroundElement: '#171C19',
    backgroundSelected: '#232B26',
    card: '#1A201C',
    border: '#2A322C',
    primary: '#22C55E',
    income: '#22C55E',
    expense: '#F87171',
    danger: '#F87171',
    info: '#3B82F6',
    incomeSoft: '#14301F',
    expenseSoft: '#3B1B1D',
    primarySoft: '#14301F',
    warning: '#FBBF24',
    warningSoft: '#3B2F0A',
    overlay: 'rgba(0, 0, 0, 0.55)',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/** Loaded by expo-font using @expo-google-fonts/inter. */
export const InterFonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

/** 8px spacing system. */
export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 48,
  seven: 64,
} as const;

/** Corner radii (docs: buttons 16px, cards rounded). */
export const Radius = {
  button: 16,
  card: 16,
  chip: 999,
  input: 14,
} as const;

/** Animation duration in ms (docs: 200ms). */
export const AnimationDuration = 200;

/** Minimum tappable area (docs: large buttons for elderly users). */
export const MinTouchTarget = 56;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
