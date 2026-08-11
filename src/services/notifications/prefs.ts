/**
 * Device-local notification preferences.
 *
 * Stored in AsyncStorage, NOT the SQLite `settings` table. Whether this phone
 * shows notifications is a per-device choice — syncing it would push one
 * phone's notification settings onto every other device (same rationale as
 * the app-lock pref).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { getNotifications } from './expo';

const REMINDERS_KEY = 'dailykhata:notifications:reminders';
const SYNC_UPDATES_KEY = 'dailykhata:notifications:sync-updates';

/** Whether recurring due-day reminders are enabled on this device. */
export async function getRemindersEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(REMINDERS_KEY)) === 'true';
}

export async function setRemindersEnabled(enabled: boolean): Promise<void> {
  if (enabled) {
    await AsyncStorage.setItem(REMINDERS_KEY, 'true');
  } else {
    await AsyncStorage.removeItem(REMINDERS_KEY);
  }
}

/** Whether sync-outcome notifications are enabled on this device. */
export async function getSyncUpdatesEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(SYNC_UPDATES_KEY)) === 'true';
}

export async function setSyncUpdatesEnabled(enabled: boolean): Promise<void> {
  if (enabled) {
    await AsyncStorage.setItem(SYNC_UPDATES_KEY, 'true');
  } else {
    await AsyncStorage.removeItem(SYNC_UPDATES_KEY);
  }
}

/** Whether the OS notification permission is already granted. */
export async function areNotificationsPermitted(): Promise<boolean> {
  const notifications = getNotifications();
  if (!notifications) {
    return false; // web / Expo Go — nothing to permit
  }
  const status = await notifications.getPermissionsAsync();
  return (
    status.granted || status.ios?.status === notifications.IosAuthorizationStatus.PROVISIONAL
  );
}

/**
 * Asks for notification permission — lazily, only when the user first enables
 * a toggle. Returns true when granted. On Android 13+ this is the
 * POST_NOTIFICATIONS runtime prompt; on iOS it's the system alert.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  const notifications = getNotifications();
  if (!notifications) {
    return false; // web / Expo Go
  }
  const status = await notifications.requestPermissionsAsync();
  return (
    status.granted || status.ios?.status === notifications.IosAuthorizationStatus.PROVISIONAL
  );
}
