/**
 * Lazy accessor for `expo-notifications`.
 *
 * Importing `expo-notifications` inside Expo Go on Android THROWS at module
 * load: the package auto-registers the device push token as an import
 * side-effect (`DevicePushTokenAutoRegistration.fx`), and that push machinery
 * is hard-disabled in Expo Go since SDK 53 (remote push needs a dev build).
 * Any static `import * as Notifications from 'expo-notifications'` in the boot
 * graph therefore crashes the whole app in Expo Go.
 *
 * So nothing statically imports it. Every notifications module calls
 * `getNotifications()` and no-ops when it returns null (web, or Expo Go). In a
 * development or production build the module is `require`d normally — the
 * point is the module never *executes* in Expo Go.
 */
import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';

type NotificationsModule = typeof import('expo-notifications');

let cached: NotificationsModule | null = null;

/** The `expo-notifications` module, or null where it cannot run (web / Expo Go). */
export function getNotifications(): NotificationsModule | null {
  if (Platform.OS === 'web') {
    return null;
  }
  if (isRunningInExpoGo()) {
    return null;
  }
  if (!cached) {
    // A static import is impossible here (it would crash Expo Go); require is
    // intentional and only ever reached in a dev/prod build.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('expo-notifications') as NotificationsModule;
  }
  return cached;
}

/** Whether local notifications can run in this environment (dev/prod build, not Expo Go / web). */
export function notificationsSupported(): boolean {
  return Platform.OS !== 'web' && !isRunningInExpoGo();
}
