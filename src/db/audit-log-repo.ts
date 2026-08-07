/**
 * Device-local audit trail.
 *
 * Every syncable mutation (insert/update/delete) writes a row here alongside
 * the sync queue, capturing who changed which record when. The log is
 * append-only — coalescing never rewrites an earlier event — and is purged
 * after 90 days on boot so it can't grow unbounded. Device-local, never synced.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import { getDatabase } from '@/db/database';
import { getCurrentSession } from '@/services/supabase/auth';
import type { AuditEvent, SyncOperation } from '@/types';

export interface AuditChangeInput {
  table: string;
  operation: SyncOperation;
  recordUuid: string;
  /** Optional snapshot of the payload for diagnostics. */
  payload?: Record<string, unknown> | null;
}

/** Retention window for audit rows (days). Purged on boot, like parked sync ops. */
export const AUDIT_RETENTION_DAYS = 90;

/**
 * Records a mutation in the audit log. Call inside the same transaction as the
 * write it describes so a failure rolls both back. User attribution comes from
 * the current session and is `null` when signed out (offline-only mode).
 */
export async function auditChange(
  db: SQLiteDatabase,
  change: AuditChangeInput
): Promise<void> {
  const userId = getCurrentSession()?.user.id ?? null;
  const payload =
    change.payload === undefined || change.payload === null
      ? null
      : JSON.stringify(change.payload);
  await db.runAsync(
    `INSERT INTO audit_log (table_name, operation, record_uuid, user_id, payload)
     VALUES (?, ?, ?, ?, ?)`,
    change.table,
    change.operation,
    change.recordUuid,
    userId,
    payload
  );
}

/** Most recent audit events, newest first. */
export async function listAuditEvents(
  limit = 100,
  db = getDatabase()
): Promise<AuditEvent[]> {
  return db.getAllAsync<AuditEvent>(
    `SELECT id, table_name AS tableName, operation,
            record_uuid AS recordUuid, user_id AS userId, payload, created_at AS createdAt
     FROM audit_log
     ORDER BY created_at DESC, id DESC
     LIMIT ?`,
    limit
  );
}

/** Total audit events on this device. */
export async function countAuditEvents(db = getDatabase()): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM audit_log'
  );
  return row?.count ?? 0;
}

/**
 * Deletes audit rows older than `maxAgeDays`, bounding the log's growth.
 * Called on boot (best-effort, like `purgeParked`). Returns rows purged.
 */
export async function purgeAuditLog(
  maxAgeDays = AUDIT_RETENTION_DAYS,
  db = getDatabase()
): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeDays * 86_400_000).toISOString();
  const result = await db.runAsync(
    'DELETE FROM audit_log WHERE created_at < ?',
    cutoff
  );
  return result.changes;
}
