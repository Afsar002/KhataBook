/**
 * Tiny typed event bus for the sync system.
 *
 * Repos emit a "queue change" event whenever they enqueue an operation, and
 * the Realtime service emits a "remote wake" event whenever the cloud reports
 * a new row change; the sync engine subscribes to both and schedules a
 * debounced sync. Keeping the bus here (a leaf module) avoids circular imports
 * between repos, the Realtime service, and the engine.
 */

type ChangeListener = () => void;

let queueListeners: ChangeListener[] = [];
let remoteListeners: ChangeListener[] = [];
let recurringListeners: ChangeListener[] = [];

type SyncResultListener = (summary: SyncResult) => void;
let syncResultListeners: SyncResultListener[] = [];

/** Shape of a completed sync run — matches engine's SyncResult. */
export interface SyncResult {
  pushed: number;
  deleted: number;
  pulled: number;
  inserted: number;
  updated: number;
  failed: number;
  conflicts: number;
  errors: SyncError[];
  durationMs: number;
  source: SyncSource;
}

export type SyncSource = 'manual' | 'auto' | 'realtime' | 'retry' | 'foreground';

export interface SyncError {
  table: string;
  uuid: string;
  operation: string;
  code?: string;
  message: string;
}

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

function subscribeRecurring(list: ChangeListener[], listener: ChangeListener): () => void {
  list.push(listener);
  return () => {
    const index = list.indexOf(listener);
    if (index !== -1) {
      list.splice(index, 1);
    }
  };
}

function emitRecurring(list: ChangeListener[]): void {
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

function emitResult(list: SyncResultListener[], summary: SyncResult): void {
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

/** Subscribes to remote-wake events (live sync signals); returns an unsubscribe function. */
export function onRemoteWake(listener: ChangeListener): () => void {
  return subscribe(remoteListeners, listener);
}

/** Notifies subscribers that the cloud reported a change needing a pull. */
export function emitRemoteWake(): void {
  emit(remoteListeners);
}

/** Subscribes to completed-sync summaries; returns an unsubscribe function. */
export function onSyncResult(listener: SyncResultListener): () => void {
  return subscribeResult(syncResultListeners, listener);
}

/** Notifies subscribers that a sync run finished with a summary. */
export function emitSyncResult(summary: SyncResult): void {
  emitResult(syncResultListeners, summary);
}

/** Subscribes to recurring-template changes (for reminder re-scheduling). */
export function onRecurringChanged(listener: ChangeListener): () => void {
  return subscribeRecurring(recurringListeners, listener);
}

/** Notifies subscribers that a recurring template was added/edited/deleted. */
export function emitRecurringChanged(): void {
  emitRecurring(recurringListeners);
}