/**
 * Sync engine — the single place that decides when and how the device and the
 * cloud get in sync. It is deliberately independent of the UI: it exposes a
 * plain status object and listener callbacks, and React contexts hook into it.
 *
 * Responsibilities:
 *  - gate on configuration, a signed-in session and connectivity
 *  - push pending queue changes (upserts + delete tombstones)
 *  - pull remote changes (last-write-wins) and advance pull cursors
 *  - retry failed pushes with exponential backoff
 *  - debounce auto-sync so bursts of edits produce one upload
 *  - manage realtime connection lifecycle
 */
import * as Network from 'expo-network';

import { APP_VERSION } from '@/constants/app';
import { purgeAuditLog } from '@/db/audit-log-repo';
import { nowIso } from '@/db/database';
import { getSetting, setSetting } from '@/db/settings';
import { clearQueue, countFailed, countPending, purgeParked } from '@/db/sync/queue';
import { recordDeviceSync } from '@/db/sync/device-repo';
import {
  CURRENT_USER_KEY,
  getAutoSync,
  getMeta,
  getSyncIntervalMinutes,
  getWifiOnlySync,
  LAST_SYNC_KEY,
  LAST_SUCCESS_KEY,
  setMeta,
} from '@/db/sync/meta';
import { pullRemoteChanges } from '@/services/sync/pull';
import { pushPendingChanges } from '@/services/sync/push';
import { addSyncEvent } from '@/db/sync/history-repo';
import { fetchAppMeta, versionSatisfies } from '@/services/app-meta';
import { getDeviceName } from '@/services/device/device-name';
import { getCurrentSession } from '@/services/supabase/auth';
import { getSupabaseClient } from '@/services/supabase/client';
import { isSyncConfigured } from '@/services/supabase/config';
import { onQueueChange, onRemoteWake } from '@/services/sync/events';
import { realtime } from '@/services/sync/realtime';
import type { RealtimeMode } from '@/services/sync/realtime';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SyncResult, SyncSource, SyncError } from '@/services/sync/events';

// Re-exported so UI layers (context, notifications) can type against the
// engine without reaching into the events bus directly.
export type { SyncResult, SyncSource, SyncError };

export type SyncState =
  | 'unconfigured'
  | 'idle'
  | 'syncing'
  | 'offline'
  | 'error'
  | 'version_blocked';

export interface SyncStatus {
  state: SyncState;
  lastSyncAt: string | null;
  lastSuccessAt: string | null;
  realtimeMode: RealtimeMode;
  autoSync: boolean;
  wifiOnly: boolean;
  intervalMinutes: number;
  pendingCount: number;
  failedCount: number;
}

type StatusListener = (status: SyncStatus) => void;
type ResultListener = (result: SyncResult) => void;

let status: SyncStatus = {
  state: 'unconfigured',
  lastSyncAt: null,
  lastSuccessAt: null,
  realtimeMode: 'off',
  autoSync: true,
  wifiOnly: false,
  intervalMinutes: 0,
  pendingCount: 0,
  failedCount: 0,
};

let lastResult: SyncResult | null = null;
let running = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let periodicTimer: ReturnType<typeof setInterval> | null = null;
let retryAttempts = 0;
let authTransition: Promise<void> = Promise.resolve();

const statusListeners: StatusListener[] = [];
const resultListeners: ResultListener[] = [];

const DEBOUNCE_MS = 1500;
const RETRY_BASE_MS = 30_000;
const RETRY_MAX_MS = 5 * 60_000;
const RETRY_DELAY_STEP = 2;

function emitStatus(): void {
  for (const listener of [...statusListeners]) {
    listener({ ...status });
  }
}

function emitResult(result: SyncResult): void {
  for (const listener of [...resultListeners]) {
    listener(result);
  }
}

function setState(next: SyncState): void {
  if (status.state !== next) {
    status.state = next;
    emitStatus();
  }
}

