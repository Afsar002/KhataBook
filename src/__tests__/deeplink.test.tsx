/**
 * Notification deep-link tests.
 *
 * `handleNotificationResponse` must only navigate to allow-listed routes and
 * never let a notification payload drive the router anywhere else.
 * `initNotificationNavigation` must subscribe to taps and honour a cold-start
 * (app launched by tapping a notification) response.
 *
 * The router and the expo-notifications loader boundary are mocked like the
 * other notification suites (jest-expo reports `isRunningInExpoGo()` as true).
 */
import { router } from 'expo-router';

import {
  handleNotificationResponse,
  initNotificationNavigation,
} from '@/services/notifications/deeplink';

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}));

jest.mock('expo-notifications', () => ({
  addNotificationResponseReceivedListener: jest.fn(),
  getLastNotificationResponseAsync: jest.fn(),
}));

// The lazy loader gates on isRunningInExpoGo(), which jest-expo reports as
// true — mock the boundary so this suite exercises the real logic.
jest.mock('@/services/notifications/expo', () => {
  const Notifications = require('expo-notifications');
  return {
    getNotifications: () => Notifications,
    notificationsSupported: () => true,
  };
});

const PUSH = router.push as jest.Mock;
const LISTEN =
  (require('expo-notifications').addNotificationResponseReceivedListener as jest.Mock);
const LAST =
  (require('expo-notifications').getLastNotificationResponseAsync as jest.Mock);

/** A minimal NotificationResponse shaped around the data the app sends. */
function responseWith(url: unknown) {
  return {
    notification: {
      request: {
        content: { data: url === undefined ? {} : { url } },
      },
    },
  };
}

describe('handleNotificationResponse', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('routes a recurring reminder tap to /recurring', () => {
    handleNotificationResponse(responseWith('/recurring') as never);
    expect(PUSH).toHaveBeenCalledWith('/recurring');
  });

  it('routes a sync alert tap to /settings', () => {
    handleNotificationResponse(responseWith('/settings') as never);
    expect(PUSH).toHaveBeenCalledWith('/settings');
  });

  it('ignores a tap whose payload has no url', () => {
    handleNotificationResponse(responseWith(undefined) as never);
    expect(PUSH).not.toHaveBeenCalled();
  });

  it('ignores a non-route url (payloads cannot drive the router anywhere)', () => {
    handleNotificationResponse(responseWith('https://evil.example.com') as never);
    expect(PUSH).not.toHaveBeenCalled();
  });

  it('ignores a non-string url', () => {
    handleNotificationResponse(responseWith(42) as never);
    expect(PUSH).not.toHaveBeenCalled();
  });
});

describe('initNotificationNavigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('subscribes to tap responses', async () => {
    LAST.mockResolvedValue(null);
    await initNotificationNavigation();
    expect(LISTEN).toHaveBeenCalledTimes(1);
    expect(LISTEN).toHaveBeenCalledWith(handleNotificationResponse);
  });

  it('navigates for a cold-start (last) response', async () => {
    LAST.mockResolvedValue(responseWith('/recurring'));
    await initNotificationNavigation();
    expect(PUSH).toHaveBeenCalledWith('/recurring');
  });

  it('does not fail when the last-response read throws', async () => {
    LAST.mockRejectedValue(new Error('boom'));
    await expect(initNotificationNavigation()).resolves.toBeUndefined();
  });
});
