/**
 * Web theme persistence: mirrors the preference to localStorage so page
 * reloads keep the chosen theme. Guards against `window` being unavailable.
 */
import {
  getWebThemePreference,
  setWebThemePreference,
} from '@/services/theme/web-prefs';

function mockWindow(storage: Record<string, string>) {
  (globalThis as Record<string, unknown>).window = {
    localStorage: {
      getItem: (key: string) => storage[key] ?? null,
      setItem: (key: string, value: string) => {
        storage[key] = value;
      },
    },
  };
}

describe('web theme prefs', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).window;
  });

  it('returns null when there is no window (native)', () => {
    expect(getWebThemePreference()).toBeNull();
  });

  it('reads a stored preference from localStorage', () => {
    mockWindow({ 'dailykhata:theme': 'dark' });
    expect(getWebThemePreference()).toBe('dark');
  });

  it('ignores an invalid stored value', () => {
    mockWindow({ 'dailykhata:theme': 'neon' });
    expect(getWebThemePreference()).toBeNull();
  });

  it('writes the preference to localStorage', () => {
    const storage: Record<string, string> = {};
    mockWindow(storage);
    setWebThemePreference('system');
    expect(storage['dailykhata:theme']).toBe('system');
  });
});