function updateStatus(partial: Partial<SyncStatus>): void {
  let changed = false;
  for (const [key, value] of Object.entries(partial)) {
    if (status[key as keyof SyncStatus] !== value) {
      console.log(`[Sync Engine] updateStatus: ${key} = ${status[key as keyof SyncStatus]} -> ${value}`);
      (status as unknown as Record<string, unknown>)[key] = value;
      changed = true;
    }
  }
  if (changed) {
    emitStatus();
  }
}

/** Refreshes badge counts; a DB error must never break a sync run. */
async function refreshQueueCounts(): Promise<void> {
  try {
    const [pending, failed] = await Promise.all([countPending(), countFailed()]);
    updateStatus({ pendingCount: pending, failedCount: failed });
  } catch (e) {
    console.warn('[Sync] queue counts unavailable:', e instanceof Error ? e.message : String(e));
  }
}

/** Loads persisted state (call once on boot, after the database is ready). */
export async function initSyncState(
  getClient: () => SupabaseClient | null = getSupabaseClient
): Promise<void> {
  // Best-effort cleanup: drop failed ops parked longer than 30 days so the
  // queue can't grow unbounded. A failure here must never block boot.
  try {
    await purgeParked(30);
  } catch {
    // Ignore cleanup failures — continue boot without them.
  }
  // Bound the device-local audit log so it can't grow unbounded.
  try {
    await purgeAuditLog(90);
  } catch {
    // Ignore cleanup failures — continue boot without them.
  }

  if (!isSyncConfigured()) {
    updateStatus({ state: 'unconfigured' });
    return;
  }

  // Check minimum version before starting sync. A fetch failure fails open
  // (sync may proceed); only a confirmed stale version blocks boot.
  try {
    const appMeta = await fetchAppMeta(getClient);
    if (!versionSatisfies(APP_VERSION, appMeta.min_version)) {
      updateStatus({ state: 'version_blocked' });
      return;
    }
  } catch (e) {
    console.warn('[Sync] app-meta fetch failed during boot, continuing:', e instanceof Error ? e.message : String(e));
  }

  let lastSyncAt: string | null = null;
  let lastSuccessAt: string | null = null;
  try {
    lastSyncAt = await getMeta(LAST_SYNC_KEY);
    lastSuccessAt = await getMeta(LAST_SUCCESS_KEY);
  } catch (e) {
    console.warn('[Sync] meta read failed during boot:', e instanceof Error ? e.message : String(e));
  }
  const [autoSync, wifiOnly, intervalMinutes] = await Promise.all([
    getAutoSync(),
    getWifiOnlySync(),
    getSyncIntervalMinutes(),
  ]);

  updateStatus({
    state: 'idle',
    lastSyncAt,
    lastSuccessAt,
    autoSync,
    wifiOnly,
    intervalMinutes,
  });

  await refreshQueueCounts();

  // Subscribe to queue changes (local edits) and realtime wake-ups (remote edits)
  onQueueChange(() => scheduleSync('auto'));
  onRemoteWake(() => scheduleSync('realtime'));

  // Subscribe to realtime mode changes
  realtime.onModeChange((mode) => updateStatus({ realtimeMode: mode }));

  // Start realtime if there's already a session (e.g. restored from AsyncStorage)
  const session = getCurrentSession();
  if (session?.user.id) {
    await realtime.start(getClient);
    updateStatus({ realtimeMode: realtime.getMode() });
  }

  // Arm periodic sync if configured
  await armPeriodicSync();
}

export function onStatusChange(listener: StatusListener): () => void {
  statusListeners.push(listener);
  listener({ ...status });
  return () => {
    const index = statusListeners.indexOf(listener);
    if (index !== -1) {
      statusListeners.splice(index, 1);
    }
  };
}

export function onResult(listener: ResultListener): () => void {
  resultListeners.push(listener);
  if (lastResult) {
    listener(lastResult);
  }
  return () => {
    const index = resultListeners.indexOf(listener);
    if (index !== -1) {
      resultListeners.splice(index, 1);
    }
  };
}

export function getSyncStatus(): SyncStatus {
  return { ...status };
}

