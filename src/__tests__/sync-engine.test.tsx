/**
 * Sync engine tests.
 *
 * The engine keeps mutable module-level state (`status`, `running`,
 * `debounceTimer`, `lastSyncAt`, ...), so every test re-imports it fresh via
 * `jest.resetModules()` + dynamic `require`. This makes each test deterministic
 * regardless of what earlier tests did.
 *
 * Timers are spied (not faked) so `scheduleSync()` records the debounced call
 * without actually firing it; firing would run an async `runSync` outside the
 * test's control.
 */

// Mock dependencies
jest.mock('@/services/supabase/config', () => ({
  isSyncConfigured: jest.fn(() => true),
}));

jest.mock('@/services/supabase/auth', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: { user: { id: 'test-user' } } }, error: null }),
    },
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    })),
    channel: jest.fn(() => ({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn(),
    })),
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
  },
  getCurrentSession: jest.fn().mockReturnValue({ user: { id: 'test-user' } }),
  onAuthStateChange: jest.fn((cb) => {
    cb({ user: { id: 'test-user' } });
    return () => {};
  }),
  restoreSession: jest.fn().mockResolvedValue({ user: { id: 'test-user' } }),
  signOut: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/services/supabase/client', () => {
  const supabase = {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: { user: { id: 'test-user' } } }, error: null }),
    },
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    })),
    channel: jest.fn(() => ({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn(),
    })),
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
  };
  return { getSupabaseClient: () => supabase };
});

jest.mock('@/db/sync/queue-repo', () => ({
  countPending: jest.fn().mockResolvedValue(0),
  clearQueue: jest.fn().mockResolvedValue(undefined),
  purgeParked: jest.fn().mockResolvedValue(0),
}));

jest.mock('@/db/sync/push', () => ({
  pushPendingChanges: jest.fn().mockResolvedValue({ pushed: 1, deleted: 0, failed: 0, authError: false }),
}));

jest.mock('@/db/sync/pull', () => ({
  pullRemoteChanges: jest.fn().mockResolvedValue({ inserted: 0, updated: 0, deleted: 0, conflicts: 0 }),
}));

jest.mock('@/services/app-meta', () => ({
  fetchAppMeta: jest.fn().mockResolvedValue({ min_version: '1.0.0' }),
  versionSatisfies: jest.fn().mockReturnValue(true),
}));

jest.mock('@/services/device/device-name', () => ({
  getDeviceName: jest.fn().mockResolvedValue('Test Device'),
}));

jest.mock('@/db/settings', () => ({
  getSetting: jest.fn().mockResolvedValue(null),
  setSetting: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/db/sync/meta', () => ({
  CURRENT_USER_KEY: 'current_user',
  LAST_SYNC_KEY: 'last_sync',
  LAST_SUCCESS_KEY: 'last_success',
  getMeta: jest.fn().mockResolvedValue(null),
  setMeta: jest.fn().mockResolvedValue(undefined),
  getAutoSync: jest.fn().mockResolvedValue(true),
  getWifiOnlySync: jest.fn().mockResolvedValue(false),
  getSyncIntervalMinutes: jest.fn().mockResolvedValue(0),
}));

jest.mock('@/services/sync/realtime', () => ({
  startRealtime: jest.fn(),
  stopRealtime: jest.fn(),
}));

jest.mock('@/services/sync/events', () => ({
  // Do not fire callbacks immediately: sync-engine registers its queue/remote
  // handlers at module import, and firing them would schedule a debounce timer
  // that leaks into every test.
  onQueueChange: jest.fn(),
  onRemoteChange: jest.fn(),
}));

jest.mock('@/db/audit-log-repo', () => ({
  purgeAuditLog: jest.fn().mockResolvedValue(0),
}));

jest.mock('@/db/sync/device-repo', () => ({
  recordDeviceSync: jest.fn().mockResolvedValue(undefined),
  listSyncedDevices: jest.fn().mockResolvedValue([]),
  countSyncedDevices: jest.fn().mockResolvedValue(0),
}));

jest.mock('expo-network', () => ({
  // Runtime enum values are the uppercase strings below (NetworkStateType.WIFI).
  NetworkStateType: {
    NONE: 'NONE',
    UNKNOWN: 'UNKNOWN',
    CELLULAR: 'CELLULAR',
    WIFI: 'WIFI',
    BLUETOOTH: 'BLUETOOTH',
    ETHERNET: 'ETHERNET',
    WIMAX: 'WIMAX',
    OTHER: 'OTHER',
  },
  getNetworkStateAsync: jest.fn().mockResolvedValue({ isConnected: true, isInternetReachable: true, type: 'WIFI' }),
}));

