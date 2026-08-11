/**
 * Recurring reminder scheduling tests.
 *
 * `nextDueDate` reuses the real scheduler's `shouldGenerateForDate` so the
 * reminder and the generator agree on what "due" means. The clock is pinned to
 * 2026-08-08 06:00 (local) so results are deterministic: reminders fire at
 * 08:00 on the due date, and a due date whose 08:00 already passed is skipped.
 */
import * as Notifications from 'expo-notifications';

import { listRecurringTemplates } from '@/db/recurring-repo';
import { getRemindersEnabled } from '@/services/notifications/prefs';
import {
  nextDueDate,
  rescheduleRecurringReminders,
  scheduleRecurringReminder,
} from '@/services/notifications/reminders';
import type { RecurringTemplate } from '@/types';

jest.mock('expo-notifications', () => ({
  setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('scheduled'),
  getAllScheduledNotificationsAsync: jest.fn().mockResolvedValue([]),
  IosAuthorizationStatus: { AUTHORIZED: 2, PROVISIONAL: 3 },
  AndroidImportance: { HIGH: 4 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

// The lazy loader gates on isRunningInExpoGo(), which jest-expo reports as true.
// Mock the boundary so the suite exercises the scheduling logic with the
// expo-notifications mock above instead of nulling out.
jest.mock('@/services/notifications/expo', () => {
  const Notifications = require('expo-notifications');
  return {
    getNotifications: () => Notifications,
    notificationsSupported: () => true,
  };
});

jest.mock('@/db/recurring-repo', () => ({
  listRecurringTemplates: jest.fn(),
}));

jest.mock('@/db/transaction-repo', () => ({
  addTransaction: jest.fn(),
}));

jest.mock('@/db/party-repo', () => ({
  addPartyTransaction: jest.fn(),
}));

jest.mock('@/services/notifications/prefs', () => ({
  getRemindersEnabled: jest.fn().mockResolvedValue(true),
  areNotificationsPermitted: jest.fn().mockResolvedValue(true),
}));

function makeTemplate(overrides: Partial<RecurringTemplate> = {}): RecurringTemplate {
  return {
    id: 1,
    uuid: 'tpl-1',
    templateType: 'transaction',
    type: 'expense',
    amount: 500,
    accountId: 3,
    categoryId: null,
    note: 'Rent',
    partyId: null,
    direction: undefined,
    frequency: 'daily',
    dayOfWeek: null,
    dayOfMonth: null,
    startDate: '2026-01-01',
    endDate: null,
    lastGeneratedDate: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const SCHEDULE = Notifications.scheduleNotificationAsync as jest.Mock;
const CANCEL = Notifications.cancelScheduledNotificationAsync as jest.Mock;
const LIST_ALL = Notifications.getAllScheduledNotificationsAsync as jest.Mock;

describe('nextDueDate', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-08T06:00:00'));
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns today for a daily template (8 AM reminder still ahead)', () => {
    expect(nextDueDate(makeTemplate({}))).toBe('2026-08-08');
  });

  it('returns tomorrow when today was already generated', () => {
    expect(nextDueDate(makeTemplate({ lastGeneratedDate: '2026-08-08' }))).toBe('2026-08-09');
  });

  it('respects weekly dayOfWeek', () => {
    const weekday = new Date('2026-08-08T06:00:00').getDay();
    expect(nextDueDate(makeTemplate({ frequency: 'weekly', dayOfWeek: weekday }))).toBe('2026-08-08');
    expect(nextDueDate(makeTemplate({ frequency: 'weekly', dayOfWeek: (weekday + 1) % 7 }))).toBe('2026-08-09');
  });

  it('respects monthly dayOfMonth', () => {
    expect(nextDueDate(makeTemplate({ frequency: 'monthly', dayOfMonth: 8 }))).toBe('2026-08-08');
    expect(nextDueDate(makeTemplate({ frequency: 'monthly', dayOfMonth: 9 }))).toBe('2026-08-09');
  });

  it('returns null once the template end date has passed', () => {
    expect(nextDueDate(makeTemplate({ endDate: '2026-01-01' }))).toBeNull();
  });
});

describe('scheduleRecurringReminder', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-08T06:00:00'));
    jest.clearAllMocks();
    // The "disabled" test mutates this mock; clearAllMocks doesn't restore it.
    (getRemindersEnabled as jest.Mock).mockResolvedValue(true);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('schedules a one-shot DATE notification for 08:00 on the due date', async () => {
    const scheduled = await scheduleRecurringReminder(makeTemplate({}));

    expect(scheduled).toBe(true);
    expect(SCHEDULE).toHaveBeenCalledTimes(1);
    const request = SCHEDULE.mock.calls[0][0];
    expect(request.identifier).toBe('recurring-1');
    expect(request.trigger.type).toBe('date');
    expect(request.trigger.date).toEqual(new Date('2026-08-08T08:00:00'));
    expect(request.content.title).toBe('DailyKhata reminder');
    expect(request.content.body).toContain('Rent');
  });

  it('skips an inactive template', async () => {
    await scheduleRecurringReminder(makeTemplate({ isActive: false }));
    expect(SCHEDULE).not.toHaveBeenCalled();
  });

  it('skips a template past its end date', async () => {
    const scheduled = await scheduleRecurringReminder(makeTemplate({ endDate: '2026-01-01' }));
    expect(scheduled).toBe(false);
    expect(SCHEDULE).not.toHaveBeenCalled();
  });

  it('does nothing when reminders are disabled', async () => {
    (getRemindersEnabled as jest.Mock).mockResolvedValue(false);
    await scheduleRecurringReminder(makeTemplate({}));
    expect(SCHEDULE).not.toHaveBeenCalled();
  });

  it('re-arms under the same id so the OS replaces the old notification', async () => {
    await scheduleRecurringReminder(makeTemplate({}));
    await scheduleRecurringReminder(makeTemplate({}));
    expect(CANCEL).toHaveBeenCalledWith('recurring-1');
    expect(SCHEDULE).toHaveBeenCalledTimes(2);
    expect(SCHEDULE.mock.calls[0][0].identifier).toBe('recurring-1');
    expect(SCHEDULE.mock.calls[1][0].identifier).toBe('recurring-1');
  });
});

describe('rescheduleRecurringReminders', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-08T06:00:00'));
    jest.clearAllMocks();
    (getRemindersEnabled as jest.Mock).mockResolvedValue(true);
    (listRecurringTemplates as jest.Mock).mockResolvedValue([
      makeTemplate({ id: 1 }),
      makeTemplate({ id: 2, isActive: false }),
    ]);
    LIST_ALL.mockResolvedValue([{ identifier: 'recurring-9' }, { identifier: 'other-notif' }]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('cancels stale reminders and schedules one per active template', async () => {
    await rescheduleRecurringReminders();

    // Stale id from a deleted template is cancelled; foreign ids are untouched.
    expect(CANCEL).toHaveBeenCalledWith('recurring-9');
    expect(CANCEL).not.toHaveBeenCalledWith('other-notif');
    // Only the active template gets scheduled.
    expect(SCHEDULE).toHaveBeenCalledTimes(1);
    expect(SCHEDULE.mock.calls[0][0].identifier).toBe('recurring-1');
  });
});