export function getLastResult(): SyncResult | null {
  return lastResult;
}

export function isSyncing(): boolean {
  return running;
}

/** Manual "Sync Now". Returns a summary of what happened, or null if skipped. */
export async function syncNow(
  source: SyncSource = 'manual',
  getClient: () => SupabaseClient | null = getSupabaseClient
): Promise<SyncResult | null> {
  clearDebounce();
  return runSync(source, getClient);
}

/** Called by the UI when the app returns to the foreground. */
export function onAppForeground(getClient: () => SupabaseClient | null = getSupabaseClient): void {
  if (!running) {
    scheduleSync('foreground', getClient);
  }
}

/** Schedules a debounced auto-sync (after local edits or on foreground). */
export function scheduleSync(
  source: SyncSource = 'auto',
  getClient: () => SupabaseClient | null = getSupabaseClient
): void {
  if (debounceTimer || running) {
    return;
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void runSync(source, getClient);
  }, DEBOUNCE_MS);
}

function clearDebounce(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}

function clearRetry(): void {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  retryAttempts = 0;
}

async function runSync(
  source: SyncSource,
  getClient: () => SupabaseClient | null
): Promise<SyncResult | null> {
  // Claim the run up-front so two triggers racing in the same tick can't both
  // pass the gate before either awaits. Released in `finally`.
  if (running) {
    return null;
  }
  running = true;

  const startTime = Date.now();
  const now = nowIso();

  try {
    const supabase = getClient();
    if (!isSyncConfigured() || !supabase) {
      setState('unconfigured');
      return null;
    }

    const session = getCurrentSession();
    if (!session?.user.id) {
      setState('idle');
      return null;
    }

    // Auto-sync gates — manual always runs
    if (source !== 'manual') {
      if (!(await getAutoSync())) {
        return null; // auto-sync disabled
      }
      if (source !== 'retry' && (await getWifiOnlySync())) {
        const network = await Network.getNetworkStateAsync();
        if (
          network.type !== Network.NetworkStateType.WIFI &&
          network.type !== Network.NetworkStateType.UNKNOWN
        ) {
          return null; // defer auto/realtime/foreground on cellular
        }
      }
    }

    // Connectivity gate — skip straight to an offline status when known down.
    const network = await Network.getNetworkStateAsync();
    if (network.isConnected === false) {
      setState('offline');
      return null;
    }

    // Minimum version enforcement — block sync if app is too old. A failed
    // fetch fails open (sync proceeds); only a confirmed stale version blocks.
    let appMeta = null;
    try {
      appMeta = await fetchAppMeta(getClient);
    } catch (e) {
      console.warn('[Sync] app-meta fetch failed, proceeding:', e instanceof Error ? e.message : String(e));
    }
    if (appMeta && !versionSatisfies(APP_VERSION, appMeta.min_version)) {
      setState('version_blocked');
      return null;
    }

    setState('syncing');

    console.log('[Sync] starting push (session present)');

    const userId = session.user.id;
    const pushResult = await pushPendingChanges(supabase, userId);
    if (pushResult.authError) {
      setState('idle');
      // Still record the sync attempt timestamp so "Last sync" isn't "Never".
      // A meta-write failure here must not mask the auth outcome.
      try {
        await setMeta(LAST_SYNC_KEY, now);
        updateStatus({ lastSyncAt: now });
      } catch (e) {
        console.warn('[Sync] timestamp write failed:', e instanceof Error ? e.message : String(e));
      }
      return null; // token expired — re-auth resumes syncing
    }

    const pullResult = await pullRemoteChanges(supabase, userId);

    // Persist the attempt timestamp; verify the read-back before reporting
    // success so a silent write failure doesn't claim a sync happened.
    let timestampOk = false;
    try {
      await setMeta(LAST_SYNC_KEY, now);
      timestampOk = (await getMeta(LAST_SYNC_KEY)) === now;
    } catch (e) {
      console.warn('[Sync] timestamp write failed:', e instanceof Error ? e.message : String(e));
    }
    if (pushResult.failed === 0) {
      try {
        await setMeta(LAST_SUCCESS_KEY, now);
      } catch (e) {
        console.warn('[Sync] success-stamp write failed:', e instanceof Error ? e.message : String(e));
      }
    }

    const result: SyncResult = {
      pushed: pushResult.pushed,
      deleted: pushResult.deleted,
      pulled: pullResult.inserted + pullResult.updated,
      inserted: pullResult.inserted,
      updated: pullResult.updated,
      failed: pushResult.failed,
      conflicts: pullResult.conflicts ?? 0,
      errors: [...pushResult.errors, ...pullResult.errors],
      durationMs: Date.now() - startTime,
      source,
    };

    // Record successful sync run in history (info event) so user sees activity.
    const totalChanges = pushResult.pushed + pushResult.deleted + pullResult.inserted + pullResult.updated;
    if (totalChanges > 0) {
      try {
        await addSyncEvent('info', `Synced ${totalChanges} change${totalChanges === 1 ? '' : 's'} (pushed ${pushResult.pushed}, pulled ${pullResult.inserted + pullResult.updated}).`);
      } catch (e) {
        console.warn('[Sync] history write failed:', e instanceof Error ? e.message : String(e));
      }
    }

    lastResult = result;
    updateStatus({
      lastSyncAt: timestampOk ? now : status.lastSyncAt,
      lastSuccessAt: pushResult.failed === 0 ? now : status.lastSuccessAt,
      state: pushResult.failed === 0 ? 'idle' : 'error',
    });

    // Stamp this device's name into the synced settings so other devices
    // show "Last Sync from <name>". Guarded so an unchanged name doesn't
    // re-enqueue (which would schedule another sync run).
    if (pushResult.failed === 0) {
      try {
        const deviceName = await getDeviceName();
        if (deviceName && (await getSetting('last_sync_from')) !== deviceName) {
          await setSetting('last_sync_from', deviceName);
        }
        // Record this device in the synced devices list (device-local table).
        if (deviceName) {
          await recordDeviceSync(deviceName);
        }
      } catch (e) {
        console.warn('[Sync] device-stamp write failed:', e instanceof Error ? e.message : String(e));
      }
      clearRetry();
    } else {
      // Some uploads failed — retry with backoff while auto-sync is on.
      if (await getAutoSync()) {
        scheduleRetry();
      }
    }

    try {
      await refreshQueueCounts();
    } catch (e) {
      console.warn('[Sync] queue-count refresh failed:', e instanceof Error ? e.message : String(e));
    }
    // Deliver the result even when bookkeeping above failed — the UI must
    // always learn the outcome.
    emitResult(result);
    return result;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);

    // Create the error result FIRST so its delivery below never depends on
    // timestamp persistence succeeding.
    const errorResult: SyncResult = {
      pushed: 0,
      deleted: 0,
      pulled: 0,
      inserted: 0,
      updated: 0,
      failed: 0,
      conflicts: 0,
      errors: [{
        table: 'sync_engine',
        uuid: '',
        operation: 'sync',
        code: 'UNEXPECTED_ERROR',
        message: errMsg,
      }],
      durationMs: Date.now() - startTime,
      source,
    };
    lastResult = errorResult;

    // Record the sync attempt timestamp even on unexpected errors — but a
    // failure here must not change the error outcome.
    try {
      await setMeta(LAST_SYNC_KEY, now);
      updateStatus({ lastSyncAt: now, state: 'error' });
    } catch (e) {
      console.warn('[Sync] error-path timestamp write failed:', e instanceof Error ? e.message : String(e));
      updateStatus({ state: 'error' });
    }

    try {
      emitResult(errorResult);
    } catch (e) {
      console.warn('[Sync] result delivery failed:', e instanceof Error ? e.message : String(e));
    }

    if (source !== 'manual') {
      try {
        if (await getAutoSync()) {
          scheduleRetry();
        }
      } catch {
        // Auto-sync setting unreadable — skip the retry, keep the result.
      }
    }
    // Don't re-throw for manual — let the UI show the error via lastResult
    return errorResult;
  } finally {
    running = false;
  }
}

