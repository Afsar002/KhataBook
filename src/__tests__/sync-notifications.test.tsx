/**
 * Sync-outcome notification tests.
 *
 * After a finished sync run, `emitSyncResult` should produce a local
 * notification when the app is backgrounded and the toggle is on — but never
 * while foregrounded (the in-app banner already shows it), never for an
 * uneventful run, and at most once per cooldown. `jest.resetModules()` re-arms
 * the module per test so the cooldown state can't leak across tests; every
 * reference (mocks + AppState) is required fresh so it matches the instance
 * the service sees.
 */
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
  const Notifications = require('expo-notifications');
  return {
    getNotifications: () => Notifications,
    notificationsSupported: () => true,
  };
});

jest.mock('@/services/notifications/prefs', () => ({
  getSyncUpdatesEnabled: jest.fn().mockResolvedValue(true),
  areNotificationsPermitted: jest.fn().mockResolvedValue(true),
}));

type Summary = {
  pushed: number;
  deleted: number;
  pulled: number;
  inserted: number;
  updated: number;
  failed: number;
  conflicts: number;
};

const QUIET: Summary = { pushed: 1, deleted: 0, pulled: 0, inserted: 0, updated: 0, failed: 0, conflicts: 0 };

/** Flushes the fire-and-forget notification promise chain. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('sync notifications', () => {
  let initSyncNotifications: () => void;
  let emitSyncResult: (summary: Summary) => void;
  let schedule: jest.Mock;
  let RN: typeof import('react-native');

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    RN = require('react-native');
    RN.AppState.currentState = 'background';
    schedule = require('expo-notifications').scheduleNotificationAsync;
    initSyncNotifications = require('@/services/notifications/sync').initSyncNotifications;
    emitSyncResult = require('@/services/sync/events').emitSyncResult;
    initSyncNotifications();
  });

  it('alerts on conflicts to review', async () => {
    emitSyncResult({ ...QUIET, conflicts: 2 });
    await flush();

    expect(schedule).toHaveBeenCalledTimes(1);
    expect(schedule.mock.calls[0][0].content.body).toContain('overwritten');
  });

  it('alerts on upload failures', async () => {
    emitSyncResult({ ...QUIET, failed: 3 });
    await flush();

    expect(schedule).toHaveBeenCalledTimes(1);
    expect(schedule.mock.calls[0][0].content.body).toContain("couldn't be uploaded");
  });

  it('alerts on new entries pulled from other devices', async () => {
    emitSyncResult({ ...QUIET, pulled: 4 });
    await flush();

    expect(schedule).toHaveBeenCalledTimes(1);
    expect(schedule.mock.calls[0][0].content.body).toContain('4 new entries');
  });

  it('stays quiet for an uneventful sync', async () => {
    emitSyncResult({ ...QUIET });
    await flush();

    expect(schedule).not.toHaveBeenCalled();
  });

  it('does not notify while the app is foregrounded', async () => {
    RN.AppState.currentState = 'active';
    emitSyncResult({ ...QUIET, pulled: 2 });
    await flush();

    expect(schedule).not.toHaveBeenCalled();
  });

  it('does not notify when sync updates are disabled', async () => {
    const { getSyncUpdatesEnabled } = require('@/services/notifications/prefs');
    (getSyncUpdatesEnabled as jest.Mock).mockResolvedValue(false);
    emitSyncResult({ ...QUIET, pulled: 2 });
    await flush();

    expect(schedule).not.toHaveBeenCalled();
  });

  it('fires at most one notification per cooldown window', async () => {
    emitSyncResult({ ...QUIET, pulled: 1 });
    await flush();
    emitSyncResult({ ...QUIET, pulled: 2 });
    await flush();

    expect(schedule).toHaveBeenCalledTimes(1);
  });
});
