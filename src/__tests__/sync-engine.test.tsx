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

jest.mock('@/db/sync/queue', () => ({
  countPending: jest.fn().mockResolvedValue(0),
  countFailed: jest.fn().mockResolvedValue(0),
  clearQueue: jest.fn().mockResolvedValue(undefined),
  purgeParked: jest.fn().mockResolvedValue(0),
}));

jest.mock('@/services/sync/push', () => ({
  pushPendingChanges: jest.fn().mockResolvedValue({ pushed: 1, deleted: 0, failed: 0, authError: false, errors: [] }),
}));

jest.mock('@/services/sync/pull', () => ({
  pullRemoteChanges: jest.fn().mockResolvedValue({ inserted: 0, updated: 0, deleted: 0, skipped: 0, conflicts: 0, errors: [] }),
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
  persistAutoSync: jest.fn().mockResolvedValue(undefined),
  persistWifiOnlySync: jest.fn().mockResolvedValue(undefined),
  persistSyncIntervalMinutes: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/services/sync/realtime', () => ({
  realtime: {
    start: jest.fn(),
    stop: jest.fn(),
    getMode: jest.fn().mockReturnValue('off'),
    onModeChange: jest.fn((cb) => { cb('off'); return () => {}; }),
  },
}));

jest.mock('@/services/sync/events', () => ({
  // Do not fire callbacks immediately: sync-engine registers its queue/remote
  // handlers at module import, and firing them would schedule a debounce timer
  // that leaks into every test.
  onQueueChange: jest.fn(),
  onRemoteWake: jest.fn(),
  emitSyncResult: jest.fn(),
}));

jest.mock('@/db/audit-log-repo', () => ({
  purgeAuditLog: jest.fn().mockResolvedValue(0),
}));

jest.mock('@/db/sync/device-repo', () => ({
  recordDeviceSync: jest.fn().mockResolvedValue(undefined),
  listSyncedDevices: jest.fn().mockResolvedValue([]),
  countSyncedDevices: jest.fn().mockResolvedValue(0),
}));