function scheduleRetry(): void {
  if (retryTimer) {
    return;
  }
  const delay = Math.min(RETRY_BASE_MS * RETRY_DELAY_STEP ** retryAttempts, RETRY_MAX_MS);
  retryAttempts += 1;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void runSync('retry', getSupabaseClient);
  }, delay);
}

/**
 * Periodic background sync. Reads the persisted interval from sync_meta and
 * re-arms a timer; a stored 0 (or a read failure) leaves it off. Never fires
 * while a run is in flight — runSync is re-entrant-safe on `running`.
 */
export async function armPeriodicSync(): Promise<void> {
  if (periodicTimer) {
    clearInterval(periodicTimer);
    periodicTimer = null;
  }
  let minutes = 0;
  try {
    minutes = await getSyncIntervalMinutes();
  } catch {
    minutes = 0;
  }
  if (minutes <= 0) {
    return;
  }
  // Clamp to the 32-bit timer limit (~24.8 days) so a corrupt interval can
  // never overflow setTimeout into an immediate/undefined delay.
  const MAX_INTERVAL_MS = 2_147_483_647;
  const delayMs = Math.min(minutes * 60_000, MAX_INTERVAL_MS);
  periodicTimer = setInterval(() => {
    void runSync('auto', getSupabaseClient);
  }, delayMs);
}

