/**
 * Live multi-device sync.
 *
 * Subscribes to Supabase Postgres Changes for every synced table and emits a
 * `remote-change` event whenever the cloud reports a row change. The sync
 * engine turns that into a debounced pull, so rows edited on another device
 * appear here within a couple of seconds.
 *
 * Realtime is a wake-up signal only: rows are never applied directly from the
 * payload. Pulling the same way the app already does means last-write-wins and
 * cursor handling stay in exactly one place. Echoes of this device's own pushes
 * arrive as events too and are skipped by the "local row is newer" check.
 *
 * Lifecycle follows the auth session: `startRealtime()` on sign-in,
 * `stopRealtime()` on sign-out. Both are safe to call when cloud sync is not
 * configured — they no-op so offline mode is unchanged.
 */
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

import { SYNC_TABLES } from '@/db/sync/tables';
import { getSupabaseClient } from '@/services/supabase/client';
import { emitRemoteChange } from '@/services/sync/events';
import type { RealtimeMode } from '@/types';

/** Name of the single channel carrying all table filters. */
const CHANNEL_NAME = 'dailykhata-live-sync';

let channel: RealtimeChannel | null = null;

/** Latest channel state, so the UI can show "Live" vs "Trigger-based". */
let mode: RealtimeMode = 'off';
const modeListeners: ((mode: RealtimeMode) => void)[] = [];

function setMode(next: RealtimeMode): void {
  if (mode !== next) {
    mode = next;
    for (const listener of [...modeListeners]) {
      listener(mode);
    }
  }
}

/** The current live-sync mode ('off' when realtime was never started). */
export function getRealtimeMode(): RealtimeMode {
  return mode;
}

/** Subscribes to mode changes; fires immediately with the current mode. */
export function onRealtimeModeChange(listener: (mode: RealtimeMode) => void): () => void {
  modeListeners.push(listener);
  listener(mode);
  return () => {
    const index = modeListeners.indexOf(listener);
    if (index !== -1) {
      modeListeners.splice(index, 1);
    }
  };
}

/** Starts listening for cloud changes. No-op when unconfigured or already running. */
export function startRealtime(getClient: () => SupabaseClient | null = getSupabaseClient): void {
  const supabase = getClient();
  if (!supabase || channel) {
    return;
  }
  // Assume trigger-based until the channel confirms SUBSCRIBED.
  setMode('trigger');
  channel = supabase.channel(CHANNEL_NAME);
  for (const spec of SYNC_TABLES) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table: spec.table }, () => {
      emitRemoteChange();
    });
  }
  channel.subscribe((status, error) => {
    if (status === 'SUBSCRIBED') {
      setMode('live');
      return;
    }
    if (error) {
      // Dump the full error object — Supabase realtime errors carry a
      // `code`/`reason` that the plain `.message` drops, which is exactly
      // what you need to diagnose a "transport failure".
      console.warn('Realtime subscribe failed:', error.message);
      console.warn(
        'Realtime subscribe error (full):',
        JSON.stringify(error, Object.getOwnPropertyNames(error), 2),
      );
      console.warn('Realtime endpoint:', supabase.realtime.endPoint);
    }
    // Not subscribed (TIMED_OUT / CHANNEL_ERROR / CLOSED) — back to polling.
    setMode('trigger');
  });
}

/** Stops listening and releases the channel. Safe to call multiple times. */
export async function stopRealtime(getClient: () => SupabaseClient | null = getSupabaseClient): Promise<void> {
  const supabase = getClient();
  if (supabase && channel) {
    // Await removal so the channel is fully gone before we allow a new one.
    // This prevents "cannot add callbacks after subscribe()" on rapid auth changes.
    await supabase.removeChannel(channel);
  }
  channel = null;
  setMode('off');
}