jest.mock('@/db/database', () => ({
  nowIso: () => '2026-08-05T12:00:00.000Z',
}));

type SyncEngine = typeof import('@/services/sync/sync-engine');

describe('Sync Engine', () => {
  let sync: SyncEngine;
  let config: { isSyncConfigured: jest.Mock };
  let appMeta: { fetchAppMeta: jest.Mock; versionSatisfies: jest.Mock };
  let auth: { getCurrentSession: jest.Mock };
  let queueRepo: { countPending: jest.Mock; clearQueue: jest.Mock; purgeParked: jest.Mock };
  let meta: { getMeta: jest.Mock; setMeta: jest.Mock; getWifiOnlySync: jest.Mock; getSyncIntervalMinutes: jest.Mock };
  let realtime: { startRealtime: jest.Mock; stopRealtime: jest.Mock };
  let network: { getNetworkStateAsync: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    // Fake timers record the debounced schedule without firing it (firing would
    // run an async runSync outside the test's control). Promises are not faked.
    jest.useFakeTimers();

    sync = require('@/services/sync/sync-engine');
    config = require('@/services/supabase/config');
    appMeta = require('@/services/app-meta');
    auth = require('@/services/supabase/auth');
    queueRepo = require('@/db/sync/queue-repo');
    meta = require('@/db/sync/meta');
    realtime = require('@/services/sync/realtime');
    network = require('expo-network');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /** Flush enough microtask turns for the async runSync to reach its gates. */
  const flushAsyncRuns = async () => {
    for (let i = 0; i < 8; i += 1) {
      await Promise.resolve();
    }
  };

  describe('initSyncState', () => {
    it('sets status to unconfigured when sync not configured', async () => {
      config.isSyncConfigured.mockReturnValueOnce(false);

      await sync.initSyncState();
      expect(sync.getSyncStatus()).toBe('unconfigured');
    });

    it('sets status to version_blocked when version check fails', async () => {
      appMeta.versionSatisfies.mockReturnValueOnce(false);

      await sync.initSyncState();
      expect(sync.getSyncStatus()).toBe('version_blocked');
    });

    it('sets status to idle when configured and version ok', async () => {
      await sync.initSyncState();
      expect(sync.getSyncStatus()).toBe('idle');
    });

    it('purges parked failed ops older than 30 days on boot', async () => {
      await sync.initSyncState();
      expect(queueRepo.purgeParked).toHaveBeenCalledWith(30);
    });

    it('purges audit-log rows older than 90 days on boot', async () => {
      const { purgeAuditLog } = require('@/db/audit-log-repo');
      await sync.initSyncState();
      expect(purgeAuditLog).toHaveBeenCalledWith(90);
    });
  });

  describe('onStatusChange', () => {
    it('registers listener and fires immediately with current status', async () => {
      await sync.initSyncState(); // fresh module → 'idle'
      const listener = jest.fn();
      const unsubscribe = sync.onStatusChange(listener);

      expect(listener).toHaveBeenCalledWith('idle', null);

      unsubscribe();
      listener.mockClear();
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('syncNow', () => {
    it('runs a manual sync and returns summary', async () => {
      const result = await sync.syncNow();

      expect(result).toEqual({
        pushed: 1,
        deleted: 0,
        pulled: 0,
        inserted: 0,
        updated: 0,
        failed: 0,
        conflicts: 0,
      });
    });

    it('returns null when not configured', async () => {
      config.isSyncConfigured.mockReturnValueOnce(false);

      const result = await sync.syncNow();
      expect(result).toBeNull();
    });

    it('returns null when no session', async () => {
      auth.getCurrentSession.mockReturnValueOnce(null);

      const result = await sync.syncNow();
      expect(result).toBeNull();
    });
  });

  describe('Wi-Fi-only gate', () => {
    const cellular = { isConnected: true, isInternetReachable: true, type: 'CELLULAR' };

    it('skips the auto-sync run on cellular when Wi-Fi-only is on', async () => {
      const push = require('@/db/sync/push');
      await sync.initSyncState(); // fresh module → 'idle'
      meta.getWifiOnlySync.mockResolvedValue(true);
      network.getNetworkStateAsync.mockResolvedValue(cellular);

      // Fire the debounced auto-sync path (source 'auto').
      sync.scheduleSync();
      jest.advanceTimersByTime(2000);
      await flushAsyncRuns();

      // Gated before push — the run returned early without uploading.
      expect(push.pushPendingChanges).not.toHaveBeenCalled();
      expect(sync.getSyncStatus()).toBe('idle');
    });

    it('does not apply the gate to manual Sync Now', async () => {
      meta.getWifiOnlySync.mockResolvedValueOnce(true);
      network.getNetworkStateAsync.mockResolvedValueOnce(cellular);

      const result = await sync.syncNow();
      expect(result).toEqual({
        pushed: 1,
        deleted: 0,
        pulled: 0,
        inserted: 0,
        updated: 0,
        failed: 0,
        conflicts: 0,
      });
    });

    it('still auto-syncs on cellular when Wi-Fi-only is off', async () => {
      const push = require('@/db/sync/push');
      meta.getWifiOnlySync.mockResolvedValue(false);
      network.getNetworkStateAsync.mockResolvedValue(cellular);

      sync.scheduleSync();
      jest.advanceTimersByTime(2000);
      await flushAsyncRuns();

      expect(push.pushPendingChanges).toHaveBeenCalled();
    });
  });

  describe('armPeriodicSync', () => {
    it('arms an interval when minutes are stored', async () => {
      meta.getSyncIntervalMinutes.mockResolvedValueOnce(30);

      await sync.armPeriodicSync();
      expect(jest.getTimerCount()).toBe(1);
      // Firing the interval triggers an auto-sync run.
      jest.advanceTimersByTime(30 * 60_000);
      await flushAsyncRuns();
      expect(network.getNetworkStateAsync).toHaveBeenCalled();
    });

    it('arms nothing when minutes are zero', async () => {
      meta.getSyncIntervalMinutes.mockResolvedValueOnce(0);

      await sync.armPeriodicSync();
      expect(jest.getTimerCount()).toBe(0);
    });

    it('re-arms from a stored value, replacing a previous interval', async () => {
      meta.getSyncIntervalMinutes.mockResolvedValueOnce(30);
      await sync.armPeriodicSync();
      expect(jest.getTimerCount()).toBe(1);

      meta.getSyncIntervalMinutes.mockResolvedValueOnce(0);
      await sync.armPeriodicSync();
      expect(jest.getTimerCount()).toBe(0);
    });
  });

  describe('onAppForeground', () => {
    it('schedules a debounced sync when not running', () => {
      sync.onAppForeground();
      expect(jest.getTimerCount()).toBe(1);
    });
  });

  describe('scheduleSync', () => {
    it('sets up a debounced timer', () => {
      sync.scheduleSync();
      expect(jest.getTimerCount()).toBe(1);
    });

    it('does not schedule twice while a timer is pending', () => {
      sync.scheduleSync();
      sync.scheduleSync();
      expect(jest.getTimerCount()).toBe(1);
    });
  });

  describe('pendingCount', () => {
    it('returns pending count from queue repo', async () => {
      queueRepo.countPending.mockResolvedValueOnce(5);

      const count = await sync.pendingCount();
      expect(count).toBe(5);
    });
  });

  describe('onAuthChanged', () => {
    it('stops realtime and sets idle when signed out', async () => {
      auth.getCurrentSession.mockReturnValueOnce(null);

      await sync.onAuthChanged();

      expect(realtime.stopRealtime).toHaveBeenCalled();
      expect(sync.getSyncStatus()).toBe('idle');
    });

    it('starts realtime and syncs when signed in', async () => {
      await sync.onAuthChanged();

      expect(realtime.startRealtime).toHaveBeenCalled();
    });

    it('clears queue when different user signs in', async () => {
      meta.getMeta.mockResolvedValueOnce('different-user');

      await sync.onAuthChanged();

      expect(queueRepo.clearQueue).toHaveBeenCalled();
    });
  });

  describe('getters', () => {
    it('getSyncStatus returns the fresh module default', () => {
      expect(sync.getSyncStatus()).toBe('unconfigured');
    });

    it('getLastSyncAt returns null before any sync', () => {
      expect(sync.getLastSyncAt()).toBeNull();
    });

    it('getLastResult returns null before any sync', () => {
      expect(sync.getLastResult()).toBeNull();
    });

    it('isSyncing returns running state', () => {
      expect(sync.isSyncing()).toBe(false);
    });
  });
});
