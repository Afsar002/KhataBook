/**
 * Realtime live-sync mode tests.
 *
 * Verifies the mode transitions that drive the "Live Sync" indicator in the
 * Cloud Sync card: off → connecting → live (SUBSCRIBED), and back to off on stop.
 * The module keeps mutable module-level state (`channel`, `mode`, listeners), so
 * every test re-imports it fresh via `jest.resetModules()` + dynamic `require`.
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
    getChannels: jest.fn(() => []),
    realtime: { endPoint: 'wss://test.realtime.supabase.co' },
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
  emitRemoteWake: jest.fn(),
}));

type Realtime = typeof import('@/services/sync/realtime');

interface ClientMock {
  getSupabaseClient: () => {
    channel: jest.Mock;
    removeChannel: jest.Mock;
    getChannels: jest.Mock;
    realtime: { endPoint: string };
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

    realtime = require('@/services/sync/realtime').realtime;
    client = require('@/services/supabase/client') as ClientMock;
  });

  it('starts as off', () => {
    expect(realtime.getMode()).toBe('off');
  });

  it('moves to connecting then live once the channel confirms SUBSCRIBED', async () => {
    await realtime.start();
    // Between start and confirmation we are connecting.
    expect(realtime.getMode()).toBe('connecting');

    client.__subscribeCallbacks[0]('SUBSCRIBED');
    expect(realtime.getMode()).toBe('live');
  });

  it('falls back to degraded when the channel reports an error, then reconnects', async () => {
    const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await realtime.start();
    client.__subscribeCallbacks[0]('CHANNEL_ERROR', new Error('boom'));

    expect(realtime.getMode()).toBe('degraded');
    consoleWarn.mockRestore();
  });

  it('returns to off when stopped, releasing the channel', async () => {
    await realtime.start();
    client.__subscribeCallbacks[0]('SUBSCRIBED');

    await realtime.stop();

    expect(realtime.getMode()).toBe('off');
    expect(client.getSupabaseClient().removeChannel).toHaveBeenCalled();
  });

  it('no-ops start when a channel is already running', async () => {
    await realtime.start();
    client.getSupabaseClient().channel.mockClear();

    await realtime.start();

    expect(client.getSupabaseClient().channel).not.toHaveBeenCalled();
  });

  it('emits a remote-wake event when a table row changes', async () => {
    const events = require('@/services/sync/events') as { emitRemoteWake: jest.Mock };
    await realtime.start();

    // One postgres_changes handler per synced table.
    expect(client.__rowCallbacks.length).toBe(2);
    client.__rowCallbacks[0]();

    expect(events.emitRemoteWake).toHaveBeenCalled();
  });

  it('onModeChange fires immediately and on each change', async () => {
    const listener = jest.fn();
    const unsubscribe = realtime.onModeChange(listener);
    expect(listener).toHaveBeenCalledWith('off');

    await realtime.start();
    expect(listener).toHaveBeenCalledWith('connecting');

    client.__subscribeCallbacks[0]('SUBSCRIBED');
    expect(listener).toHaveBeenCalledWith('live');

    unsubscribe();
    listener.mockClear();
    await realtime.stop();
    expect(listener).not.toHaveBeenCalled();
  });
});