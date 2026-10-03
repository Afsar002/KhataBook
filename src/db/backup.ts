/**
 * JSON backup / restore.
 *
 * Serialises every table into one portable JSON file so the whole ledger
 * can be saved (and later restored) exactly as it was. Column lists are
 * hard-coded here and never read from the incoming file, so a restored file
 * can only ever target the tables DailyKhata actually owns.
 */

import { getDatabase, nowIso } from '@/db/database';
import { clearQueue, enqueueChange } from '@/db/sync/queue';
import { uuid } from '@/utils/uuid';
import { fetchAppMeta } from '@/services/app-meta';
import { getCurrentSession } from '@/services/supabase/auth';

const BACKUP_APP = 'dailykhata';
/** App id written by pre-rename backups; still accepted so old files restore. */
const LEGACY_BACKUP_APP = 'khatabook';
const BACKUP_VERSION = 2;

/** Every table and its columns, in foreign-key dependency order for restore. */
export const TABLE_COLUMNS: Record<string, string[]> = {
  accounts: ['id', 'name', 'type', 'opening_balance', 'sort_order', 'created_at'],
  categories: ['id', 'name', 'type', 'icon', 'sort_order', 'created_at'],
  transactions: ['id', 'type', 'amount', 'account_id', 'category_id', 'note', 'date', 'time', 'kind', 'attachments', 'created_at'],
  transfers: ['id', 'from_account_id', 'to_account_id', 'amount', 'note', 'date', 'time', 'created_at'],
  parties: ['id', 'name', 'type', 'phone', 'opening_balance', 'created_at'],
  party_transactions: ['id', 'party_id', 'direction', 'amount', 'note', 'date', 'time', 'kind', 'attachments', 'created_at'],
  settings: ['key', 'value'],
};

/**
 * Sync bookkeeping columns, exported alongside the data so uuids survive a
 * file restore and the cloud upsert merges instead of duplicating rows.
 */
const BACKUP_SYNC_COLUMNS = ['uuid', 'user_id', 'updated_at', 'deleted_at', 'version'];

export type BackupRow = Record<string, string | number | null>;

export interface BackupFile {
  app: string;
  version: number;
  createdAt: string;
  tables: Record<string, BackupRow[]>;
}

/** Reads every table into a plain JSON structure (raw rows, no formatting). */
export async function buildBackup(): Promise<BackupFile> {
  const db = getDatabase();
  const tables: Record<string, BackupRow[]> = {};
  for (const [table, columns] of Object.entries(TABLE_COLUMNS)) {
    tables[table] = await db.getAllAsync<BackupRow>(
      `SELECT ${[...columns, ...BACKUP_SYNC_COLUMNS].join(', ')} FROM ${table}`
    );
  }
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    tables,
  };
}

/** Returns the backup as a ready-to-write JSON string. */
export async function buildBackupJSON(): Promise<string> {
  return JSON.stringify(await buildBackup());
}

/** Validates a raw string as a DailyKhata backup. Returns null if invalid. */
export function parseBackup(json: string): BackupFile | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }
  const obj = parsed as Record<string, unknown>;
  if (
    (obj.app !== BACKUP_APP && obj.app !== LEGACY_BACKUP_APP) ||
    (obj.version !== 1 && obj.version !== BACKUP_VERSION)
  ) {
    return null;
  }
  const tables = obj.tables;
  if (typeof tables !== 'object' || tables === null) {
    return null;
  }
  const tableMap = tables as Record<string, unknown>;
  for (const table of Object.keys(TABLE_COLUMNS)) {
    const rows = tableMap[table];
    // v1 backups predate the transfers table.
    if (rows === undefined && table === 'transfers' && obj.version === 1) {
      continue;
    }
    if (!Array.isArray(rows)) {
      return null;
    }
    for (const row of rows) {
      if (typeof row !== 'object' || row === null || Array.isArray(row)) {
        return null;
      }
    }
  }
  const backup = parsed as BackupFile;
  if (!Array.isArray(backup.tables.transfers)) {
    backup.tables.transfers = [];
  }
  return backup;
}

export interface RestoreResult {
  restored: boolean;
  message: string;
  /** If true, the caller should show a migration notice before/after restore. */
  migrationNotice?: string;
}

/**
 * Guards restore against an unsupported backup format. Older backups are
 * accepted and upgraded through column defaults; a *newer* format (written by
 * a future app version) is rejected up front instead of half-restoring.
 */
function backupVersionError(file: BackupFile): string | null {
  if (!Number.isInteger(file.version) || file.version < 1) {
    return 'This file is not a valid DailyKhata backup.';
  }
  if (file.version > BACKUP_VERSION) {
    return `This backup was created by a newer app version (format ${file.version}) and can't be restored here.`;
  }
  return null;
}

