/**
 * Local sync conflict store (`sync_conflicts` table).
 *
 * When a pull overwrites a local change that hadn't uploaded yet (last-write-wins
 * resolution), both sides are snapshotted here so nothing is silently lost. The
 * Conflicts screen lets the user review each record and either accept the cloud
 * version (default) or restore their own version, which re-applies the local
 * snapshot and queues it for upload. Device-local, never synced.
 */
import { getDatabase, nowIso } from '@/db/database';
import { enqueueChange } from '@/db/sync/queue-repo';
import { insertLocalRow, updateLocalRow } from '@/db/sync/rows';
import { specFor } from '@/db/sync/tables';
import type { SyncConflict } from '@/types';

export interface NewConflictRecord {
  tableName: string;
  recordUuid: string;
  message: string;
  /** JSON snapshot of the local row at conflict time (null for tombstone conflicts). */
  localJson?: string | null;
  /** JSON snapshot of the remote row at conflict time (null for tombstone conflicts). */
  remoteJson?: string | null;
}

/** Maps a snake_case row onto the SyncConflict shape. */
function mapRow(row: Record<string, unknown>): SyncConflict {
  return {
    id: row.id as number,
    tableName: row.tableName as string,
    recordUuid: row.recordUuid as string,
    message: row.message as string,
    localJson: (row.localJson as string) ?? null,
    remoteJson: (row.remoteJson as string) ?? null,
    resolved: (row.resolved as number) === 1,
    createdAt: row.createdAt as string,
  };
}

/**
 * Records a conflict. A pull can revisit the same (table, uuid) on later runs
 * while the local change is still queued, so an already-open conflict is not
 * duplicated.
 */
export async function addConflictRecord(input: NewConflictRecord): Promise<void> {
  const db = getDatabase();
  const existing = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM sync_conflicts WHERE table_name = ? AND record_uuid = ? AND resolved = 0 LIMIT 1',
    input.tableName,
    input.recordUuid
  );
  if (existing) {
    return;
  }
  await db.runAsync(
    `INSERT INTO sync_conflicts (table_name, record_uuid, message, local_json, remote_json, resolved, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?)`,
    input.tableName,
    input.recordUuid,
    input.message,
    input.localJson ?? null,
    input.remoteJson ?? null,
    nowIso()
  );
}

/** Unresolved conflicts, newest first. */
export async function listConflicts(limit = 200): Promise<SyncConflict[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT id, table_name AS tableName, record_uuid AS recordUuid, message,
            local_json AS localJson, remote_json AS remoteJson,
            resolved, created_at AS createdAt
     FROM sync_conflicts
     WHERE resolved = 0
     ORDER BY created_at DESC, id DESC
     LIMIT ?`,
    limit
  );
  return rows.map(mapRow);
}

/** Number of open conflicts (badge on the Settings entry). */
export async function countUnresolvedConflicts(): Promise<number> {
  const db = getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM sync_conflicts WHERE resolved = 0'
  );
  return row?.count ?? 0;
}

/** Accepts the cloud version — the conflict is acknowledged and closed. */
export async function resolveConflict(id: number): Promise<void> {
  const db = getDatabase();
  await db.runAsync('UPDATE sync_conflicts SET resolved = 1 WHERE id = ?', id);
}

/**
 * Restores the user's own version of a conflicted record. The local snapshot is
 * written back with a freshly bumped `updated_at` (so last-write-wins favors it
 * on the next pull) and enqueued for upload, then the conflict is closed.
 */
export async function restoreLocalVersion(id: number): Promise<void> {
  const db = getDatabase();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    `SELECT table_name AS tableName, record_uuid AS recordUuid, local_json AS localJson
     FROM sync_conflicts WHERE id = ?`,
    id
  );
  if (!row || !row.localJson) {
    throw new Error('No local version to restore for this conflict');
  }
  const tableName = row.tableName as string;
  const spec = specFor(tableName);
  if (!spec) {
    throw new Error(`Unknown table for restore: ${tableName}`);
  }
  const local = JSON.parse(row.localJson as string) as Record<string, unknown>;
  if (!local.uuid) {
    throw new Error('Local snapshot is missing its uuid');
  }
  // Bump the clock so the restored version wins the next LWW comparison.
  const restored = { ...local, updated_at: nowIso() };

  await db.withTransactionAsync(async () => {
    const exists = await db.getFirstAsync<{ id: number }>(
      `SELECT id FROM ${tableName} WHERE uuid = ?`,
      String(local.uuid)
    );
    if (exists) {
      await updateLocalRow(db, spec, restored);
    } else {
      await insertLocalRow(db, spec, restored);
    }
    // Push reads the live row, so a single queued op covers the restored version.
    await enqueueChange(db, {
      table: tableName,
      operation: 'update',
      recordUuid: String(local.uuid),
    });
    await resolveConflict(id);
  });
}
