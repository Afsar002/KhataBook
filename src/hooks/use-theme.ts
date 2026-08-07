/**
 * Returns the resolved color palette (light/dark) for the current theme,
 * respecting the user's preference (system/light/dark).
 */

import { Colors } from '@/constants/theme';
import { useAppTheme } from '@/context/theme-context';

export function useTheme() {
  const { scheme } = useAppTheme();
  return Colors[scheme];
}