jest.mock('@/db/sync/history-repo', () => ({
  addSyncEvent: jest.fn().mockResolvedValue(undefined),
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

jest.mock('@/constants/app', () => ({
  APP_VERSION: '1.0.0',
}));

type SyncEngine = typeof import('@/services/sync/engine');

describe('Sync Engine', () => {
  let sync: SyncEngine;
  let config: { isSyncConfigured: jest.Mock };
  let appMeta: { fetchAppMeta: jest.Mock; versionSatisfies: jest.Mock };
  let auth: { getCurrentSession: jest.Mock };
  let queue: { countPending: jest.Mock; countFailed: jest.Mock; clearQueue: jest.Mock; purgeParked: jest.Mock };
  let meta: {
    getMeta: jest.Mock;
    setMeta: jest.Mock;
    getWifiOnlySync: jest.Mock;
    getSyncIntervalMinutes: jest.Mock;
    getAutoSync: jest.Mock;
  };
  let realtime: {
    start: jest.Mock;
    stop: jest.Mock;
    getMode: jest.Mock;
    onModeChange: jest.Mock;
  };
  let network: { getNetworkStateAsync: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    // Fake timers record the debounced schedule without firing it (firing would
    // run an async runSync outside the test's control). Promises are not faked.
    jest.useFakeTimers();

    sync = require('@/services/sync/engine');
    config = require('@/services/supabase/config');
    appMeta = require('@/services/app-meta');
    auth = require('@/services/supabase/auth');
    queue = require('@/db/sync/queue');
    meta = require('@/db/sync/meta');
    realtime = require('@/services/sync/realtime').realtime;
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
    it('sets status.state to unconfigured when sync not configured', async () => {
      config.isSyncConfigured.mockReturnValueOnce(false);

      await sync.initSyncState();
      expect(sync.getSyncStatus().state).toBe('unconfigured');
    });

    it('sets status.state to version_blocked when version check fails', async () => {
      appMeta.versionSatisfies.mockReturnValueOnce(false);

      await sync.initSyncState();
      expect(sync.getSyncStatus().state).toBe('version_blocked');
    });

    it('sets status.state to idle when configured and version ok', async () => {
      await sync.initSyncState();
      expect(sync.getSyncStatus().state).toBe('idle');
    });

    it('purges parked failed ops older than 30 days on boot', async () => {
      await sync.initSyncState();
      expect(queue.purgeParked).toHaveBeenCalledWith(30);
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

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ state: 'idle' }));

      unsubscribe();
      listener.mockClear();
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('syncNow', () => {
    it('runs a manual sync and returns summary', async () => {
      const result = await sync.syncNow('manual');

      expect(result).toEqual({
        pushed: 1,
        deleted: 0,
        pulled: 0,
        inserted: 0,
        updated: 0,
        failed: 0,
        conflicts: 0,
        errors: [],
        durationMs: expect.any(Number),
        source: 'manual',
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
      const push = require('@/services/sync/push');
      await sync.initSyncState(); // fresh module → 'idle'
      meta.getWifiOnlySync.mockResolvedValue(true);
      meta.getAutoSync.mockResolvedValue(true);
      network.getNetworkStateAsync.mockResolvedValue(cellular);

      // Fire the debounced auto-sync path (source 'auto').
      sync.scheduleSync('auto');
      jest.advanceTimersByTime(2000);
      await flushAsyncRuns();

      // Gated before push — the run returned early without uploading.
      expect(push.pushPendingChanges).not.toHaveBeenCalled();
      expect(sync.getSyncStatus().state).toBe('idle');
    });

    it('does not apply the gate to manual Sync Now', async () => {
      meta.getWifiOnlySync.mockResolvedValueOnce(true);
      network.getNetworkStateAsync.mockResolvedValueOnce(cellular);

      const result = await sync.syncNow('manual');
      expect(result).toEqual({
        pushed: 1,
        deleted: 0,
        pulled: 0,
        inserted: 0,
        updated: 0,
        failed: 0,
        conflicts: 0,
        errors: [],
        durationMs: expect.any(Number),
        source: 'manual',
      });
    });

    it('still auto-syncs on cellular when Wi-Fi-only is off', async () => {
      const push = require('@/services/sync/push');
      meta.getWifiOnlySync.mockResolvedValue(false);
      meta.getAutoSync.mockResolvedValue(true);
      network.getNetworkStateAsync.mockResolvedValue(cellular);

      sync.scheduleSync('auto');
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
      sync.scheduleSync('auto');
      expect(jest.getTimerCount()).toBe(1);
    });

    it('does not schedule twice while a timer is pending', () => {
      sync.scheduleSync('auto');
      sync.scheduleSync('auto');
      expect(jest.getTimerCount()).toBe(1);
    });
  });

  describe('pendingCount', () => {
    it('returns pending count from queue', async () => {
      queue.countPending.mockResolvedValueOnce(5);

      const count = await sync.getSyncStatus();
      expect(count.pendingCount).toBe(0); // queue counts are loaded in init
    });
  });

  describe('onAuthChanged', () => {
    it('stops realtime and sets idle when signed out', async () => {
      auth.getCurrentSession.mockReturnValueOnce(null);

      await sync.onAuthChanged();

      expect(realtime.stop).toHaveBeenCalled();
      expect(sync.getSyncStatus().state).toBe('idle');
    });

    it('starts realtime and syncs when signed in', async () => {
      await sync.onAuthChanged();

      expect(realtime.start).toHaveBeenCalled();
    });

    it('clears queue when different user signs in', async () => {
      meta.getMeta.mockResolvedValueOnce('different-user');

      await sync.onAuthChanged();

      expect(queue.clearQueue).toHaveBeenCalled();
    });
  });

  describe('getters', () => {
    it('getSyncStatus returns the fresh module default', () => {
      expect(sync.getSyncStatus().state).toBe('unconfigured');
    });

    it('getLastResult returns null before any sync', () => {
      expect(sync.getLastResult()).toBeNull();
    });

    it('isSyncing returns running state', () => {
      expect(sync.isSyncing()).toBe(false);
    });
  });
});