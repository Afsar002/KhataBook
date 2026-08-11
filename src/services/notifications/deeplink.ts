/**
 * Notification tap → in-app navigation.
 *
 * Local notifications carry the screen they came from in `content.data.url`
 * (a recurring reminder → `/recurring`, a sync alert → `/settings`). When the
 * user taps one, this routes them there instead of just opening the app on the
 * screen that happened to be visible.
 *
 * The route list is an explicit allow-list, so a notification payload can never
 * drive the router to an arbitrary URL. `router.push` is queued until the root
 * layout mounts (expo-router's routing queue), so cold-start taps work too.
 */
import { router } from 'expo-router';
import type { NotificationResponse } from 'expo-notifications';

import { getNotifications } from './expo';

/** The only routes notifications may open. */
const NOTIFICATION_ROUTES = ['/recurring', '/settings'] as const;
type NotificationRoute = (typeof NOTIFICATION_ROUTES)[number];

function isNotificationRoute(url: unknown): url is NotificationRoute {
  return (
    typeof url === 'string' && (NOTIFICATION_ROUTES as readonly string[]).includes(url)
  );
}

/**
 * Routes a tapped notification to the screen it belongs to. No-op when the
 * payload has no recognised route (e.g. the OS "notification tapped" default
 * action with an empty data object).
 */
export function handleNotificationResponse(response: NotificationResponse): void {
  const url = response.notification.request.content.data?.url;
  if (isNotificationRoute(url)) {
    router.push(url);
  }
}

/**
 * Boot wiring: navigates to the screen of a notification that launched the app.
 * Subscribes to taps while the app runs, and handles a cold start (app opened
 * by tapping a notification) via the last-response read. Safe to call once
 * after the database is ready; no-ops on web and in Expo Go.
 */
export async function initNotificationNavigation(): Promise<void> {
  const notifications = getNotifications();
  if (!notifications) {
    return; // web / Expo Go
  }
  notifications.addNotificationResponseReceivedListener(handleNotificationResponse);
  try {
    const last = await notifications.getLastNotificationResponseAsync();
    if (last) {
      handleNotificationResponse(last);
    }
  } catch {
    // Reading the last response is best-effort — never crash boot.
  }
}
