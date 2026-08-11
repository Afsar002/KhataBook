/**
 * Recurring due-day reminders.
 *
 * One local notification per active recurring template, scheduled for its
 * NEXT due date at `REMINDER_HOUR` in the morning. Reminders are re-armed on
 * app boot and whenever any template is created/edited/deleted/toggled (the
 * repo emits a `recurring-changed` event). Keeping just the next occurrence
 * avoids thousands of pre-scheduled notifications and stale schedules after
 * edits; actual entry generation stays with the recurring scheduler.
 *
 * Everything degrades gracefully: no-ops on web, and when the toggle or the OS
 * permission is off.
 */
import { Platform } from 'react-native';

import { listRecurringTemplates } from '@/db/recurring-repo';
import { shouldGenerateForDate } from '@/services/recurring/scheduler';
import { onRecurringChanged } from '@/services/sync/events';
import type { RecurringTemplate } from '@/types';
import {
  areNotificationsPermitted,
  getRemindersEnabled,
} from '@/services/notifications/prefs';
import { getNotifications } from '@/services/notifications/expo';

/** Local time of day (24 h) reminders fire on the due date. */
export const REMINDER_HOUR = 8;

const CHANNEL_ID = 'dailykhata-reminders';
const REMINDER_ID_PREFIX = 'recurring-';
/** How far into the future to look for an open-ended template's next due date. */
const HORIZON_DAYS = 370;

let channelsEnsured = false;
let subscribed = false;

/** `YYYY-MM-DD` for a local date. */
function toDateString(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** When the reminder for a given due date should fire (local time). */
function reminderFireTime(dateStr: string): Date {
  const hour = String(REMINDER_HOUR).padStart(2, '0');
  return new Date(`${dateStr}T${hour}:00:00`);
}

/**
 * Finds the template's next due date whose reminder is still in the future
 * (a due date whose morning reminder already passed is skipped). Walks forward
 * with the scheduler's own rules, bounded by the end date or a ~1-year
 * horizon for open-ended templates. Returns null when nothing is due.
 */
export function nextDueDate(template: RecurringTemplate): string | null {
  const now = new Date();
  const today = toDateString(now);
  const start = today < template.startDate ? template.startDate : today;
  const cursor = new Date(`${start}T00:00:00`);
  const end = template.endDate ? new Date(`${template.endDate}T00:00:00`) : null;
  const horizon = new Date(now.getTime() + HORIZON_DAYS * 86_400_000);

  for (let step = 0; step < HORIZON_DAYS * 2; step += 1) {
    if (end && cursor > end) {
      return null;
    }
    if (cursor > horizon) {
      return null;
    }
    const candidate = toDateString(cursor);
    if (shouldGenerateForDate(template, candidate) && reminderFireTime(candidate) > now) {
      return candidate;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return null;
}

/** Short human label for the reminder body, e.g. "expense" or "give/take". */
function reminderLabel(template: RecurringTemplate): string {
  if (template.templateType === 'transaction') {
    return template.type === 'income' ? 'income' : 'expense';
  }
  return template.direction === 'in' ? 'receive/payment' : 'give/take';
}

function reminderBody(template: RecurringTemplate, due: string): string {
  const amount = `₹${template.amount.toLocaleString('en-IN')}`;
  const note = template.note ? ` "${template.note}"` : '';
  const isToday = due === toDateString(new Date());
  return `${amount} ${reminderLabel(template)}${note} due ${isToday ? 'today' : `on ${due}`}.`;
}

/** Creates the Android notification channel (required before scheduling). */
export async function ensureChannels(): Promise<void> {
  if (channelsEnsured || Platform.OS !== 'android') {
    return;
  }
  const notifications = getNotifications();
  if (!notifications) {
    return; // web / Expo Go
  }
  try {
    await notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Reminders',
      importance: notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#16A34A',
    });
    channelsEnsured = true;
  } catch (error) {
    // A channel failure must never crash boot — retry next time.
    console.error('[Notifications] Channel setup failed:', error);
  }
}

/**
 * Schedules (or replaces) one reminder for a template's next due date.
 * Returns true when a reminder was scheduled. Self-guards on platform, the
 * toggle and OS permission.
 */
export async function scheduleRecurringReminder(template: RecurringTemplate): Promise<boolean> {
  if (Platform.OS === 'web' || !template.isActive) {
    return false;
  }
  if (!(await getRemindersEnabled()) || !(await areNotificationsPermitted())) {
    return false;
  }
  const notifications = getNotifications();
  if (!notifications) {
    return false; // Expo Go
  }
  const due = nextDueDate(template);
  if (!due) {
    return false;
  }
  await ensureChannels();
  const identifier = `${REMINDER_ID_PREFIX}${template.id}`;
  try {
    await notifications.cancelScheduledNotificationAsync(identifier);
  } catch {
    // Nothing scheduled under this id yet — fine.
  }
  await notifications.scheduleNotificationAsync({
    identifier,
    content: {
      title: 'DailyKhata reminder',
      body: reminderBody(template, due),
      sound: 'default',
      // Tapping the notification opens the recurring templates screen.
      data: { url: '/recurring' },
    },
    trigger: {
      type: notifications.SchedulableTriggerInputTypes.DATE,
      date: reminderFireTime(due),
    },
  });
  return true;
}

/** Cancels every `recurring-*` reminder on this device. */
export async function cancelRecurringReminders(): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }
  const notifications = getNotifications();
  if (!notifications) {
    return; // Expo Go
  }
  const scheduled = await notifications.getAllScheduledNotificationsAsync();
  const ids = scheduled
    .map((request) => request.identifier)
    .filter((identifier) => identifier.startsWith(REMINDER_ID_PREFIX));
  await Promise.all(ids.map((id) => notifications.cancelScheduledNotificationAsync(id)));
}

/** Re-arms one reminder per active template (cancel stale, then schedule). */
export async function rescheduleRecurringReminders(): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }
  await cancelRecurringReminders();
  if (!(await getRemindersEnabled()) || !(await areNotificationsPermitted())) {
    return;
  }
  await ensureChannels();
  const templates = await listRecurringTemplates(true);
  await Promise.all(templates.map((template) => scheduleRecurringReminder(template)));
}

/** Subscribes to template changes so reminders re-arm after any edit. Idempotent. */
export function subscribeRecurringReminders(): void {
  if (subscribed) {
    return;
  }
  subscribed = true;
  onRecurringChanged(() => {
    void rescheduleRecurringReminders();
  });
}
