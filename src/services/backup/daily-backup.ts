/**
 * Daily automatic backup service.
 *
 * Schedules a local notification that triggers a backup at 12:00 AM every day.
 * The backup is saved locally and a push notification informs the user.
 *
 * Runs as a background task via expo-task-manager (dev/prod builds only).
 * Falls back to manual backup if background tasks aren't available.
 */

import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

import { buildBackupJSON } from '@/db/backup';
import { getSetting, setSetting } from '@/db/settings';
import { writeFileToDocuments } from '@/utils/file';
import { getNotifications } from '@/services/notifications/expo';
import { areNotificationsPermitted } from '@/services/notifications/prefs';

const BACKUP_TASK_NAME = 'daily-backup-generator';
const AUTO_BACKUP_SETTING_KEY = 'auto_backup_enabled';
const BACKUP_NOTIFICATION_ID = 'daily-backup-complete';

/** Check if auto-backup is enabled in settings. */
export async function isAutoBackupEnabled(): Promise<boolean> {
  const value = await getSetting(AUTO_BACKUP_SETTING_KEY);
  return value === 'true';
}

/** Enable or disable automatic daily backup. */
export async function setAutoBackupEnabled(enabled: boolean): Promise<void> {
  await setSetting(AUTO_BACKUP_SETTING_KEY, enabled ? 'true' : 'false');
}

/** Creates a backup file in the Documents directory (persists across app reinstalls on Android) and returns the file URI. */
async function createBackupFile(): Promise<string> {
  const json = await buildBackupJSON();
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const filename = `dailykhata-auto-backup-${date}.json`;

  // Write to Documents directory so backups survive app deletion (on Android)
  // On iOS, the Documents folder is still sandboxed — use the share sheet to save to iCloud/Files for true persistence
  const uri = await writeFileToDocuments(filename, json);
  return uri;
}

/** Sends a local notification that the backup was created. */
async function notifyBackupComplete(fileUri: string): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }

  const notifications = getNotifications();
  if (!notifications) {
    return; // Expo Go
  }

  if (!(await areNotificationsPermitted())) {
    return;
  }

  await notifications.scheduleNotificationAsync({
    identifier: BACKUP_NOTIFICATION_ID,
    content: {
      title: 'DailyKhata backup saved',
      body: 'Your automatic daily backup has been created and saved locally.',
      sound: 'default',
      data: { url: '/settings', backupUri: fileUri },
    },
    trigger: null, // deliver immediately
  });
}

/** Main backup function - creates backup and notifies user. */
export async function runDailyBackup(): Promise<{ success: boolean; fileUri?: string; error?: string }> {
  try {
    const enabled = await isAutoBackupEnabled();
    if (!enabled) {
      return { success: false, error: 'Auto backup is disabled' };
    }

    const fileUri = await createBackupFile();
    await notifyBackupComplete(fileUri);

    console.log('[DailyBackup] Backup created successfully:', fileUri);
    return { success: true, fileUri };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[DailyBackup] Failed:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Register the daily backup background task.
 * Schedules to run daily at 12:00 AM.
 */
export async function registerDailyBackupTask(): Promise<void> {
  // Check if we're in Expo Go (which doesn't support background tasks).
  const isExpoGo =
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient &&
    Constants.appOwnership === 'expo';

  if (isExpoGo) {
    console.log('[DailyBackup] Running in Expo Go - skipping background task registration');
    return;
  }

  // Import dynamically to avoid issues on web
  const TaskManager = await import('expo-task-manager');
  const BackgroundTask = await import('expo-background-task');

  // Define the task
  TaskManager.defineTask(BACKUP_TASK_NAME, async () => {
    try {
      const result = await runDailyBackup();
      if (result.success) {
        console.log('[DailyBackup] Background task completed successfully');
        return BackgroundTask.BackgroundTaskResult.Success;
      } else {
        console.error('[DailyBackup] Background task failed:', result.error);
        return BackgroundTask.BackgroundTaskResult.Failed;
      }
    } catch (error) {
      console.error('[DailyBackup] Background task threw:', error);
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });

  // Register the task to run daily
  // Note: expo-background-task uses minimumInterval in minutes
  // We use 24 * 60 = 1440 minutes for daily
  // The exact time (12:00 AM) isn't guaranteed with this API,
  // but the task will run approximately once per day.
  try {
    await BackgroundTask.registerTaskAsync(BACKUP_TASK_NAME, {
      minimumInterval: 24 * 60, // 24 hours in minutes
    });
    console.log('[DailyBackup] Registered successfully');
  } catch (error) {
    console.error('[DailyBackup] Registration failed:', error);
    if (__DEV__) {
      console.warn('[DailyBackup] Background task registration failed.');
      console.warn('  This may be due to running in Expo Go or Expo managed workflow.');
      console.warn('  For development, consider running in a development build.');
    }
  }
}

/**
 * Unregister the daily backup background task.
 */
export async function unregisterDailyBackupTask(): Promise<void> {
  const isExpoGo =
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient &&
    Constants.appOwnership === 'expo';

  if (isExpoGo) {
    return;
  }

  const BackgroundTask = await import('expo-background-task');

  try {
    await BackgroundTask.unregisterTaskAsync(BACKUP_TASK_NAME);
    console.log('[DailyBackup] Unregistered');
  } catch (error) {
    console.error('[DailyBackup] Unregistration failed:', error);
  }
}

/**
 * Check if the daily backup task is registered.
 */
export async function isDailyBackupTaskRegistered(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return false;
  }

  const isExpoGo =
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient &&
    Constants.appOwnership === 'expo';

  if (isExpoGo) {
    return false;
  }

  const TaskManager = await import('expo-task-manager');

  try {
    const registered = await TaskManager.getRegisteredTasksAsync();
    return registered.some((task) => task.taskName === BACKUP_TASK_NAME);
  } catch {
    return false;
  }
}