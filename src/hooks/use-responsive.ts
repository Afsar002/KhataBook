/** Breakpoint helpers for the phone-first → tablet/desktop layout switch. */
import { useWindowDimensions } from 'react-native';

import { MaxContentWidth } from '@/constants/theme';

/**
 * Window width at which the desktop layout kicks in — a left sidebar replaces
 * the bottom tab bar and content columns grow wider. Phones (and phone-sized
 * windows) stay on the bottom-tab layout below this.
 */
export const WIDE_BREAKPOINT = 900;

/** Content column width once the sidebar is present (fills desktop screens). */
export const WideContentWidth = 960;

export type ResponsiveLayout = {
  /** True when the window is wide enough for the desktop (sidebar) layout. */
  isWide: boolean;
  /** Max content width for the current layout — wider once the sidebar shows. */
  contentMaxWidth: number;
};

/** Phone-first layout info derived from the live window width. */
export function useResponsiveLayout(): ResponsiveLayout {
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;
  return { isWide, contentMaxWidth: isWide ? WideContentWidth : MaxContentWidth };
}
