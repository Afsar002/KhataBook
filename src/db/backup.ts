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

const BACKUP_APP = 'dailykhata';
/** App id written by pre-rename backups; still accepted so old files restore. */
const LEGACY_BACKUP_APP = 'khatabook';
const BACKUP_VERSION = 2;

/** Every table and its columns, in foreign-key dependency order for restore. */
export const TABLE_COLUMNS: Record<string, string[]> = {
  accounts: ['id', 'name', 'type', 'opening_balance', 'sort_order', 'created_at'],
  categories: ['id', 'name', 'type', 'icon', 'sort_order', 'created_at'],
  transactions: ['id', 'type', 'amount', 'account_id', 'category_id', 'note', 'date', 'created_at'],
  transfers: ['id', 'from_account_id', 'to_account_id', 'amount', 'note', 'date', 'created_at'],
  parties: ['id', 'name', 'type', 'phone', 'opening_balance', 'created_at'],
  party_transactions: ['id', 'party_id', 'direction', 'amount', 'note', 'date', 'created_at'],
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
 * Wipes the current database and replaces it with the backup contents.
 * Runs in one transaction so a failure never leaves the app half-restored.
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
      // Restored rows get a fresh clock so the upcoming full re-push wins LWW.
      const insertColumns = [...columns, 'uuid', 'updated_at'];
      const placeholders = insertColumns.map(() => '?').join(', ');
      const sql = `INSERT INTO ${table} (${insertColumns.join(', ')}) VALUES (${placeholders})`;
      for (const row of file.tables[table] ?? []) {
        const values = columns.map((col) => {
          const value = row[col];
          if (value === undefined) {
            // v1 backups lack opening_balance on accounts.
            return col === 'opening_balance' ? 0 : null;
          }
          return value;
        });
        // Keep the uuid when the backup has one so the cloud row is merged
        // (upsert) instead of duplicated; generate a fresh one otherwise.
        const recordUuid =
          typeof row.uuid === 'string' && row.uuid.length > 0 ? row.uuid : uuid();
        values.push(recordUuid, now);
        await db.runAsync(sql, ...values);
        await enqueueChange(db, { table, operation: 'insert', recordUuid, payload: null });
      }
    }
  });

  const entries = (file.tables.transactions ?? []).length;
  const transfers = (file.tables.transfers ?? []).length;
  const parties = (file.tables.parties ?? []).length;
  return {
    restored: true,
    message: `Backup restored — ${entries} entries, ${transfers} transfers, ${parties} parties.`,
    migrationNotice,
  };
}
