/**
 * Pulls remote changes from Supabase and applies them to local SQLite.
 *
 * Rows are fetched per table using a pull cursor (`updated_at > last pulled`),
 * then merged with last-write-wins: if a remote row is newer it overwrites the
 * local row; if the local row is newer it is left alone and will be pushed.
 * Remote tombstones (`deleted_at` set) hard-delete the local row. Parents are
 * pulled before children so cloud foreign keys always resolve locally.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import { getDatabase } from '@/db/database';
import { addConflictRecord } from '@/db/sync/conflict-repo';
import { addSyncEvent } from '@/db/sync/history-repo';
import { cursorKey, getMeta, setMeta } from '@/db/sync/meta';
import { listPendingChanges } from '@/db/sync/queue-repo';
import { deleteLocalRow, insertLocalRow, updateLocalRow } from '@/db/sync/rows';
import {
  loadUuidToIdMap,
  specFor,
  type SyncTableSpec,
} from '@/db/sync/tables';

export interface PullResult {
  inserted: number;
  updated: number;
  deleted: number;
  skipped: number;
  /** Rows where a newer cloud row overwrote a local change that wasn't uploaded yet. */
  conflicts: number;
}

/** Internal table names → friendly labels used in the sync history log. */
const TABLE_LABEL: Record<string, string> = {
  accounts: 'account',
  categories: 'category',
  transactions: 'entry',
  transfers: 'transfer',
  parties: 'party',
  party_transactions: 'party entry',
  settings: 'setting',
};

const labelFor = (table: string): string => TABLE_LABEL[table] ?? table;

/** Cloud row → local row for a table, mapping FKs from uuids to local ids. */
function toLocalRow(
  spec: SyncTableSpec,
  remote: Record<string, unknown>,
  uuidToId: Record<string, number>
): Record<string, unknown> | null {
  const row: Record<string, unknown> = {
    uuid: remote.id,
    user_id: remote.user_id ?? null,
    updated_at: remote.updated_at,
    deleted_at: remote.deleted_at ?? null,
    version: remote.version ?? 1,
    // Local `settings` table now has `created_at` (added in migrateV14).
    created_at: remote.created_at ?? null,
  };
  for (const column of spec.columns) {
    const refTable = spec.fks[column];
    if (refTable) {
      const refUuid = remote[column];
      if (refUuid && typeof refUuid === 'string') {
        const localId = uuidToId[refUuid];
        if (localId === undefined) {
          return null; // parent not present locally yet — skip, retry next pull
        }
        row[column] = localId;
      } else {
        row[column] = null; // nullable FK (e.g. category_id)
      }
    } else {
      row[column] = remote[column];
    }
  }
  if (spec.table === 'settings') {
    row.key = remote.key;
  }
  // Cloud rows written before schema v12 have no `attachments` value, but the
  // local column is NOT NULL — default it instead of binding a null (which
  // would abort the whole pull with a constraint error).
  if (spec.table === 'transactions' || spec.table === 'party_transactions') {
    row.attachments = row.attachments ?? '[]';
  }
  return row;
}

async function fetchRemote(
  supabase: SupabaseClient,
  table: string,
  cursor: string
): Promise<Record<string, unknown>[]> {
  let query = supabase.from(table).select('*').order('updated_at', { ascending: true });
  if (cursor) {
    query = query.gt('updated_at', cursor);
  }
  const { data, error } = await query;
  if (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Sync Pull Fetch Failed] table=${table} error=${errMsg}`);
    throw error;
  }
  return (data ?? []) as Record<string, unknown>[];
}

export async function pullRemoteChanges(
  supabase: SupabaseClient,
  _userId: string
): Promise<PullResult> {
  const db = getDatabase();
  const result: PullResult = { inserted: 0, updated: 0, deleted: 0, skipped: 0, conflicts: 0 };

  // A conflict is a local change that still sits in the upload queue being
  // overwritten by a newer cloud row. Collect the (table, uuid) pairs once.
  const queued = await listPendingChanges();
  const queuedKeys = new Set(queued.map((entry) => `${entry.tableName}:${entry.recordUuid}`));

  const tableOrder = [
    'accounts',
    'categories',
    'parties',
    'transactions',
    'transfers',
    'party_transactions',
    'settings',
  ];

  for (const table of tableOrder) {
    const spec = specFor(table);
    if (!spec) {
      continue;
    }
    const cursor = (await getMeta(cursorKey(table))) ?? '';
    const remoteRows = await fetchRemote(supabase, table, cursor);
    const uuidToId = await loadUuidToIdMap(table);

    let lastUpdatedAt = cursor;

    for (const remote of remoteRows) {
      const remoteUpdatedAt = remote.updated_at as string;
      if (remoteUpdatedAt && remoteUpdatedAt > lastUpdatedAt) {
        lastUpdatedAt = remoteUpdatedAt;
      }

      // Fetch the full row so a conflict can snapshot the local version instead
      // of silently discarding it.
      const local = await db.getFirstAsync<Record<string, unknown> | null>(
        `SELECT * FROM ${table} WHERE uuid = ?`,
        String(remote.id)
      );

      const isTombstone = Boolean(remote.deleted_at);

      if (isTombstone) {
        if (local) {
          const localKey = spec.table === 'settings' ? local.key : local.id;
          if (localKey !== undefined) {
            const queuedKey = `${table}:${String(remote.id)}`;
            if (queuedKeys.has(queuedKey)) {
              result.conflicts += 1;
              const message = `A ${labelFor(table)} deleted on another device removed an unsynced local change.`;
              await addSyncEvent('conflict', message);
              await addConflictRecord({
                tableName: table,
                recordUuid: String(remote.id),
                message,
                localJson: JSON.stringify(local),
                remoteJson: null,
              });
            }
            await deleteLocalRow(db, spec, localKey as string | number);
            result.deleted += 1;
          }
        }
        continue;
      }

      const localUpdatedAt = (local?.updated_at as string | null) ?? null;
      // Last-write-wins: only apply when the remote row is newer.
      if (local && localUpdatedAt && localUpdatedAt >= remoteUpdatedAt) {
        result.skipped += 1;
        continue;
      }

      const localRow = toLocalRow(spec, remote, uuidToId);
      if (!localRow) {
        result.skipped += 1; // missing parent — resolved on a later pull
        continue;
      }

      if (local) {
        const queuedKey = `${table}:${String(remote.id)}`;
        if (queuedKeys.has(queuedKey)) {
          result.conflicts += 1;
          const message = `A newer ${labelFor(table)} from the cloud replaced an unsynced local change.`;
          await addSyncEvent('conflict', message);
          await addConflictRecord({
            tableName: table,
            recordUuid: String(remote.id),
            message,
            localJson: JSON.stringify(local),
            remoteJson: JSON.stringify(remote),
          });
        }
        await updateLocalRow(db, spec, localRow);
        result.updated += 1;
      } else {
        await insertLocalRow(db, spec, localRow);
        result.inserted += 1;
      }
    }

    // Advance the cursor only after the whole table batch applied cleanly.
    if (lastUpdatedAt !== cursor) {
      await setMeta(cursorKey(table), lastUpdatedAt);
    }
  }

  return result;
}