/** Called on sign-in / sign-out so the status reflects the session again. */
export async function onAuthChanged(
  getClient: () => SupabaseClient | null = getSupabaseClient
): Promise<void> {
  // Queue this transition after any in-flight one.
  const previous = authTransition;
  let resolveNext: () => void;
  authTransition = new Promise((resolve) => { resolveNext = resolve; });
  await previous;

  try {
    clearDebounce();
    clearRetry();

    if (!isSyncConfigured()) {
      setState('unconfigured');
      return;
    }

    const session = getCurrentSession();
    if (!session?.user.id) {
      await realtime.stop(getClient);
      updateStatus({ realtimeMode: 'off' });
      setState('idle');
      return;
    }

    // If a different account signs in on this device, drop the previous
    // user's queued ops so they are never uploaded under the new user.
    const previousUser = await getMeta(CURRENT_USER_KEY);
    if (previousUser && previousUser !== session.user.id) {
      await clearQueue();
    }
    await setMeta(CURRENT_USER_KEY, session.user.id);

    // Listen for changes made on other devices while signed in.
    console.log('[Sync Engine] Auth changed - starting realtime...');
    await realtime.stop(getClient);
    await realtime.start(getClient);
    // Note: realtime mode will be updated via the onModeChange listener

    // A fresh login downloads the user's data (automatic restore).
    // Don't throw on error — let the UI display it via lastResult
    console.log('[Sync Engine] onAuthChanged - calling syncNow...');
    await syncNow('manual', getClient);
    console.log('[Sync Engine] onAuthChanged - syncNow completed');
  } finally {
    resolveNext!();
  }
}

export async function setAutoSync(enabled: boolean): Promise<void> {
  const { persistAutoSync } = await import('@/db/sync/meta');
  await persistAutoSync(enabled);
  updateStatus({ autoSync: enabled });
  if (enabled && !running) {
    scheduleSync('auto');
  }
}

export async function setWifiOnly(enabled: boolean): Promise<void> {
  const { persistWifiOnlySync } = await import('@/db/sync/meta');
  await persistWifiOnlySync(enabled);
  updateStatus({ wifiOnly: enabled });
}

export async function setIntervalMinutes(minutes: number): Promise<void> {
  const { persistSyncIntervalMinutes } = await import('@/db/sync/meta');
  const clamped = Math.max(0, Math.floor(minutes));
  await persistSyncIntervalMinutes(clamped);
  updateStatus({ intervalMinutes: clamped });
  await armPeriodicSync();
}