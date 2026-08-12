/**
 * Local notifications bootstrap.
 *
 * Call `initNotifications()` once, after the database is ready: it installs the
 * foreground handler, ensures the Android channel, subscribes sync-outcome
 * notifications, and re-arms recurring reminders. Everything no-ops on web.
 */
import { Platform } from 'react-native';

import { initNotificationNavigation } from './deeplink';
import { getNotifications } from './expo';
import { ensureChannels, rescheduleRecurringReminders, subscribeRecurringReminders } from './reminders';
import { initSyncNotifications } from './sync';

export { REMINDER_HOUR } from './reminders';
export {
  cancelRecurringReminders,
  ensureChannels,
  nextDueDate,
  rescheduleRecurringReminders,
  scheduleRecurringReminder,
  subscribeRecurringReminders,
} from './reminders';
export {
  areNotificationsPermitted,
  getRemindersEnabled,
  getSyncUpdatesEnabled,
  requestNotificationPermission,
  setRemindersEnabled,
  setSyncUpdatesEnabled,
} from './prefs';
export { initSyncNotifications } from './sync';
export { notifyUpdateDownloaded, UpdateWatcher } from './update';

/**
 * Boot-time setup: foreground notification behaviour, Android channel, event
 * subscriptions and the initial reminder re-arm. Safe to call after
 * `initDatabase()` resolves; no-ops on web.
 */
export async function initNotifications(): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }
  const notifications = getNotifications();
  if (!notifications) {
    return; // Expo Go — importing expo-notifications there would crash boot
  }
  notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  await ensureChannels();
  subscribeRecurringReminders();
  initSyncNotifications();
  await initNotificationNavigation();
  void rescheduleRecurringReminders();
}
