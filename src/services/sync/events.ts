/**
 * Tiny typed event bus for the sync engine.
 *
 * Repos emit a "queue change" event whenever they enqueue an operation, and the
 * Realtime service emits a "remote change" event whenever the cloud reports a
 * new row change; the sync engine subscribes to both and schedules a debounced
 * sync. Keeping the bus here (a leaf module) avoids circular imports between
 * repos, the Realtime service, and the engine.
 */

import type { SyncSummary } from '@/services/sync/sync-engine';

type ChangeListener = () => void;

let queueListeners: ChangeListener[] = [];
let remoteListeners: ChangeListener[] = [];
let recurringListeners: ChangeListener[] = [];

type SyncResultListener = (summary: SyncSummary) => void;
let syncResultListeners: SyncResultListener[] = [];

function subscribe(list: ChangeListener[], listener: ChangeListener): () => void {
  list.push(listener);
  return () => {
    const index = list.indexOf(listener);
    if (index !== -1) {
      list.splice(index, 1);
    }
  };
}

function emit(list: ChangeListener[]): void {
  for (const listener of [...list]) {
    listener();
  }
}

function subscribeResult(list: SyncResultListener[], listener: SyncResultListener): () => void {
  list.push(listener);
  return () => {
    const index = list.indexOf(listener);
    if (index !== -1) {
      list.splice(index, 1);
    }
  };
}

function emitResult(list: SyncResultListener[], summary: SyncSummary): void {
  for (const listener of [...list]) {
    listener(summary);
  }
}

/** Subscribes to queue-change events; returns an unsubscribe function. */
export function onQueueChange(listener: ChangeListener): () => void {
  return subscribe(queueListeners, listener);
}

/** Notifies subscribers that a change was queued for upload. */
export function emitQueueChange(): void {
  emit(queueListeners);
}

/** Subscribes to remote-change events (live sync signals); returns an unsubscribe function. */
export function onRemoteChange(listener: ChangeListener): () => void {
  return subscribe(remoteListeners, listener);
}

/** Notifies subscribers that the cloud reported a change needing a pull. */
export function emitRemoteChange(): void {
  emit(remoteListeners);
}

/**
 * Subscribes to recurring-template changes so the reminder scheduler can
 * re-arm notifications when templates are created/edited/deleted/toggled.
 */
export function onRecurringChanged(listener: ChangeListener): () => void {
  return subscribe(recurringListeners, listener);
}

/** Notifies subscribers that a recurring template changed. */
export function emitRecurringChanged(): void {
  emit(recurringListeners);
}

/** Subscribes to completed-sync summaries; returns an unsubscribe function. */
export function onSyncResult(listener: SyncResultListener): () => void {
  return subscribeResult(syncResultListeners, listener);
}

/** Notifies subscribers that a sync run finished with a summary. */
export function emitSyncResult(summary: SyncSummary): void {
  emitResult(syncResultListeners, summary);
}
