/**
 * Sync table metadata.
 *
 * Declares which local tables sync and how foreign keys map between the
 * local integer ids and the cloud's uuid ids. A cloud `transaction.account_id`
 * is an account uuid; locally it is an integer `accounts.id`. These specs
 * drive both push (local rows → cloud rows) and pull (cloud rows → local
 * rows), so adding a table later is a one-entry change.
 */
import { getDatabase } from '@/db/database';

export interface SyncTableSpec {
  /** Local table name (also the Supabase table name). */
  table: string;
  /** Data columns (excludes sync bookkeeping: uuid/user_id/updated_at/...). */
  columns: string[];
  /** Local FK columns → the table they reference (by local integer id). */
  fks: Record<string, string>;
}

export const SYNC_TABLES: SyncTableSpec[] = [
  { table: 'accounts', columns: ['name', 'type', 'opening_balance', 'sort_order'], fks: {} },
  { table: 'categories', columns: ['name', 'type', 'icon', 'sort_order'], fks: {} },
  { table: 'parties', columns: ['name', 'type', 'phone', 'opening_balance'], fks: {} },
  {
    table: 'transactions',
    columns: ['type', 'amount', 'account_id', 'category_id', 'note', 'date', 'time', 'kind', 'attachments'],
    fks: { account_id: 'accounts', category_id: 'categories' },
  },
  {
    table: 'transfers',
    columns: ['from_account_id', 'to_account_id', 'amount', 'note', 'date', 'time'],
    fks: { from_account_id: 'accounts', to_account_id: 'accounts' },
  },
  {
    table: 'party_transactions',
    columns: ['party_id', 'direction', 'amount', 'note', 'date', 'time', 'kind', 'attachments'],
    fks: { party_id: 'parties' },
  },
  { table: 'settings', columns: ['key', 'value'], fks: {} },
];

/** Push order: parents before children so cloud FKs resolve. */
export const PUSH_ORDER = [
  'accounts',
  'categories',
  'parties',
  'transactions',
  'transfers',
  'party_transactions',
  'settings',
];

export const specFor = (table: string): SyncTableSpec | undefined =>
  SYNC_TABLES.find((spec) => spec.table === table);

/**
 * Reads a table's rows in cloud shape: `id` = local uuid, FK columns mapped
 * to their referenced row's uuid, plus sync bookkeeping. Pass `uuid` to read
 * a single row (used by push); omit it to read everything.
 */
export async function readRowsForPush(
  table: string,
  uuid?: string
): Promise<Record<string, unknown>[]> {
  const db = getDatabase();
  const spec = specFor(table);
  if (!spec) {
    return [];
  }

  const alias = 't';
  const selectParts: string[] = [
    `${alias}.uuid AS id`,
    `${alias}.updated_at AS updated_at`,
    // settings table doesn't have created_at — only tables with created_at column get it
    ...(spec.table !== 'settings' ? [`${alias}.created_at AS created_at`] : []),
    `${alias}.deleted_at AS deleted_at`,
    `${alias}.version AS version`,
  ];
  const joins: string[] = [];

  for (const column of spec.columns) {
    const refTable = spec.fks[column];
    if (refTable) {
      const refAlias = `r_${column}`;
      // Use NULL for nullable FKs instead of empty string. LEFT JOIN returns NULL
      // when the FK is null (e.g. transactions.category_id), and Supabase expects
      // NULL (not '') for nullable uuid foreign keys.
      selectParts.push(`${refAlias}.uuid AS ${column}`);
      joins.push(`LEFT JOIN ${refTable} ${refAlias} ON ${refAlias}.id = ${alias}.${column}`);
    } else {
      selectParts.push(`${alias}.${column} AS ${column}`);
    }
  }

  const sql =
    `SELECT ${selectParts.join(', ')} FROM ${table} ${alias} ${joins.join(' ')}` +
    (uuid ? ' WHERE t.uuid = ?' : '');
  if (uuid) {
    return db.getAllAsync<Record<string, unknown>>(sql, uuid);
  }
  return db.getAllAsync<Record<string, unknown>>(sql);
}

/** Convenience: the cloud-shaped row for one uuid, or null when missing. */
export async function readRowForPush(
  table: string,
  uuid: string
): Promise<Record<string, unknown> | null> {
  const rows = await readRowsForPush(table, uuid);
  return rows[0] ?? null;
}

/** Maps cloud uuid ids back to local integer ids for a reference table. */
export async function loadUuidToIdMap(
  table: string
): Promise<Record<string, number>> {
  const db = getDatabase();
  const rows = await db.getAllAsync<{ uuid: string; id: number }>(
    `SELECT uuid, id FROM ${table} WHERE uuid IS NOT NULL`
  );
  const map: Record<string, number> = {};
  for (const row of rows) {
    map[row.uuid] = row.id;
  }
  return map;
}
