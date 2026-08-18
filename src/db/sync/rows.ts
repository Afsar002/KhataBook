/**
 * Low-level local-row writers shared by the pull merge (`pull.ts`) and the
 * conflict "restore my version" path (`conflict-repo.ts`). Kept separate so
 * `pull.ts` can import conflict capture without creating a circular dependency
 * with the conflict repository.
 */
import type { SQLiteBindValue, SQLiteDatabase } from 'expo-sqlite';

import type { SyncTableSpec } from '@/db/sync/tables';

function dataColumns(spec: SyncTableSpec): string[] {
  // For settings, spec.columns includes ['key', 'value'] but the local table
  // now also has 'created_at' (added in migrateV14). We need to include it
  // for INSERT/UPDATE operations so it gets written during pull.
  return spec.table === 'settings' ? [...spec.columns, 'created_at'] : spec.columns;
}

/** Column values coerced to SQLite-safe types (dates from Postgres → ISO). */
function bindValue(value: unknown): SQLiteBindValue {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'object' || Array.isArray(value)) {
    return JSON.stringify(value);
  }
  return value as SQLiteBindValue;
}

export async function insertLocalRow(
  db: SQLiteDatabase,
  spec: SyncTableSpec,
  row: Record<string, unknown>
): Promise<void> {
  const columns = [...dataColumns(spec), 'uuid', 'user_id', 'updated_at', 'deleted_at', 'version'];
  const placeholders = columns.map(() => '?').join(', ');
  const values = columns.map((column) => bindValue(row[column]));
  await db.runAsync(
    `INSERT INTO ${spec.table} (${columns.join(', ')}) VALUES (${placeholders})`,
    ...values
  );
}

export async function updateLocalRow(
  db: SQLiteDatabase,
  spec: SyncTableSpec,
  row: Record<string, unknown>
): Promise<void> {
  const columns = [...dataColumns(spec), 'user_id', 'updated_at', 'deleted_at', 'version'];
  const sets = columns.map((column) => `${column} = ?`).join(', ');
  const values = columns.map((column) => bindValue(row[column]));
  await db.runAsync(
    `UPDATE ${spec.table} SET ${sets} WHERE uuid = ?`,
    ...values,
    String(row.uuid)
  );
}

export async function deleteLocalRow(
  db: SQLiteDatabase,
  spec: SyncTableSpec,
  localId: string | number
): Promise<void> {
  if (spec.table === 'parties') {
    // Mirrors the app-level party delete: children go first.
    await db.runAsync('DELETE FROM party_transactions WHERE party_id = ?', localId);
  }
  const keyColumn = spec.table === 'settings' ? 'key' : 'id';
  await db.runAsync(`DELETE FROM ${spec.table} WHERE ${keyColumn} = ?`, localId);
}
