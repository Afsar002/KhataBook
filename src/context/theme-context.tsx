/**
 * Theme preference context. Preference is persisted in SQLite settings,
 * defaulting to following the system color scheme.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform, useColorScheme } from 'react-native';

import { getSetting, setSetting } from '@/db/settings';
import {
  getWebThemePreference,
  setWebThemePreference,
} from '@/services/theme/web-prefs';
import type { ThemePreference } from '@/types';

const THEME_SETTING_KEY = 'theme';
const isWeb = Platform.OS === 'web';

interface ThemeContextValue {
  /** User preference (defaults to 'system'). */
  preference: ThemePreference;
  /** Resolved color scheme. */
  scheme: 'light' | 'dark';
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    // On web, localStorage is the source of truth (survives reloads); the
    // SQLite setting is kept in sync as a fallback. On native, SQLite only.
    if (isWeb) {
      const stored = getWebThemePreference();
      if (stored) {
        setPreferenceState(stored);
        return;
      }
    }
    getSetting(THEME_SETTING_KEY).then((value) => {
      if (value === 'light' || value === 'dark' || value === 'system') {
        setPreferenceState(value);
      }
    });
  }, []);

  const scheme = preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    void setSetting(THEME_SETTING_KEY, next);
    if (isWeb) {
      setWebThemePreference(next);
    }
  }, []);

  const value = useMemo(
    () => ({ preference, scheme, setPreference }),
    [preference, scheme, setPreference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useAppTheme must be used within a ThemeProvider');
  }
  return ctx;
}
