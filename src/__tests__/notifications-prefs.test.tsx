/**
 * Notification preference tests.
 *
 * The toggles live in AsyncStorage (device-local, like app lock) so they never
 * leak a phone's notification settings onto other devices via cloud sync.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  getRemindersEnabled,
  getSyncUpdatesEnabled,
  setRemindersEnabled,
  setSyncUpdatesEnabled,
} from '@/services/notifications/prefs';

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  IosAuthorizationStatus: { AUTHORIZED: 2, PROVISIONAL: 3 },
}));

// The global AsyncStorage mock is a no-op; give this suite a real in-memory
// store so setItem/getItem round-trips actually round-trip.
jest.mock('@react-native-async-storage/async-storage', () => {
  const store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => Promise.resolve(store[key] ?? null)),
    setItem: jest.fn((key: string, value: string) => Promise.resolve((store[key] = value))),
    removeItem: jest.fn((key: string) => Promise.resolve(delete store[key])),
    clear: jest.fn(() =>
      Promise.resolve(Object.keys(store).forEach((key) => delete store[key]))
    ),
  };
});

describe('notification prefs', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('defaults to disabled', async () => {
    await expect(getRemindersEnabled()).resolves.toBe(false);
    await expect(getSyncUpdatesEnabled()).resolves.toBe(false);
  });

  it('round-trips the reminders toggle', async () => {
    await setRemindersEnabled(true);
    await expect(getRemindersEnabled()).resolves.toBe(true);

    await setRemindersEnabled(false);
    await expect(getRemindersEnabled()).resolves.toBe(false);
  });

  it('round-trips the sync updates toggle', async () => {
    await setSyncUpdatesEnabled(true);
    await expect(getSyncUpdatesEnabled()).resolves.toBe(true);

    await setSyncUpdatesEnabled(false);
    await expect(getSyncUpdatesEnabled()).resolves.toBe(false);
  });
});
