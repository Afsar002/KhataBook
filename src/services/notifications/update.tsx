/**
 * OTA update-downloaded notification.
 *
 * When expo-updates finishes downloading a new update, tell the user it's
 * ready: an in-app toast when the app is on screen (same tone as the
 * "PDF generated" feedback), or a local notification when it's backgrounded
 * (like the sync-outcome alerts). Mount `<UpdateWatcher />` once near the
 * root — it renders nothing.
 *
 * `expo-updates` is safe to import statically (unlike expo-notifications):
 * it's part of the Expo Go runtime, so it never crashes Expo Go or web.
 */
import * as Updates from 'expo-updates';
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

import { feedback } from '@/components/feedback';
import { getNotifications } from '@/services/notifications/expo';
import { areNotificationsPermitted } from '@/services/notifications/prefs';

/** In-app toast or device notification that a freshly downloaded update is ready. */
export async function notifyUpdateDownloaded(): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }
  if (AppState.currentState === 'active') {
    // The user is looking at the app — same feedback as a finished PDF export.
    feedback.toast({ message: 'New update downloaded — restart to apply it.', tone: 'success' });
    return;
  }
  if (!(await areNotificationsPermitted())) {
    return;
  }
  const notifications = getNotifications();
  if (!notifications) {
    return; // Expo Go
  }
  await notifications.scheduleNotificationAsync({
    content: {
      title: 'New version ready',
      body: 'DailyKhata update downloaded — restart the app to apply it.',
      sound: 'default',
      // No data.url: tapping just opens the app (the allow-list in deeplink.ts
      // is for screens; there is no screen to deep-link for an update).
    },
    trigger: null, // deliver immediately
  });
}

/**
 * Watches expo-updates and notifies when a freshly downloaded update becomes
 * pending. Renders nothing.
 *
 * Fires only on a false→true `isUpdatePending` transition (a download that
 * completes while the app runs). An update already pending at mount — e.g.
 * downloaded during an earlier launch — was already announced, so announcing
 * it again on every cold start would nag the user until they restart.
 */
export function UpdateWatcher(): null {
  const { isUpdatePending } = Updates.useUpdates();
  const previousPending = useRef<boolean | null>(null);

  useEffect(() => {
    if (previousPending.current === null) {
      previousPending.current = isUpdatePending; // first render: snapshot only
      return;
    }
    const wasPending = previousPending.current;
    previousPending.current = isUpdatePending;
    if (isUpdatePending && !wasPending) {
      void notifyUpdateDownloaded();
    }
  }, [isUpdatePending]);

  return null;
}
