/**
 * Sync engine — the single place that decides when and how the device and the
 * cloud get in sync. It is deliberately independent of the UI: it exposes a
 * plain status object and a listener callback, and both React contexts hook
 * into it.
 *
 * Responsibilities:
 *  - gate on configuration, a signed-in session and connectivity
 *  - push pending queue changes (upserts + delete tombstones)
 *  - pull remote changes (last-write-wins) and advance pull cursors
 *  - retry failed pushes with exponential backoff
 *  - debounce auto-sync so bursts of edits produce one upload
 */
import * as Network from 'expo-network';

import { APP_VERSION } from '@/constants/app';
import { purgeAuditLog } from '@/db/audit-log-repo';
import { nowIso } from '@/db/database';
import { getSetting, setSetting } from '@/db/settings';
import { clearQueue, countPending, purgeParked } from '@/db/sync/queue-repo';
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
import { pullRemoteChanges } from '@/db/sync/pull';
import { pushPendingChanges } from '@/db/sync/push';
import { fetchAppMeta, versionSatisfies } from '@/services/app-meta';
import { getDeviceName } from '@/services/device/device-name';
import { getCurrentSession } from '@/services/supabase/auth';
import { getSupabaseClient } from '@/services/supabase/client';
import { isSyncConfigured } from '@/services/supabase/config';
import { emitSyncResult, onQueueChange, onRemoteChange } from '@/services/sync/events';
import { startRealtime, stopRealtime } from '@/services/sync/realtime';
import type { SyncStatus } from '@/types';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Wait before the debounced auto-sync fires after a batch of local writes. */
const DEBOUNCE_MS = 1500;
const RETRY_BASE_MS = 30_000;
const RETRY_MAX_MS = 5 * 60_000;
const RETRY_DELAY_STEP = 2;

export interface SyncSummary {
  pushed: number;
  deleted: number;
  pulled: number;
  inserted: number;
  updated: number;
  failed: number;
  /** Local edits overwritten by a newer cloud row (last-write-wins). */
  conflicts: number;
}

export type SyncStatusListener = (status: SyncStatus, lastSyncAt: string | null) => void;

let status: SyncStatus = 'unconfigured';
let lastSyncAt: string | null = null;
let running = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let periodicTimer: ReturnType<typeof setInterval> | null = null;
let retryAttempts = 0;
let lastResult: SyncSummary | null = null;

const listeners: SyncStatusListener[] = [];

function notify(): void {
  for (const listener of listeners) {
    listener(status, lastSyncAt);
  }
}

function setStatus(next: SyncStatus): void {
  if (status !== next) {
    status = next;
    notify();
  }
}

export function getSyncStatus(): SyncStatus {
  return status;
}

export function getLastSyncAt(): string | null {
  return lastSyncAt;
}

export function getLastResult(): SyncSummary | null {
  return lastResult;
}

/** Loads persisted state (call once on boot, after the database is ready). */
export async function initSyncState(getClient: () => SupabaseClient | null = getSupabaseClient): Promise<void> {
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
    status = 'unconfigured';
    return;
  }
  // Check minimum version before starting sync
  const appMeta = await fetchAppMeta(getClient);
  if (!versionSatisfies(APP_VERSION, appMeta.min_version)) {
    status = 'version_blocked';
    notify();
    return;
  }
  lastSyncAt = await getMeta(LAST_SYNC_KEY);
  status = 'idle';
  notify();
}

export function onStatusChange(listener: SyncStatusListener): () => void {
  listeners.push(listener);
  listener(status, lastSyncAt);
  return () => {
    const index = listeners.indexOf(listener);
    if (index !== -1) {
      listeners.splice(index, 1);
    }
  };
}

/** True when a sync is currently running or a re-run is scheduled. */
export function isSyncing(): boolean {
  return running;
}

/** Manual "Sync Now". Returns a summary of what happened, or null if skipped. */
export async function syncNow(getClient: () => SupabaseClient | null = getSupabaseClient): Promise<SyncSummary | null> {
  clearDebounce();
  return runSync('manual', getClient);
}

/** Called by the UI when the app returns to the foreground. */
export function onAppForeground(getClient: () => SupabaseClient | null = getSupabaseClient): void {
  if (!running) {
    scheduleSync(getClient);
  }
}