/**
 * Resolves the owner for a restored row. Prefers the row's own valid UUID,
 * falls back to the signed-in user's id, and returns null when neither
 * exists so the caller can skip the row instead of violating NOT NULL.
 */
function sanitizeUserId(value: unknown, fallbackUserId: string | null): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
      return trimmed;
    }
    // Empty/invalid stored id — fall through to the session fallback.
  }
  return fallbackUserId;
}

/**
 * Sanitizes category_id - returns null if invalid, otherwise the numeric ID.
 */
function sanitizeCategoryId(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

/**
 * Sanitizes account_id / party_id - returns null if invalid, otherwise the numeric ID.
 */
function sanitizeFkId(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

/**
 * Gets the default "Other" category ID for a given transaction type.
 * Returns the ID of the fallback category, creating it if necessary.
 * This is a best-effort; if the category doesn't exist and we can't create it,
 * we return null (which the schema allows via ON DELETE SET NULL).
 */
async function getFallbackCategoryId(
  db: ReturnType<typeof getDatabase>,
  type: 'income' | 'expense'
): Promise<number | null> {
  const fallbackName = type === 'income' ? 'Other Income' : 'Other Expense';
  try {
    const existing = await db.getFirstAsync<{ id: number }>(
      'SELECT id FROM categories WHERE name = ? AND type = ?',
      fallbackName,
      type
    );
    if (existing?.id) {
      return existing.id;
    }
    // Try to create it (best effort - if it fails, we'll just use null)
    const userId = getCurrentSession()?.user?.id ?? null;
    const now = nowIso();
    const newUuid = uuid();
    await db.runAsync(
      `INSERT INTO categories (uuid, user_id, updated_at, name, type, icon, sort_order)
       VALUES (?, ?, ?, ?, ?, 'circle-plus', 999)`,
      newUuid,
      userId,
      now,
      fallbackName,
      type
    );
    return (await db.getFirstAsync<{ id: number }>(
      'SELECT id FROM categories WHERE uuid = ?',
      newUuid
    ))?.id ?? null;
  } catch {
    // If we can't create/find fallback, return null - the FK allows SET NULL
    return null;
  }
}

/**
 * Validates one backup row before insert. Returns the sanitized row, or
 * null when the row must be skipped:
 * - `transactions` without a valid `account_id` (NOT NULL FK — nulling it
 *   would violate the constraint, so the row is dropped and counted).
 * - any synced row (incl. `settings`) whose owner resolves to null when no
 *   session exists (user_id NOT NULL).
 * `category_id` stays nullable (ON DELETE SET NULL) with a type fallback.
 */
async function sanitizeRowForTable(
  db: ReturnType<typeof getDatabase>,
  table: string,
  row: BackupRow,
  fallbackUserId: string | null
): Promise<BackupRow | null> {
  const sanitized = { ...row };

  // Owner is NOT NULL on every synced table — without a session fallback the
  // row cannot be restored, so skip it instead of violating the constraint.
  if ('user_id' in sanitized || table === 'settings') {
    const owner = sanitizeUserId(sanitized.user_id, fallbackUserId);
    if (owner === null) {
      return null;
    }
    sanitized.user_id = owner;
  }

  // 2. Table-specific FK sanitization
  switch (table) {
    case 'transactions': {
      // category_id can be null (ON DELETE SET NULL), but if present must be valid
      sanitized.category_id = sanitizeCategoryId(sanitized.category_id);
      if (sanitized.category_id === null && sanitized.type) {
        // Try to assign a fallback category based on transaction type
        sanitized.category_id = await getFallbackCategoryId(db, sanitized.type as 'income' | 'expense');
      }
      // account_id is required (NOT NULL FK) — never null it; drop the row.
      const accountId = sanitizeFkId(sanitized.account_id);
      if (accountId === null) {
        return null;
      }
      sanitized.account_id = accountId;
      break;
    }
    case 'transfers': {
      sanitized.from_account_id = sanitizeFkId(sanitized.from_account_id);
      sanitized.to_account_id = sanitizeFkId(sanitized.to_account_id);
      if (sanitized.from_account_id === null || sanitized.to_account_id === null) {
        return null;
      }
      break;
    }
    case 'party_transactions': {
      sanitized.party_id = sanitizeFkId(sanitized.party_id);
      if (sanitized.party_id === null) {
        return null;
      }
      break;
    }
  }

  return sanitized;
}

/**
 * Wipes the current database and replaces it with the backup contents.
 * Runs in one transaction so a failure never leaves the app half-restored.
 * Uses prepared statements with try/finally for safe finalization.
 * Uses INSERT OR REPLACE to handle duplicate UUIDs gracefully.
 */
export async function restoreBackup(file: BackupFile): Promise<RestoreResult> {
  const versionError = backupVersionError(file);
  if (versionError) {
    return { restored: false, message: versionError };
  }

  const db = getDatabase();
  const tableNames = Object.keys(TABLE_COLUMNS);

  // Check for data-migration notice if restoring an old backup version
  let migrationNotice: string | undefined;
  if (file.version === 1) {
    const appMeta = await fetchAppMeta();
    if (appMeta.migrate_from.includes('1.6.0') && appMeta.migrate_notice) {
      migrationNotice = appMeta.migrate_notice;
    }
  }

  // Get current user's UUID for fallback on empty-string user_ids
  const currentSession = getCurrentSession();
  const fallbackUserId = currentSession?.user?.id ?? null;

  try {
    await db.withTransactionAsync(async () => {
      // Wipe children first so foreign keys stay happy.
      const deleteOrder = [
        'party_transactions',
        'transfers',
        'transactions',
        'parties',
        'categories',
        'accounts',
        'settings',
      ];
      for (const table of deleteOrder) {
        await db.runAsync(`DELETE FROM ${table}`);
      }

      // Any queued ops refer to rows that are about to be wiped; start fresh.
      await clearQueue(db);

      const now = nowIso();

      for (const table of tableNames) {
        const columns = TABLE_COLUMNS[table];

        // Build column list for INSERT OR REPLACE
        // We include sync columns to preserve uuid, user_id, deleted_at, version
        const insertColumns = [...columns, ...BACKUP_SYNC_COLUMNS];
        const placeholders = insertColumns.map(() => '?').join(', ');
        const sql = `INSERT OR REPLACE INTO ${table} (${insertColumns.join(', ')}) VALUES (${placeholders})`;

        // Prepare statement once per table for efficiency
        const stmt = await db.prepareAsync(sql);

        try {
          let skipped = 0;
          for (const row of file.tables[table] ?? []) {
            // Sanitize the row before insert (null = must skip, counted below)
            const sanitized = await sanitizeRowForTable(db, table, row, fallbackUserId);
            if (!sanitized) {
              skipped += 1;
              continue;
            }

            const values: (string | number | null)[] = [];

            // Data columns
            for (const col of columns) {
              const value = sanitized[col];
              if (value === undefined) {
                // v1 backups lack some columns (e.g., opening_balance on accounts)
                if (col === 'opening_balance') {
                  values.push(0);
                } else if (col === 'time' || col === 'kind' || col === 'attachments') {
                  // v1/v2 backups might lack these newer columns
                  values.push(col === 'time' ? '' : col === 'kind' ? 'normal' : '[]');
                } else {
                  values.push(null);
                }
              } else {
                values.push(value);
              }
            }

            // Sync columns: uuid, user_id, updated_at, deleted_at, version
            // uuid: keep from backup if valid, else generate new
            const recordUuid =
              typeof sanitized.uuid === 'string' && sanitized.uuid.length > 0
                ? sanitized.uuid
                : uuid();
            values.push(recordUuid);

            // user_id: already sanitized, but ensure it's in the row
            const userId = sanitized.user_id ?? fallbackUserId;
            values.push(userId);

            // updated_at: use backup's if present, else current time
            values.push(sanitized.updated_at ?? now);

            // deleted_at: keep from backup (may be null)
            values.push(sanitized.deleted_at ?? null);

            // version: keep from backup (default 1)
            values.push(typeof sanitized.version === 'number' ? sanitized.version : 1);

            try {
              await stmt.executeAsync(...values);
              // Queue for sync so cloud gets the restored data. A restored
              // tombstone (deleted_at set) must upload as a delete, or the
              // cloud would resurrect a row the user had deleted.
              const isTombstone =
                typeof sanitized.deleted_at === 'string' && sanitized.deleted_at.length > 0;
              await enqueueChange(db, table, recordUuid, isTombstone ? 'delete' : 'insert', null);
            } catch (insertError) {
              // Log the row key (uuid + table) without dumping row contents.
              console.error(`[Restore] Failed to insert row into ${table} (uuid=${recordUuid})`);
              // Re-throw to trigger transaction rollback
              throw insertError;
            }
          }
          if (skipped > 0) {
            console.warn(`[Restore] Skipped ${skipped} invalid row(s) in ${table} (bad FK or missing owner).`);
          }
        } finally {
          // Always finalize the prepared statement, even on error
          await stmt.finalizeAsync();
        }
      }
    });

    const entries = (file.tables.transactions ?? []).length;
    const transfers = (file.tables.transfers ?? []).length;
    const parties = (file.tables.parties ?? []).length;
    const message =
      `Backup restored — ${entries} entries, ${transfers} transfers, ${parties} parties.` +
      (fallbackUserId === null ? ' Signed out: rows without an owner were skipped.' : '');
    return {
      restored: true,
      message,
      migrationNotice,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Restore] Transaction rolled back:', message);
    return {
      restored: false,
      message: `Restore failed: ${message}`,
    };
  }
}