/**
 * Local sync queue.
 *
 * Every write to a synced table enqueues an operation here (coalesced to one
 * row per table + record uuid) before it is uploaded. The queue is SQLite
 * backed, so pending changes survive app restarts and work fully offline.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import { auditChange } from '@/db/audit-log-repo';
import { getDatabase } from '@/db/database';
import { emitQueueChange } from '@/services/sync/events';
import type { SyncOperation, SyncQueueEntry, SyncQueueStatus } from '@/types';

export interface ChangeToEnqueue {
  table: string;
  operation: SyncOperation;
  recordUuid: string;
  /** Snapshot of the row, stored for diagnostics; push reads the live row. */
  payload?: Record<string, unknown> | null;
}

/** Maximum upload attempts before an operation is parked for manual retry. */
export const MAX_RETRY_COUNT = 10;

/**
 * Queues a change, coalescing so each (table, record uuid) has at most one
 * pending intent: a later operation replaces the earlier one and a delete
 * always wins. Call this inside the same transaction as the local write so
 * a failure rolls both back.
 */
export async function enqueueChange(db: SQLiteDatabase, change: ChangeToEnqueue): Promise<void> {
  // Record the mutation in the immutable audit trail (same transaction). The
  // queue coalesces to one row per (table, uuid); the audit log keeps every
  // event so the mutation history is never collapsed.
  await auditChange(db, {
    table: change.table,
    operation: change.operation,
    recordUuid: change.recordUuid,
    payload: change.payload ?? null,
  });

  // `payload` is NOT NULL; when the caller has no snapshot (update/delete ops,
  // which push re-reads live anyway), store the empty-JSON default instead of
  // JS `null` so the write does not violate the constraint.
  const payload = change.payload === undefined ? '{}' : JSON.stringify(change.payload);
  const existing = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM sync_queue WHERE table_name = ? AND record_uuid = ?',
    change.table,
    change.recordUuid
  );

  if (existing) {
    const operation: SyncOperation =
      change.operation === 'delete' ? 'delete' : change.operation;
    await db.runAsync(
      `UPDATE sync_queue
         SET operation = ?, payload = ?, status = 'pending', retry_count = 0, last_attempt_at = NULL
       WHERE id = ?`,
      operation,
      payload,
      existing.id
    );
  } else {
    await db.runAsync(
      'INSERT INTO sync_queue (operation, table_name, record_uuid, payload) VALUES (?, ?, ?, ?)',
      change.operation,
      change.table,
      change.recordUuid,
      payload
    );
  }
  emitQueueChange();
}

/** Pending + failed operations, oldest first. */
export async function listPendingChanges(
  db = getDatabase()
): Promise<SyncQueueEntry[]> {
  return db.getAllAsync<SyncQueueEntry>(
    `SELECT id, operation, table_name AS tableName, record_uuid AS recordUuid,
            payload, status, retry_count AS retryCount, created_at AS createdAt
     FROM sync_queue
     ORDER BY created_at ASC, id ASC`
  );
}

/** Removes a successfully uploaded operation. */
export async function markDone(id: number, db = getDatabase()): Promise<void> {
  await db.runAsync('DELETE FROM sync_queue WHERE id = ?', id);
}

/** Marks an operation as failed and bumps its retry counter. */
export async function markFailed(
  id: number,
  retryCount: number,
  db = getDatabase()
): Promise<void> {
  await db.runAsync(
    `UPDATE sync_queue
       SET status = 'failed', retry_count = ?, last_attempt_at = ?
     WHERE id = ?`,
    retryCount,
    new Date().toISOString(),
    id
  );
}

/** Drops every queued operation (used when the user changes). */
export async function clearQueue(db = getDatabase()): Promise<void> {
  await db.runAsync('DELETE FROM sync_queue');
}

/** Number of operations waiting to upload (for badges / status). */
export async function countPending(db = getDatabase()): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM sync_queue'
  );
  return row?.count ?? 0;
}

/** Number of operations parked as failed (never auto-retried). */
export async function countFailed(db = getDatabase()): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM sync_queue WHERE status = 'failed'"
  );
  return row?.count ?? 0;
}

/**
 * Resets every parked (failed) operation back to `pending` so the next sync
 * run uploads it again. Returns the number of operations released.
 */
export async function retryAll(db = getDatabase()): Promise<number> {
  const result = await db.runAsync(
    `UPDATE sync_queue
       SET status = 'pending', retry_count = 0, last_attempt_at = NULL
     WHERE status = 'failed'`
  );
  if (result.changes > 0) {
    emitQueueChange();
  }
  return result.changes;
}

/**
 * Deletes parked operations whose last attempt is older than `maxAgeDays`, so
 * a queue with long-unfixable failures never grows unbounded. Call on boot.
 * Returns the number of rows purged.
 */
export async function purgeParked(maxAgeDays = 30, db = getDatabase()): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeDays * 86_400_000).toISOString();
  const result = await db.runAsync(
    `DELETE FROM sync_queue
     WHERE status = 'failed' AND last_attempt_at IS NOT NULL AND last_attempt_at < ?`,
    cutoff
  );
  return result.changes;
}

/**
 * Auto-cleanup sync queue: runs automatically on app initialization to clean up
 * stale failed operations that have never been retried successfully.
 * Returns the number of operations purged.
 */
export async function autoCleanupQueue(db = getDatabase()): Promise<number> {
  return await purgeParked(30, db);
}

export type { SyncQueueStatus };
