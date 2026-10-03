/**
 * Live multi-device sync — Realtime controller with reconnect backoff.
 *
 * Subscribes to Supabase Postgres Changes for every synced table and emits a
 * `remoteWake` event whenever the cloud reports a row change. The sync engine
 * turns that into a debounced pull.
 *
 * Lifecycle follows the auth session: `start()` on sign-in, `stop()` on sign-out.
 * Both are safe to call when cloud sync is not configured — they no-op.
 */
import type { RealtimeChannel, RealtimeChannelOptions, SupabaseClient } from '@supabase/supabase-js';

import { SYNC_TABLES } from '@/db/sync/tables';
import { getSupabaseClient } from '@/services/supabase/client';
import { emitRemoteWake } from '@/services/sync/events';

export type RealtimeMode = 'off' | 'connecting' | 'live' | 'degraded';

export interface RealtimeController {
  start(getClient?: () => SupabaseClient | null): Promise<void>;
  stop(getClient?: () => SupabaseClient | null): Promise<void>;
  onModeChange(listener: (mode: RealtimeMode) => void): () => void;
  getMode(): RealtimeMode;
}

/** Name of the single channel carrying all table filters. */
const CHANNEL_NAME = 'dailykhata-live-sync';

/** Reconnect backoff schedule (ms). */
const RECONNECT_DELAYS = [2000, 4000, 8000, 16000, 30000];

function createController(): RealtimeController {
  let channel: RealtimeChannel | null = null;
  let mode: RealtimeMode = 'off';
  let reconnectAttempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let stopping = false;
  const modeListeners: ((mode: RealtimeMode) => void)[] = [];

  function setMode(next: RealtimeMode): void {
    if (mode !== next) {
      mode = next;
      for (const listener of [...modeListeners]) {
        listener(mode);
      }
    }
  }

  function clearReconnectTimer(): void {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  async function doSubscribe(supabase: SupabaseClient): Promise<void> {
    if (stopping) return;
    if (channel) {
      // Tear down the previous (failed/closed) channel first — guarding on
      // `channel` here is what made reconnect a permanent no-op before.
      try {
        await supabase.removeChannel(channel);
      } catch {
        // Best-effort; a dead channel removal failing is harmless.
      }
      channel = null;
    }

    setMode('connecting');

    // Guard: if a channel with our name already exists (e.g. from a previous
    // session that didn't clean up), remove it first. Calling .on() on an
    // already-subscribed channel throws "cannot add postgres_changes callbacks
    // after subscribe()". supabase.channel() returns the EXISTING channel when
    // called with a duplicate name while it's still subscribed.
    const existing = supabase.getChannels().find((c) => c.topic === `realtime:${CHANNEL_NAME}`);
    if (existing) {
      try {
        await supabase.removeChannel(existing);
      } catch (err) {
        console.warn('Realtime: removed stale channel before restart:', err);
      }
    }

    const nextChannel = supabase.channel(CHANNEL_NAME, {
      config: {
        // Pin VSN 1.0.0 for React Native WebSocket compatibility
        // (VSN 2.0.0 uses binary ArrayBuffer frames that Android mishandles)
        vsn: '1.0.0',
      },
    } as unknown as RealtimeChannelOptions);
    channel = nextChannel;

    for (const spec of SYNC_TABLES) {
      nextChannel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: spec.table },
        () => {
          emitRemoteWake();
        }
      );
    }

    nextChannel.subscribe((status, error) => {
      // A stop() (or a newer subscribe) replaced this channel — ignore the
      // late callback so it can't resurrect a stale mode/reconnect.
      if (channel !== nextChannel) {
        return;
      }
      if (status === 'SUBSCRIBED') {
        console.log('[Realtime] SUBSCRIBED — live sync active');
        reconnectAttempt = 0;
        setMode('live');
        return;
      }

      if (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.warn('[Realtime] subscribe failed:', errMsg);
      }

      // Not subscribed (TIMED_OUT / CHANNEL_ERROR / CLOSED) — schedule reconnect
      if (!stopping) {
        setMode('degraded');
        scheduleReconnect(supabase);
      } else {
        setMode('off');
      }
    });
  }

  function scheduleReconnect(supabase: SupabaseClient): void {
    clearReconnectTimer();
    const delay = RECONNECT_DELAYS[Math.min(reconnectAttempt, RECONNECT_DELAYS.length - 1)];
    reconnectAttempt += 1;
    console.log(`[Realtime] scheduling reconnect in ${delay}ms (attempt ${reconnectAttempt})`);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      // doSubscribe tears down any failed channel before resubscribing, so
      // the old `channel !== null` guard no longer blocks the retry.
      if (!stopping) {
        void doSubscribe(supabase);
      }
    }, delay);
  }

  return {
    async start(getClient: () => SupabaseClient | null = getSupabaseClient): Promise<void> {
      const supabase = getClient();
      if (!supabase) {
        return;
      }
      // Reset the stop flag first: `stopping` used to be cleared only after
      // the `channel` guard, so a failed stop() made start() a permanent no-op.
      stopping = false;
      // Already subscribed (or connecting) — nothing to do; a live channel is
      // not torn down. Failed/closed channels are rebuilt by doSubscribe.
      if (channel && mode !== 'degraded' && mode !== 'off') {
        return;
      }
      // doSubscribe tears down any leftover channel before resubscribing.
      await doSubscribe(supabase);
    },

    async stop(getClient: () => SupabaseClient | null = getSupabaseClient): Promise<void> {
      const supabase = getClient();
      stopping = true;
      clearReconnectTimer();

      const current = channel;
      if (supabase && current) {
        try {
          await supabase.removeChannel(current);
        } catch (err) {
          console.warn('Realtime channel removal failed:', err);
        }
      }

      if (channel === current) {
        channel = null;
        setMode('off');
      }
    },

    onModeChange(listener: (mode: RealtimeMode) => void): () => void {
      modeListeners.push(listener);
      listener(mode);
      return () => {
        const index = modeListeners.indexOf(listener);
        if (index !== -1) {
          modeListeners.splice(index, 1);
        }
      };
    },

    getMode(): RealtimeMode {
      return mode;
    },
  };
}

// Singleton instance
export const realtime = createController();