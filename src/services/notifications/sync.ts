/**
 * Sync-outcome notifications.
 *
 * After a sync run finishes, alerts the user when it matters while the app is
 * NOT on screen: local changes overwritten (conflicts to review), upload
 * failures (needs attention), or new entries pulled from another device.
 * Foreground runs are skipped — the in-app banner and Settings already surface
 * those. A short cooldown prevents the retry backoff from spamming.
 */
import { AppState, Platform } from 'react-native';

import type { SyncSummary } from '@/services/sync/sync-engine';
import { onSyncResult } from '@/services/sync/events';
import {
  areNotificationsPermitted,
  getSyncUpdatesEnabled,
} from '@/services/notifications/prefs';
import { getNotifications } from '@/services/notifications/expo';

/** Don't fire another sync notification sooner than this after the last one. */
const COOLDOWN_MS = 5 * 60_000;

let initialized = false;
let lastNotifiedAt = 0;

/** Maps a finished-sync summary to a notification, or null when nothing to say. */
function syncNotification(summary: SyncSummary): { title: string; body: string } | null {
  if (summary.conflicts > 0) {
    return {
      title: 'Sync finished',
      body:
        summary.conflicts === 1
          ? '1 local change was overwritten by a newer cloud version — review it in Settings.'
          : `${summary.conflicts} local changes were overwritten — review them in Settings.`,
    };
  }
  if (summary.failed > 0) {
    return {
      title: 'Sync needs attention',
      body:
        summary.failed === 1
          ? "1 change couldn't be uploaded. We'll retry automatically."
          : `${summary.failed} changes couldn't be uploaded. We'll retry automatically.`,
    };
  }
  if (summary.pulled > 0) {
    return {
      title: 'DailyKhata synced',
      body:
        summary.pulled === 1
          ? '1 new entry from your other devices.'
          : `${summary.pulled} new entries from your other devices.`,
    };
  }
  return null;
}

/** Schedules the notification, honoring the toggle, permission and cooldown. */
async function maybeNotifySync(summary: SyncSummary): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }
  if (!(await getSyncUpdatesEnabled()) || !(await areNotificationsPermitted())) {
    return;
  }
  if (AppState.currentState === 'active') {
    return; // The app is on screen — the banner/Settings already show this.
  }
  const now = Date.now();
  if (now - lastNotifiedAt < COOLDOWN_MS) {
    return;
  }
  const payload = syncNotification(summary);
  if (!payload) {
    return;
  }
  const notifications = getNotifications();
  if (!notifications) {
    return; // Expo Go
  }
  lastNotifiedAt = now;
  await notifications.scheduleNotificationAsync({
    content: {
      title: payload.title,
      body: payload.body,
      sound: 'default',
      // Tapping the notification opens Settings (Cloud Sync / conflict review).
      data: { url: '/settings' },
    },
    trigger: null, // deliver immediately
  });
}

/** Subscribes to finished-sync events. Idempotent — call once at boot. */
export function initSyncNotifications(): void {
  if (initialized) {
    return;
  }
  initialized = true;
  onSyncResult((summary) => {
    void maybeNotifySync(summary);
  });
}
