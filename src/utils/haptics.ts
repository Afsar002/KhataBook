/**
 * Haptic feedback utility using expo-haptics.
 *
 * Provides consistent tactile feedback across the app:
 * - light: button taps, tab switches, toggle flips
 * - medium: significant actions (delete, confirm, FAB open)
 * - heavy: destructive actions (delete party, account)
 * - success: operation completed (sync done, backup saved)
 * - warning: important but not destructive (low balance, unsynced changes)
 * - error: failed operations (sync failed, validation error)
 */
import * as Haptics from 'expo-haptics';

/** Impact feedback styles for different interaction weights. */
type ImpactStyle = 'light' | 'medium' | 'heavy';

/** Notification feedback styles for action outcomes. */
type NotificationStyle = 'success' | 'warning' | 'error';

/**
 * Triggers impact feedback (button presses, toggles, etc.).
 * Safe no-op on web/unsupported platforms.
 */
export function impact(style: ImpactStyle = 'light'): void {
  try {
    switch (style) {
      case 'light':
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
      case 'medium':
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        break;
      case 'heavy':
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        break;
    }
  } catch {
    // Silently ignore on unsupported platforms (web, some emulators)
  }
}

/**
 * Triggers notification feedback (success, warning, error outcomes).
 * Safe no-op on web/unsupported platforms.
 */
export function notify(style: NotificationStyle): void {
  try {
    switch (style) {
      case 'success':
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
      case 'warning':
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        break;
      case 'error':
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        break;
    }
  } catch {
    // Silently ignore on unsupported platforms
  }
}

/**
 * Triggers selection feedback (picker wheel, segmented control changes).
 * Safe no-op on web/unsupported platforms.
 */
export function selection(): void {
  try {
    Haptics.selectionAsync();
  } catch {
    // Silently ignore on unsupported platforms
  }
}