/**
 * Local sync queue — pure functions, no module-level state.
 *
 * Every write to a synced table enqueues an operation here (coalesced to one
 * row per table + record uuid) before it is uploaded. The queue is SQLite
 * backed, so pending changes survive app restarts and work fully offline.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import { getDatabase } from '@/db/database';
import type { SyncOperation } from '@/types';

export interface QueuedChange {
  id: number;
  tableName: string;
  recordUuid: string;
  operation: SyncOperation;
  payload: Record<string, unknown>;
  status: 'pending' | 'failed';
  retryCount: number;
  createdAt: string;
  lastAttemptAt: string | null;
}

/** Maximum upload attempts before an operation is parked for manual retry. */
export const MAX_RETRY_COUNT = 10;

/**
 * Queues a change, coalescing so each (table, record uuid) has at most one
 * pending intent: a later operation replaces the earlier one and a delete
 * always wins. Call this inside the same transaction as the local write so
 * a failure rolls both back.
 */
export async function enqueueChange(
  db: SQLiteDatabase,
  tableName: string,
  recordUuid: string,
  operation: SyncOperation,
  payload?: Record<string, unknown> | null
): Promise<void> {
  // `payload` is NOT NULL; when the caller has no snapshot (update/delete ops,
  // which push re-reads live anyway), store the empty-JSON default instead of
  // JS `null` so the write does not violate the constraint.
  const payloadJson = payload === undefined || payload === null ? '{}' : JSON.stringify(payload);

  const existing = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM sync_queue WHERE table_name = ? AND record_uuid = ?',
    tableName,
    recordUuid
  );

  if (existing) {
    const finalOp: SyncOperation = operation === 'delete' ? 'delete' : operation;
    await db.runAsync(
      `UPDATE sync_queue
         SET operation = ?, payload = ?, status = 'pending', retry_count = 0, last_attempt_at = NULL
       WHERE id = ?`,
      finalOp,
      payloadJson,
      existing.id
    );
  } else {
    await db.runAsync(
      'INSERT INTO sync_queue (operation, table_name, record_uuid, payload) VALUES (?, ?, ?, ?)',
      operation,
      tableName,
      recordUuid,
      payloadJson
    );
  }
}

/** Pending + failed operations, oldest first. */
export async function getPendingChanges(
  db: SQLiteDatabase = getDatabase()
): Promise<QueuedChange[]> {
  return db.getAllAsync<QueuedChange>(
    `SELECT id, operation, table_name AS tableName, record_uuid AS recordUuid,
            payload, status, retry_count AS retryCount, created_at AS createdAt,
            last_attempt_at AS lastAttemptAt
     FROM sync_queue
     ORDER BY created_at ASC, id ASC`
  );
}

/** Removes a successfully uploaded operation. */
export async function markDone(id: number, db: SQLiteDatabase = getDatabase()): Promise<void> {
  await db.runAsync('DELETE FROM sync_queue WHERE id = ?', id);
}

/** Marks an operation as failed and bumps its retry counter. */
export async function markFailed(
  id: number,
  retryCount: number,
  db: SQLiteDatabase = getDatabase()
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
export async function clearQueue(db: SQLiteDatabase = getDatabase()): Promise<void> {
  await db.runAsync('DELETE FROM sync_queue');
}

/** Number of operations waiting to upload (for status badges). */
export async function countPending(db: SQLiteDatabase = getDatabase()): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM sync_queue'
  );
  return row?.count ?? 0;
}

/** Number of operations parked as failed (never auto-retried). */
export async function countFailed(db: SQLiteDatabase = getDatabase()): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM sync_queue WHERE status = 'failed'"
  );
  return row?.count ?? 0;
}

/**
 * Resets every parked (failed) operation back to `pending` so the next sync
 * run uploads it again. Returns the number of operations released.
 */
export async function retryAll(db: SQLiteDatabase = getDatabase()): Promise<number> {
  const result = await db.runAsync(
    `UPDATE sync_queue
       SET status = 'pending', retry_count = 0, last_attempt_at = NULL
     WHERE status = 'failed'`
  );
  return result.changes;
}

/**
 * Deletes parked operations whose last attempt is older than `maxAgeDays`, so
 * a queue with long-unfixable failures never grows unbounded. Call on boot.
 * Returns the number of rows purged.
 */
export async function purgeParked(maxAgeDays = 30, db: SQLiteDatabase = getDatabase()): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeDays * 86_400_000).toISOString();
  const result = await db.runAsync(
    `DELETE FROM sync_queue
     WHERE status = 'failed' AND last_attempt_at IS NOT NULL AND last_attempt_at < ?`,
    cutoff
  );
  return result.changes;
}