/** Schedules a debounced auto-sync (after local edits or on foreground). */
export function scheduleSync(getClient: () => SupabaseClient | null = getSupabaseClient): void {
  if (debounceTimer || running) {
    return;
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void runSync('auto', getClient);
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
  source: 'manual' | 'auto',
  getClient: () => SupabaseClient | null
): Promise<SyncSummary | null> {
  if (running) {
    return null;
  }
  const supabase = getClient();
  if (!isSyncConfigured() || !supabase) {
    setStatus('unconfigured');
    return null;
  }
  const session = getCurrentSession();
  if (!session?.user.id) {
    setStatus('idle');
    return null;
  }
  if (source === 'auto' && !(await getAutoSync())) {
    return null; // auto-sync disabled; manual Sync Now still works
  }
  // Wi-Fi-only gate — auto-sync defers on cellular (before the run "starts" so
  // status is untouched); manual "Sync Now" always runs.
  if (source === 'auto' && (await getWifiOnlySync())) {
    const network = await Network.getNetworkStateAsync();
    if (
      network.type !== Network.NetworkStateType.WIFI &&
      network.type !== Network.NetworkStateType.UNKNOWN
    ) {
      return null;
    }
  }

  running = true;
  setStatus('syncing');

  const userId = session.user.id;
  const now = nowIso();

  try {
    // Connectivity gate — skip straight to an offline status when known down.
    const network = await Network.getNetworkStateAsync();
    if (network.isConnected === false) {
      setStatus('offline');
      return null;
    }

    // Minimum version enforcement — block sync if app is too old.
    const appMeta = await fetchAppMeta(getClient);
    if (!versionSatisfies(APP_VERSION, appMeta.min_version)) {
      setStatus('version_blocked');
      return null;
    }

    const pushResult = await pushPendingChanges(supabase, userId);
    if (pushResult.authError) {
      setStatus('idle');
      return null; // token expired — re-auth resumes syncing
    }

    const pullResult = await pullRemoteChanges(supabase, userId);

    await setMeta(LAST_SYNC_KEY, now);
    if (pushResult.failed === 0) {
      await setMeta(LAST_SUCCESS_KEY, now);
    }
    lastSyncAt = now;
    lastResult = {
      pushed: pushResult.pushed,
      deleted: pushResult.deleted,
      pulled: pullResult.inserted + pullResult.updated,
      inserted: pullResult.inserted,
      updated: pullResult.updated,
      failed: pushResult.failed,
      conflicts: pullResult.conflicts ?? 0,
    };
    // Let listeners (e.g. sync-outcome notifications) react to the finished run.
    emitSyncResult(lastResult);

    if (pushResult.failed === 0) {
      // Stamp this device's name into the synced settings so other devices
      // show "Last Sync from <name>". Guarded so an unchanged name doesn't
      // re-enqueue (which would schedule another sync run).
      const deviceName = await getDeviceName();
      if (deviceName && (await getSetting('last_sync_from')) !== deviceName) {
        await setSetting('last_sync_from', deviceName);
      }
      // Record this device in the synced devices list (device-local table).
      if (deviceName) {
        await recordDeviceSync(deviceName);
      }
      clearRetry();
      setStatus('idle');
    } else {
      // Some uploads failed — retry with backoff while auto-sync is on.
      if (await getAutoSync()) {
        scheduleRetry();
      }
      setStatus('error');
    }
    return lastResult;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Sync Engine Error] source=${source} error=${errMsg}`);
    setStatus('error');
    if (source === 'auto' && (await getAutoSync())) {
      scheduleRetry();
    }
    if (source === 'manual') {
      throw error;
    }
    return null;
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
    void runSync('auto', getSupabaseClient);
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
  periodicTimer = setInterval(() => {
    void runSync('auto', getSupabaseClient);
  }, minutes * 60_000);
}

/** Called on sign-in / sign-out so the status reflects the session again. */
export async function onAuthChanged(getClient: () => SupabaseClient | null = getSupabaseClient): Promise<void> {
  clearDebounce();
  clearRetry();
  if (!isSyncConfigured()) {
    setStatus('unconfigured');
    return;
  }
  const session = getCurrentSession();
  if (!session?.user.id) {
    stopRealtime();
    setStatus('idle');
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
  await stopRealtime();
  startRealtime();
  // A fresh login downloads the user's data (automatic restore).
  await syncNow(getClient);
}

/** Number of local operations waiting to upload (for status badges). */
export function pendingCount(): Promise<number> {
  return countPending();
}

// Local edits (enqueue) automatically schedule a debounced upload.
onQueueChange(() => scheduleSync());
// A change made on another device (live sync) wakes this device up for a pull.
onRemoteChange(() => scheduleSync());
