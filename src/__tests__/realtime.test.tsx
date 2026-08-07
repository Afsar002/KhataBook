/**
 * Realtime live-sync mode tests.
 *
 * Verifies the mode transitions that drive the "Live Sync" indicator in the
 * Cloud Sync card: off → trigger (channel started) → live (SUBSCRIBED), and
 * back to off on stop. The module keeps mutable module-level state (`channel`,
 * `mode`, listeners), so every test re-imports it fresh via
 * `jest.resetModules()` + dynamic `require`.
 */

// The client mock captures the channel's subscribe/on callbacks so a test can
// drive the channel into SUBSCRIBED / CHANNEL_ERROR and assert the mode.
jest.mock('@/services/supabase/client', () => {
  const subscribeCallbacks: ((status: string, error?: Error) => void)[] = [];
  const rowCallbacks: (() => void)[] = [];

  const channelMock: {
    on: jest.Mock;
    subscribe: jest.Mock;
  } = {
    on: jest.fn((event: string, _opts: unknown, cb: () => void) => {
      if (event === 'postgres_changes') {
        rowCallbacks.push(cb);
      }
      return channelMock;
    }),
    subscribe: jest.fn((cb: (status: string, error?: Error) => void) => {
      subscribeCallbacks.push(cb);
    }),
  };

  const supabaseMock = {
    channel: jest.fn(() => channelMock),
    removeChannel: jest.fn(),
  };

  return {
    getSupabaseClient: () => supabaseMock,
    __subscribeCallbacks: subscribeCallbacks,
    __rowCallbacks: rowCallbacks,
  };
});

jest.mock('@/db/sync/tables', () => ({
  SYNC_TABLES: [{ table: 'transactions' }, { table: 'parties' }],
}));

jest.mock('@/services/sync/events', () => ({
  emitRemoteChange: jest.fn(),
}));

type Realtime = typeof import('@/services/sync/realtime');

interface ClientMock {
  getSupabaseClient: () => {
    channel: jest.Mock;
    removeChannel: jest.Mock;
  };
  __subscribeCallbacks: ((status: string, error?: Error) => void)[];
  __rowCallbacks: (() => void)[];
}

describe('Realtime live-sync mode', () => {
  let realtime: Realtime;
  let client: ClientMock;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    realtime = require('@/services/sync/realtime');
    client = require('@/services/supabase/client') as ClientMock;
  });

  it('starts as off', () => {
    expect(realtime.getRealtimeMode()).toBe('off');
  });

  it('moves to live once the channel confirms SUBSCRIBED', () => {
    realtime.startRealtime();
    // Between start and confirmation we assume trigger-based.
    expect(realtime.getRealtimeMode()).toBe('trigger');

    client.__subscribeCallbacks[0]('SUBSCRIBED');
    expect(realtime.getRealtimeMode()).toBe('live');
  });

  it('falls back to trigger when the channel reports an error', () => {
    const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    realtime.startRealtime();
    client.__subscribeCallbacks[0]('CHANNEL_ERROR', new Error('boom'));

    expect(realtime.getRealtimeMode()).toBe('trigger');
    consoleWarn.mockRestore();
  });

  it('returns to off when stopped, releasing the channel', () => {
    realtime.startRealtime();
    client.__subscribeCallbacks[0]('SUBSCRIBED');

    realtime.stopRealtime();

    expect(realtime.getRealtimeMode()).toBe('off');
    expect(client.getSupabaseClient().removeChannel).toHaveBeenCalled();
  });

  it('no-ops startRealtime when a channel is already running', () => {
    realtime.startRealtime();
    client.getSupabaseClient().channel.mockClear();

    realtime.startRealtime();

    expect(client.getSupabaseClient().channel).not.toHaveBeenCalled();
  });

  it('emits a remote-change event when a table row changes', () => {
    const events = require('@/services/sync/events') as { emitRemoteChange: jest.Mock };
    realtime.startRealtime();

    // One postgres_changes handler per synced table.
    expect(client.__rowCallbacks.length).toBe(2);
    client.__rowCallbacks[0]();

    expect(events.emitRemoteChange).toHaveBeenCalled();
  });

  it('onRealtimeModeChange fires immediately and on each change', () => {
    const listener = jest.fn();
    const unsubscribe = realtime.onRealtimeModeChange(listener);
    expect(listener).toHaveBeenCalledWith('off');

    realtime.startRealtime();
    expect(listener).toHaveBeenCalledWith('trigger');

    unsubscribe();
    listener.mockClear();
    realtime.stopRealtime();
    expect(listener).not.toHaveBeenCalled();
  });
});
