/**
 * Web-only theme preference fallback.
 *
 * expo-sqlite persistence can lag or reset on web page reloads, so on web the
 * theme is also mirrored to localStorage, which survives refreshes. Native
 * builds ignore this module entirely.
 */
import type { ThemePreference } from '@/types';

const THEME_KEY = 'dailykhata:theme';

function storage(): Storage | null {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return null;
  }
  return window.localStorage;
}

/** Returns the stored preference, or null when unset / unavailable. */
export function getWebThemePreference(): ThemePreference | null {
  try {
    const raw = storage()?.getItem(THEME_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') {
      return raw;
    }
  } catch {
    // localStorage may be blocked (private mode); treat as unset.
  }
  return null;
}

/** Mirrors a preference change to localStorage (web only). */
export function setWebThemePreference(preference: ThemePreference): void {
  try {
    storage()?.setItem(THEME_KEY, preference);
  } catch {
    // Ignored: storage unavailable.
  }
}
