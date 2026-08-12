/**
 * OTA update-downloaded notification tests.
 *
 * `UpdateWatcher` must notify exactly when expo-updates reports a freshly
 * downloaded update (`isUpdatePending` false→true) — an in-app toast while the
 * app is foregrounded (like the "PDF generated" feedback), or a device
 * notification when backgrounded. It must stay quiet when an update was already
 * pending at mount (downloaded earlier — already announced) and never re-announce
 * the same pending update. `notifyUpdateDownloaded` decides the delivery path.
 *
 * All modules are imported statically (no `jest.resetModules()`): unlike the
 * sync-notifications module there is no cooldown state to isolate, and resetting
 * the registry would give the rendered component a second React copy with null
 * hooks while react-test-renderer still holds the first.
 */
import { act, render } from '@testing-library/react-native';
import { AppState } from 'react-native';

import { feedback } from '@/components/feedback';
import { areNotificationsPermitted } from '@/services/notifications/prefs';
import { notifyUpdateDownloaded, UpdateWatcher } from '@/services/notifications/update';
import * as Notifications from 'expo-notifications';

const mockUpdatesState = { isUpdatePending: false };

jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn().mockResolvedValue('sent'),
  getPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  setNotificationHandler: jest.fn(),
  IosAuthorizationStatus: { AUTHORIZED: 2, PROVISIONAL: 3 },
}));

// The lazy loader gates on isRunningInExpoGo(), which jest-expo reports as true.
// Mock the boundary so the suite exercises the scheduling logic with the
// expo-notifications mock above instead of nulling out.
jest.mock('@/services/notifications/expo', () => {
  const ExpoNotifications = require('expo-notifications');
  return {
    getNotifications: () => ExpoNotifications,
    notificationsSupported: () => true,
  };
});

jest.mock('@/services/notifications/prefs', () => ({
  areNotificationsPermitted: jest.fn().mockResolvedValue(true),
}));

jest.mock('@/components/feedback', () => ({
  feedback: {
    toast: jest.fn(),
    confirm: jest.fn(),
    alert: jest.fn(),
    sheet: jest.fn(),
  },
}));

jest.mock('expo-updates', () => ({
  useUpdates: () => ({ isUpdatePending: mockUpdatesState.isUpdatePending }),
}));

/** Flushes the fire-and-forget notification promise chain. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const schedule = Notifications.scheduleNotificationAsync as jest.Mock;
const toast = feedback.toast as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdatesState.isUpdatePending = false;
  (areNotificationsPermitted as jest.Mock).mockResolvedValue(true);
});

describe('delivery decision (notifyUpdateDownloaded)', () => {
  it('foreground → in-app toast, never a device notification', async () => {
    AppState.currentState = 'active';
    await notifyUpdateDownloaded();
    await flush();

    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast.mock.calls[0][0].message).toContain('restart');
    expect(schedule).not.toHaveBeenCalled();
  });

  it('background + permitted → device notification, no toast', async () => {
    AppState.currentState = 'background';
    await notifyUpdateDownloaded();
    await flush();

    expect(schedule).toHaveBeenCalledTimes(1);
    expect(schedule.mock.calls[0][0].content.title).toContain('version');
    expect(schedule.mock.calls[0][0].content.body).toContain('restart');
    expect(toast).not.toHaveBeenCalled();
  });

  it('background + notifications not permitted → nothing', async () => {
    AppState.currentState = 'background';
    (areNotificationsPermitted as jest.Mock).mockResolvedValue(false);
    await notifyUpdateDownloaded();
    await flush();

    expect(schedule).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });
});

describe('UpdateWatcher transitions', () => {
  it('stays quiet when an update was already pending at mount', async () => {
    AppState.currentState = 'active';
    mockUpdatesState.isUpdatePending = true;
    render(<UpdateWatcher />);
    await flush();

    expect(toast).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
  });

  it('notifies once on a false→true transition while foregrounded', async () => {
    AppState.currentState = 'active';
    const { rerender } = render(<UpdateWatcher />);
    await flush();
    expect(toast).not.toHaveBeenCalled();

    mockUpdatesState.isUpdatePending = true;
    await act(async () => rerender(<UpdateWatcher />));
    await flush();

    expect(toast).toHaveBeenCalledTimes(1);
    expect(schedule).not.toHaveBeenCalled();
  });

  it('schedules a device notification when the transition happens backgrounded', async () => {
    AppState.currentState = 'background';
    const { rerender } = render(<UpdateWatcher />);
    mockUpdatesState.isUpdatePending = true;
    await act(async () => rerender(<UpdateWatcher />));
    await flush();

    expect(schedule).toHaveBeenCalledTimes(1);
    expect(toast).not.toHaveBeenCalled();
  });

  it('never re-announces the same pending update across rerenders', async () => {
    AppState.currentState = 'active';
    const { rerender } = render(<UpdateWatcher />);
    mockUpdatesState.isUpdatePending = true;
    await act(async () => rerender(<UpdateWatcher />));
    await flush();
    expect(toast).toHaveBeenCalledTimes(1);

    // Same pending value — no transition, no second toast.
    await act(async () => rerender(<UpdateWatcher />));
    await flush();
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it('announces a second update after a pending→not-pending→pending cycle', async () => {
    AppState.currentState = 'active';
    const { rerender } = render(<UpdateWatcher />);
    mockUpdatesState.isUpdatePending = true;
    await act(async () => rerender(<UpdateWatcher />));
    await flush();
    expect(toast).toHaveBeenCalledTimes(1);

    mockUpdatesState.isUpdatePending = false;
    await act(async () => rerender(<UpdateWatcher />));
    await flush();
    mockUpdatesState.isUpdatePending = true;
    await act(async () => rerender(<UpdateWatcher />));
    await flush();
    expect(toast).toHaveBeenCalledTimes(2);
  });
});
