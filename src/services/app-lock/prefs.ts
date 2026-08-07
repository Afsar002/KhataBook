/**
 * Device-local app-lock preference.
 *
 * Stored in AsyncStorage, NOT the SQLite `settings` table. Whether the app is
 * locked is a per-device privacy choice — syncing it to the cloud could lock a
 * brand-new phone behind credentials it has not been configured for yet.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const APP_LOCK_KEY = 'dailykhata:app-lock:enabled';

/** Whether the app lock is enabled on this device. */
export async function getAppLockEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(APP_LOCK_KEY)) === 'true';
}

/** Enables or disables the app lock on this device. */
export async function setAppLockEnabled(enabled: boolean): Promise<void> {
  if (enabled) {
    await AsyncStorage.setItem(APP_LOCK_KEY, 'true');
  } else {
    await AsyncStorage.removeItem(APP_LOCK_KEY);
  }
}
