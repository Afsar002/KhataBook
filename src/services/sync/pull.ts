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
import { getPendingChanges } from '@/db/sync/queue';
import { deleteLocalRow, insertLocalRow, updateLocalRow } from '@/db/sync/rows';
import {
  loadUuidToIdMap,
  specFor,
  type SyncTableSpec,
} from '@/db/sync/tables';
import type { SyncError } from '@/services/sync/events';

export interface PullResult {
  inserted: number;
  updated: number;
  deleted: number;
  skipped: number;
  /** Rows where a newer cloud row overwrote a local change that wasn't uploaded yet. */
  conflicts: number;
  errors: SyncError[];
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

/** Page size for one pull batch — keeps large tables under query limits. */
const PULL_PAGE_SIZE = 500;

/** A pull-cursor position: (updated_at, id) keyset pair. */
interface CursorPos {
  updatedAt: string;
  id: string;
}

/** Compares two keyset positions so pagination advances deterministically. */
function comparePos(a: CursorPos, b: CursorPos): number {
  if (a.updatedAt !== b.updatedAt) {
    return a.updatedAt < b.updatedAt ? -1 : 1;
  }
  if (a.id !== b.id) {
    return a.id < b.id ? -1 : 1;
  }
  return 0;
}

/** Parses the stored cursor (`updated_at|id`; legacy value = `updated_at`). */
function parseCursorPos(stored: string): CursorPos | null {
  if (!stored) {
    return null;
  }
  const [updatedAt, id] = stored.split('|');
  return updatedAt ? { updatedAt, id: id ?? '' } : null;
}

async function fetchRemotePage(
  supabase: SupabaseClient,
  table: string,
  cursor: CursorPos | null
): Promise<Record<string, unknown>[]> {
  let query = supabase
    .from(table)
    .select('*')
    .order('updated_at', { ascending: true })
    .order('id', { ascending: true });
  if (cursor) {
    // Keyset on (updated_at, id): strictly after the last applied row, so
    // rows sharing the same updated_at can't loop or be skipped.
    query = query.or(
      `updated_at.gt."${cursor.updatedAt}",and(updated_at.eq."${cursor.updatedAt}",id.gt."${cursor.id}")`
    );
  }
  const { data, error } = await query.limit(PULL_PAGE_SIZE);
  if (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Sync Pull Fetch Failed] table=${table} error=${errMsg}`);
    throw error;
  }
  const rows = (data ?? []) as Record<string, unknown>[];
  console.log(`[Sync Pull] table=${table} fetched=${rows.length} rows`);
  return rows;
}

function extractErrorDetails(error: unknown): { code?: string; message: string } {
  const err = error as {
    code?: string;
    details?: string;
    hint?: string;
    message?: string;
    status?: number;
    statusText?: string;
  };
  const hasStructured =
    err.code !== undefined || err.details !== undefined || err.hint !== undefined;
  return hasStructured
    ? { code: err.code, message: `${err.message ?? ''} ${err.details ?? ''} ${err.hint ?? ''}`.trim() }
    : { message: error instanceof Error ? error.message : String(error) };
}

export async function pullRemoteChanges(
  supabase: SupabaseClient,
  _userId: string
): Promise<PullResult> {
  const db = getDatabase();
  const result: PullResult = { inserted: 0, updated: 0, deleted: 0, skipped: 0, conflicts: 0, errors: [] };

  // A conflict is a local change that still sits in the upload queue being
  // overwritten by a newer cloud row. Collect the (table, uuid) pairs once.
  const queued = await getPendingChanges();
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
    // Resume strictly after the last applied row: (updated_at, id) keyset so
    // rows sharing an updated_at can't loop or be skipped.
    let pageCursor = parseCursorPos((await getMeta(cursorKey(table))) ?? '');
    // Highest position applied cleanly this run — the checkpoint never moves
    // past a row that needs a retry (missing parent / apply error).
    let appliedPos = pageCursor;

    // Build uuid→id maps for ALL parent tables this table references
    // (not just the current table). These are needed by toLocalRow() to
    // resolve cloud FK uuids to local integer ids.
    const parentTables = [...new Set(Object.values(spec.fks))];
    const uuidToId: Record<string, number> = {};
    for (const parentTable of parentTables) {
      const parentMap = await loadUuidToIdMap(parentTable);
      Object.assign(uuidToId, parentMap);
    }
    console.log(
      `[Sync Pull] table=${table} cursor=${pageCursor ? `${pageCursor.updatedAt}|${pageCursor.id}` : '(start)'} parents=${parentTables.length}`
    );

    // Page through the table until exhausted or a row needs a retry.
    for (;;) {
      let remoteRows: Record<string, unknown>[];
      try {
        remoteRows = await fetchRemotePage(supabase, table, pageCursor);
      } catch (error) {
        const { code, message } = extractErrorDetails(error);
        result.errors.push({ table, uuid: '', operation: 'pull', code, message });
        break; // keep the checkpoint — refetch this table next pull
      }
      if (remoteRows.length === 0) {
        break;
      }

      let retryNeeded = false;

      for (const remote of remoteRows) {
        const remoteUpdatedAt = String(remote.updated_at ?? '');
        const remotePos: CursorPos = { updatedAt: remoteUpdatedAt, id: String(remote.id ?? '') };

        // Fetch the full row so a conflict can snapshot the local version instead
        // of silently discarding it.
        const local = await db.getFirstAsync<Record<string, unknown> | null>(
          `SELECT * FROM ${table} WHERE uuid = ?`,
          String(remote.id)
        );

        const isTombstone = Boolean(remote.deleted_at);
        const localUpdatedAt = (local?.updated_at as string | null) ?? null;

        if (local && localUpdatedAt && localUpdatedAt >= remoteUpdatedAt) {
          // Last-write-wins FIRST — even for tombstones: a newer local edit
          // beats a stale remote delete (the local row pushes and wins).
          result.skipped += 1;
        } else if (isTombstone) {
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
              try {
                await deleteLocalRow(db, spec, localKey as string | number);
                result.deleted += 1;
              } catch (error) {
                const { code, message } = extractErrorDetails(error);
                result.errors.push({ table, uuid: String(remote.id), operation: 'delete', code, message });
                retryNeeded = true; // don't checkpoint past a failed delete
                break;
              }
            }
          }
        } else {
          const localRow = toLocalRow(spec, remote, uuidToId);
          if (!localRow) {
            result.skipped += 1; // missing parent — resolved on a later pull
            retryNeeded = true; // don't checkpoint past an unresolvable row
            break;
          }

          try {
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
          } catch (error) {
            const { code, message } = extractErrorDetails(error);
            result.errors.push({ table, uuid: String(remote.id), operation: local ? 'update' : 'insert', code, message });
            retryNeeded = true; // don't checkpoint past a failed apply
            break;
          }
        }

        // This row is handled — it is safe for the cursor to pass it.
        if (!appliedPos || comparePos(appliedPos, remotePos) < 0) {
          appliedPos = remotePos;
        }
      }

      // Persist the checkpoint: everything up to (and including) the last
      // cleanly-applied row; a retry-needed row sits right after it.
      if (appliedPos) {
        await setMeta(cursorKey(table), `${appliedPos.updatedAt}|${appliedPos.id}`);
      }
      if (retryNeeded) {
        break; // refetch from the failed row on the next pull
      }

      const last = remoteRows[remoteRows.length - 1];
      if (!last || remoteRows.length < PULL_PAGE_SIZE) {
        break; // last page
      }
      // Advance to the next page (keyset from the last fetched row).
      pageCursor = { updatedAt: String(last.updated_at ?? ''), id: String(last.id ?? '') };
    }
  }

  return result;
}