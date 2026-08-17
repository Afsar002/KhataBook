/**
 * Local SQLite database (expo-sqlite). Works fully offline.
 *
 * Schema mirrors `docs/06-database-schema.md`:
 * - accounts: cash / bank / wallet (unlimited accounts, opening balance)
 * - categories: income / expense
 * - transactions: income & expense entries
 * - transfers: money moved between accounts
 * - parties / party_transactions: khata ledgers
 * - settings: key/value app preferences (theme, ...)
 *
 * Every synced entity also carries sync columns — `uuid` (the cloud id),
 * `user_id`, `updated_at` (last-write-wins clock), `deleted_at` (tombstone)
 * and `version`. The local integer primary key is preserved; `uuid` is the
 * stable cross-device identifier used by the sync engine.
 *
 * Schema changes are applied via `PRAGMA user_version` migrations so an
 * existing database upgrades in place without losing data.
 */

import { File, Paths } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';

import { initSearchIndex } from '@/db/search-index';
import { isSyncConfigured } from '@/services/supabase/config';
import { uuid } from '@/utils/uuid';

/** On-disk database file. */
const DB_FILE = 'dailykhata.db';
/** Pre-rename file name; migrated into the default file on first run so data survives. */
const LEGACY_DB_FILE = 'khatabook.db';

/**
 * Copies a pre-rename database into the default file so existing entries
 * survive the rename. WAL mode can leave un-checkpointed writes in the `-wal` /
 * `-shm` sidecars, so all three files are copied together as a set. A failed
 * copy is not fatal — the app starts on a fresh database instead of crashing.
 */
function migrateLegacyDatabaseFile(): void {
  try {
    const target = new File(Paths.document, DB_FILE);
    if (target.exists) {
      return;
    }
    for (const suffix of ['', '-wal', '-shm']) {
      const source = new File(Paths.document, `${LEGACY_DB_FILE}${suffix}`);
      if (source.exists) {
        source.copySync(new File(Paths.document, `${DB_FILE}${suffix}`));
      }
    }
  } catch {
    // Ignored: a migration failure falls back to an empty database.
  }
}

let db: SQLite.SQLiteDatabase | null = null;

export function getDatabase(): SQLite.SQLiteDatabase {
  if (!db) {
    migrateLegacyDatabaseFile();
    db = SQLite.openDatabaseSync(DB_FILE);
  }
  return db;
}

/**
 * Closes the open database handle and clears the cache. Called when switching
 * business profiles so the next `getDatabase()` opens the new profile's file.
 * Safe to call when nothing is open.
 */
export async function closeDatabase(): Promise<void> {
  if (db) {
    try {
      db.closeSync();
    } catch {
      // Ignored: already closed.
    }
    db = null;
  }
}

/**
 * Deletes every on-disk database file, then re-opens a fresh, empty one.
 *
 * Used by the "Clear all data" security option. The WAL sidecar files are
 * removed too, since they can contain un-checkpointed writes. The app should
 * reload shortly after this so all in-memory state (profile, sync counters)
 * is rebuilt from the empty database.
 */
export async function wipeDatabase(): Promise<void> {
  await closeDatabase();
  for (const suffix of ['', '-wal', '-shm']) {
    const file = new File(Paths.document, `${DB_FILE}${suffix}`);
    if (file.exists) {
      file.delete();
    }
  }
  // Re-open immediately so nothing that calls `getDatabase()` later sees a
  // null handle; `initDatabase()` will recreate the schema on next boot.
  migrateLegacyDatabaseFile();
  db = SQLite.openDatabaseSync(DB_FILE);
}

/**
 * Sync columns shared by every synced table. `uuid` is kept nullable here so
 * the same shape can be added to an existing database via ALTER TABLE; the
 * repositories always set it and a unique index guards against duplicates.
 */
const SYNC_COLUMNS = `
  uuid TEXT,
  user_id TEXT,
  updated_at TEXT,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
`;

/** One unique index per synced table, so a `uuid` can never be duplicated. */
const UUID_INDEXES = [
  'accounts',
  'categories',
  'transactions',
  'transfers',
  'parties',
  'party_transactions',
  'settings',
]
  .map((table) => `CREATE UNIQUE INDEX IF NOT EXISTS idx_${table}_uuid ON ${table} (uuid);`)
  .join('\n');

/**
 * Table-creation schema only (no indexes). Run BEFORE migrations so every
 * table exists; `CREATE TABLE IF NOT EXISTS` is a no-op on an existing
 * database. Indexes are created separately AFTER migrations, because the
 * uuid-column indexes can only succeed once `migrateV2` has added the
 * `uuid` column to legacy tables — otherwise `execAsync` aborts at the first
 * failing index and every subsequent statement (sync_queue, sync_meta, …)
 * is silently skipped, leaving the app with a half-built schema.
 */
const SCHEMA_TABLES = `
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ${SYNC_COLUMNS}
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    opening_balance REAL NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ${SYNC_COLUMNS}
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    icon TEXT NOT NULL DEFAULT 'tag',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ${SYNC_COLUMNS}
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    amount REAL NOT NULL CHECK (amount >= 0),
    account_id INTEGER NOT NULL REFERENCES accounts(id),
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    note TEXT NOT NULL DEFAULT '',
    date TEXT NOT NULL,
    time TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL DEFAULT 'normal' CHECK (kind IN ('normal', 'opening')),
    attachments TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS transfers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ${SYNC_COLUMNS}
    from_account_id INTEGER NOT NULL REFERENCES accounts(id),
    to_account_id INTEGER NOT NULL REFERENCES accounts(id),
    amount REAL NOT NULL CHECK (amount >= 0),
    note TEXT NOT NULL DEFAULT '',
    date TEXT NOT NULL,
    time TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS parties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ${SYNC_COLUMNS}
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('customer', 'supplier')),
    phone TEXT NOT NULL DEFAULT '',
    opening_balance REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS party_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ${SYNC_COLUMNS}
    party_id INTEGER NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
    direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
    amount REAL NOT NULL CHECK (amount >= 0),
    note TEXT NOT NULL DEFAULT '',
    date TEXT NOT NULL,
    time TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL DEFAULT 'normal' CHECK (kind IN ('normal', 'opening')),
    attachments TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE,
    user_id TEXT,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    UNIQUE (user_id, key)
  );

  -- Local sync queue: one row per pending change, coalesced by (table, uuid).
  CREATE TABLE IF NOT EXISTS sync_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operation TEXT NOT NULL CHECK (operation IN ('insert', 'update', 'delete')),
    table_name TEXT NOT NULL,
    record_uuid TEXT NOT NULL,
    payload TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'failed')),
    retry_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_attempt_at TEXT,
    UNIQUE (table_name, record_uuid)
  );

  -- Device-local sync state (cursors, last sync, user id). Never synced.
  CREATE TABLE IF NOT EXISTS sync_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  -- Local sync history: a human-readable log of sync events, especially LWW
  -- conflicts where a cloud change overwrote a pending local edit.
  CREATE TABLE IF NOT EXISTS sync_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL DEFAULT 'info' CHECK (event_type IN ('info', 'conflict')),
    message TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Captured LWW conflicts: snapshots of both sides so the user can review
  -- and restore an overwritten local change. Device-local, never synced.
  CREATE TABLE IF NOT EXISTS sync_conflicts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT NOT NULL,
    record_uuid TEXT NOT NULL,
    message TEXT NOT NULL,
    local_json TEXT,
    remote_json TEXT,
    resolved INTEGER NOT NULL DEFAULT 0 CHECK (resolved IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Per-device name list: tracks every device that has successfully synced.
  -- Device-local, never synced. The sync engine stamps the device name into
  -- the synced 'last_sync_from' setting after a successful push, and records
  -- the sync event here so all devices can show a "Synced Devices" list.
  CREATE TABLE IF NOT EXISTS sync_devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_name TEXT NOT NULL,
    last_sync_at TEXT NOT NULL,
    first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (device_name)
  );

  -- Cash book reconciliation: the counted "actual cash in hand" per day.
  -- Local only (like sync_meta) — never synced, never backed up.
  CREATE TABLE IF NOT EXISTS cash_counts (
    date TEXT PRIMARY KEY,
    actual REAL NOT NULL DEFAULT 0
  );

  -- Immutable audit trail of every syncable mutation (compliance/debugging).
  -- Written alongside the sync queue; device-local, never synced. Rows are
  -- purged after 90 days on boot (see audit-log-repo).
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT NOT NULL,
    operation TEXT NOT NULL CHECK (operation IN ('insert', 'update', 'delete')),
    record_uuid TEXT,
    user_id TEXT,
    payload TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

/**
 * Index-creation schema, run AFTER migrations. The uuid-column indexes
 * depend on `migrateV2` having added the `uuid` column to legacy tables.
 */
const SCHEMA_INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
  CREATE INDEX IF NOT EXISTS idx_transactions_account_date ON transactions(account_id, date);
  CREATE INDEX IF NOT EXISTS idx_transfers_date ON transfers(date);
  CREATE INDEX IF NOT EXISTS idx_transfers_from ON transfers(from_account_id, date);
  CREATE INDEX IF NOT EXISTS idx_transfers_to ON transfers(to_account_id, date);
  CREATE INDEX IF NOT EXISTS idx_party_transactions_party ON party_transactions(party_id, date);
  ${UUID_INDEXES}
  CREATE INDEX IF NOT EXISTS idx_sync_queue_created ON sync_queue(created_at);
  CREATE INDEX IF NOT EXISTS idx_sync_history_created ON sync_history(created_at);
  CREATE INDEX IF NOT EXISTS idx_sync_devices_last_sync ON sync_devices(last_sync_at DESC);
`;

/** SQLite `randomblob`-based UUID, used only to backfill pre-sync rows. */
const RANDOM_UUID_SQL = `lower(
  hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' ||
  substr(hex(randomblob(2)), 2) || '-8' || substr(hex(randomblob(2)), 2) ||
  '-' || hex(randomblob(6))
)`;

const SYNCED_TABLES = [
  'accounts',
  'categories',
  'transactions',
  'transfers',
  'parties',
  'party_transactions',
  'settings',
] as const;

/** ISO timestamp with milliseconds (matches `new Date().toISOString()`). */
export const nowIso = (): string => new Date().toISOString();

/**
 * Applies pending schema migrations, keyed on `PRAGMA user_version`.
 *
 * v1 (2026-08-04): accounts gain `opening_balance` and an unrestricted
 *   `type` (wallet + future account kinds); new `transfers` table.
 * v2 (2026-08-04): sync columns (`uuid`, `user_id`, `updated_at`,
 *   `deleted_at`, `version`) on every synced table; `sync_queue` and
 *   `sync_meta` tables.
 * v3 (2026-08-04): local `sync_history` log.
 * v4 (2026-08-04): index sync queue; nullable-safe category FK.
 * v5 (2026-08-04): parties gain `opening_balance`.
 * v6 (2026-08-04): `sync_devices` table.
 * v7 (2026-08-04): `recurring_templates` table.
 * v8 (2026-08-07): opening balance becomes a first-class ledger entry.
 *   Adds `kind` to `transactions` and `party_transactions`, then backfills
 *   an immutable "Opening Balance" entry for every account/party that has a
 *   non-zero `opening_balance` but no corresponding ledger entry yet.
 * v9 (2026-08-07): `sync_conflicts` table snapshotting the local + remote
 *   sides of every LWW conflict so the Conflicts screen can review and restore
 *   overwritten local changes instead of losing them silently.
 * v12 (2026-08-11): `attachments` JSON column on `transactions` and
 *   `party_transactions` — metadata for image/PDF attachments (the bytes live
 *   in the app's document directory, not the DB).
 */
async function migrate(database: SQLite.SQLiteDatabase): Promise<void> {
  const versionRow = await database.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version'
  );
  const current = versionRow?.user_version ?? 0;

  // Run ALL migrations in a single transaction to prevent deadlocks
  await database.withTransactionAsync(async () => {
    if (current < 1) {
      await migrateV1(database);
    }
    if (current < 2) {
      await migrateV2(database);
    }
    if (current < 3) {
      await migrateV3(database);
    }
    if (current < 4) {
      await migrateV4(database);
    }
    if (current < 5) {
      await migrateV5(database);
    }
    if (current < 6) {
      await migrateV6(database);
    }
    if (current < 7) {
      await migrateV7(database);
    }
    if (current < 8) {
      await migrateV8(database);
    }
    if (current < 9) {
      await migrateV9(database);
    }
    if (current < 10) {
      await migrateV10(database);
    }
    if (current < 11) {
      await migrateV11(database);
    }
    if (current < 12) {
      await migrateV12(database);
    }
    if (current < 13) {
      await migrateV13(database);
    }
  });
}

/** v1: rebuild `accounts` into the new shape (opening balance + free type). */
async function migrateV1(database: SQLite.SQLiteDatabase): Promise<void> {
  const columns = await database.getAllAsync<{ name: string }>(
    'PRAGMA table_info(accounts)'
  );
  const hasOpeningBalance = columns.some((col) => col.name === 'opening_balance');
  if (!hasOpeningBalance) {
    // SQLite can't change a CHECK/columns in place, so recreate the table.
    // No nested transaction here — `migrate()` already wraps this in one.
    await database.execAsync('PRAGMA foreign_keys = OFF');
    await database.execAsync(`
      CREATE TABLE accounts_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        opening_balance REAL NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO accounts_new (id, name, type, sort_order, created_at)
        SELECT id, name, type, sort_order, created_at FROM accounts;
      DROP TABLE accounts;
      ALTER TABLE accounts_new RENAME TO accounts;
    `);
    await database.execAsync('PRAGMA foreign_keys = ON');
  }
  await database.runAsync('PRAGMA user_version = 1');
}

/** v2: add sync columns to every synced table and backfill existing rows. */
async function migrateV2(database: SQLite.SQLiteDatabase): Promise<void> {
  // No nested transaction here — `migrate()` already wraps this in one.
  for (const table of SYNCED_TABLES) {
    const columns = await database.getAllAsync<{ name: string }>(
      `PRAGMA table_info(${table})`
    );
    if (columns.some((col) => col.name === 'uuid')) {
      continue; // fresh install already created the full shape
    }
    await database.execAsync(`
      ALTER TABLE ${table} ADD COLUMN uuid TEXT;
      ALTER TABLE ${table} ADD COLUMN user_id TEXT;
      ALTER TABLE ${table} ADD COLUMN updated_at TEXT;
      ALTER TABLE ${table} ADD COLUMN deleted_at TEXT;
      ALTER TABLE ${table} ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
      UPDATE ${table}
        SET uuid = ${RANDOM_UUID_SQL},
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE uuid IS NULL OR updated_at IS NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_${table}_uuid ON ${table} (uuid);
    `);
  }
  await database.runAsync('PRAGMA user_version = 2');
}

/** v3: add the local `sync_history` log backing the conflict-resolution UI. */
async function migrateV3(database: SQLite.SQLiteDatabase): Promise<void> {
  // The table itself is created idempotently in SCHEMA on every boot; this
  // migration just records that the schema is current.
  await database.runAsync('PRAGMA user_version = 3');
}

/**
 * v4: index the sync queue by age, and make `category_id` a nullable-safe FK.
 * SQLite can't ALTER a FK in place, so `transactions` is rebuilt the same way
 * v1 rebuilt `accounts` (FKs off → copy → rename → FKs on).
 */
async function migrateV4(database: SQLite.SQLiteDatabase): Promise<void> {
  // Audit #10 — the pending-count and purge queries scan the queue; index it.
  await database.runAsync(
    'CREATE INDEX IF NOT EXISTS idx_sync_queue_created ON sync_queue(created_at)'
  );

  // Audit #11 — deleting a category must null out (never orphan) transactions.
  // No nested transaction here — `migrate()` already wraps this in one.
  await database.execAsync('PRAGMA foreign_keys = OFF');
  await database.execAsync(`
    CREATE TABLE transactions_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ${SYNC_COLUMNS}
      type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
      amount REAL NOT NULL CHECK (amount >= 0),
      account_id INTEGER NOT NULL REFERENCES accounts(id),
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      note TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO transactions_new
      (id, uuid, user_id, updated_at, deleted_at, version,
       type, amount, account_id, category_id, note, date, created_at)
    SELECT
      id, uuid, user_id, updated_at, deleted_at, version,
      type, amount, account_id, category_id, note, date, created_at
    FROM transactions;
    DROP TABLE transactions;
    ALTER TABLE transactions_new RENAME TO transactions;
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
  `);
  await database.execAsync('PRAGMA foreign_keys = ON');
  await database.runAsync('PRAGMA user_version = 4');
}

/**
 * v5: opening balances for parties. Mirrors the `opening_balance` column
 * accounts gained in v1 — existing khata books migrated from a spreadsheet
 * start with a non-zero balance, not from zero.
 */
async function migrateV5(database: SQLite.SQLiteDatabase): Promise<void> {
  const columns = await database.getAllAsync<{ name: string }>(
    'PRAGMA table_info(parties)'
  );
  if (!columns.some((col) => col.name === 'opening_balance')) {
    await database.execAsync(
      'ALTER TABLE parties ADD COLUMN opening_balance REAL NOT NULL DEFAULT 0'
    );
  }
  await database.runAsync('PRAGMA user_version = 5');
}

/**
 * v6: add the `sync_devices` table to track all devices that have synced.
 */
async function migrateV6(database: SQLite.SQLiteDatabase): Promise<void> {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS sync_devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_name TEXT NOT NULL,
      last_sync_at TEXT NOT NULL,
      first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (device_name)
    );
    CREATE INDEX IF NOT EXISTS idx_sync_devices_last_sync ON sync_devices(last_sync_at DESC);
  `);
  await database.runAsync('PRAGMA user_version = 6');
}

/**
 * v7: add the `recurring_templates` table for recurring transaction templates.
 * Supports daily, weekly, monthly schedules for both regular transactions and party transactions.
 * Local-only table (never synced) — generated entries are synced individually.
 */
async function migrateV7(database: SQLite.SQLiteDatabase): Promise<void> {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS recurring_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE,
      -- Template type: 'transaction' or 'party_transaction'
      template_type TEXT NOT NULL CHECK (template_type IN ('transaction', 'party_transaction')),
      -- For regular transactions
      type TEXT CHECK (type IN ('income', 'expense')), -- required for template_type = 'transaction'
      amount REAL NOT NULL CHECK (amount >= 0),
      account_id INTEGER REFERENCES accounts(id), -- required for template_type = 'transaction'
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      note TEXT NOT NULL DEFAULT '',
      -- For party transactions
      party_id INTEGER REFERENCES parties(id) ON DELETE CASCADE, -- required for template_type = 'party_transaction'
      direction TEXT CHECK (direction IN ('in', 'out')), -- required for template_type = 'party_transaction'
      -- Schedule
      frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
      day_of_week INTEGER CHECK (day_of_week BETWEEN 0 AND 7), -- 0 = Sunday, for weekly
      day_of_month INTEGER CHECK (day_of_month BETWEEN 1 AND 31), -- for monthly
      -- Date range
      start_date TEXT NOT NULL, -- YYYY-MM-DD
      end_date TEXT, -- YYYY-MM-DD, null = no end
      -- Tracking
      last_generated_date TEXT, -- YYYY-MM-DD of last generated entry
      is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_recurring_templates_active ON recurring_templates(is_active, template_type);
    CREATE INDEX IF NOT EXISTS idx_recurring_templates_schedule ON recurring_templates(frequency, day_of_week, day_of_month);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_recurring_templates_uuid ON recurring_templates(uuid);
  `);
  await database.runAsync('PRAGMA user_version = 7');
}

/**
 * v8: Opening Balance becomes a first-class ledger entry.
 *
 * Adds a `kind` column to `transactions` and `party_transactions` so an
 * opening-balance entry can be distinguished from a normal one. Then, for
 * every account/party that has a non-zero `opening_balance` but no matching
 * ledger entry yet, inserts an immutable "Opening Balance" entry timestamped
 * as the earliest transaction for that entity.
 *
 * The `opening_balance` column is kept for backward compatibility (the UI
 * still reads it for display), but ALL balance calculations now derive from
 * the ledger — the opening-balance entry is the single source of truth.
 */
async function migrateV8(database: SQLite.SQLiteDatabase): Promise<void> {
  // 1. Add `kind` to `transactions` (rebuild — SQLite can't add a CHECK in place).
  const txColumns = await database.getAllAsync<{ name: string }>(
    'PRAGMA table_info(transactions)'
  );
  if (!txColumns.some((col) => col.name === 'kind')) {
    await database.execAsync('PRAGMA foreign_keys = OFF');
    await database.execAsync(`
      CREATE TABLE transactions_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ${SYNC_COLUMNS}
        type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
        amount REAL NOT NULL CHECK (amount >= 0),
        account_id INTEGER NOT NULL REFERENCES accounts(id),
        category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
        note TEXT NOT NULL DEFAULT '',
        date TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'normal' CHECK (kind IN ('normal', 'opening')),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO transactions_new
        (id, uuid, user_id, updated_at, deleted_at, version,
         type, amount, account_id, category_id, note, date, kind, created_at)
      SELECT
        id, uuid, user_id, updated_at, deleted_at, version,
        type, amount, account_id, category_id, note, date, 'normal', created_at
      FROM transactions;
      DROP TABLE transactions;
      ALTER TABLE transactions_new RENAME TO transactions;
      CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    `);
    await database.execAsync('PRAGMA foreign_keys = ON');
  }

  // 2. Add `kind` to `party_transactions` (rebuild).
  const ptColumns = await database.getAllAsync<{ name: string }>(
    'PRAGMA table_info(party_transactions)'
  );
  if (!ptColumns.some((col) => col.name === 'kind')) {
    await database.execAsync('PRAGMA foreign_keys = OFF');
    await database.execAsync(`
      CREATE TABLE party_transactions_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ${SYNC_COLUMNS}
        party_id INTEGER NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
        direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
        amount REAL NOT NULL CHECK (amount >= 0),
        note TEXT NOT NULL DEFAULT '',
        date TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'normal' CHECK (kind IN ('normal', 'opening')),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO party_transactions_new
        (id, uuid, user_id, updated_at, deleted_at, version,
         party_id, direction, amount, note, date, kind, created_at)
      SELECT
        id, uuid, user_id, updated_at, deleted_at, version,
        party_id, direction, amount, note, date, 'normal', created_at
      FROM party_transactions;
      DROP TABLE party_transactions;
      ALTER TABLE party_transactions_new RENAME TO party_transactions;
      CREATE INDEX IF NOT EXISTS idx_party_transactions_party ON party_transactions(party_id, date);
    `);
    await database.execAsync('PRAGMA foreign_keys = ON');
  }

  // 3. Backfill opening-balance ledger entries for accounts.
  //    Only for accounts with a non-zero opening_balance that don't already
  //    have an opening-kind transaction.
  const accounts = await database.getAllAsync<{
    id: number;
    opening_balance: number;
    created_at: string | null;
    uuid: string | null;
    user_id: string | null;
  }>(
    `SELECT a.id, a.opening_balance, a.created_at, a.uuid, a.user_id
     FROM accounts a
     WHERE a.opening_balance != 0
       AND NOT EXISTS (
         SELECT 1 FROM transactions t
         WHERE t.account_id = a.id AND t.kind = 'opening'
       )`
  );
  for (const account of accounts) {
    const now = nowIso();
    const entryUuid = uuid();
    // Timestamp the opening entry as the earliest transaction for this account.
    const earliest = await database.getFirstAsync<{ min_date: string | null }>(
      'SELECT MIN(date) AS min_date FROM transactions WHERE account_id = ?',
      account.id
    );
    const openingDate = earliest?.min_date ?? account.created_at?.slice(0, 10) ?? now.slice(0, 10);
    await database.runAsync(
      `INSERT INTO transactions
        (uuid, user_id, updated_at, type, amount, account_id, category_id, note, date, kind, created_at)
       VALUES (?, ?, ?, 'income', ?, ?, NULL, 'Opening Balance', ?, 'opening', ?)`,
      entryUuid,
      account.user_id,
      now,
      account.opening_balance,
      account.id,
      openingDate,
      now
    );
  }

  // 4. Backfill opening-balance ledger entries for parties.
  //    For a customer, opening balance means they owe us → direction 'out'.
  //    For a supplier, opening balance means we owe them → direction 'in'.
  const parties = await database.getAllAsync<{
    id: number;
    type: string;
    opening_balance: number;
    created_at: string | null;
    uuid: string | null;
    user_id: string | null;
  }>(
    `SELECT p.id, p.type, p.opening_balance, p.created_at, p.uuid, p.user_id
     FROM parties p
     WHERE p.opening_balance != 0
       AND NOT EXISTS (
         SELECT 1 FROM party_transactions pt
         WHERE pt.party_id = p.id AND pt.kind = 'opening'
       )`
  );
  for (const party of parties) {
    const now = nowIso();
    const entryUuid = uuid();
    const earliest = await database.getFirstAsync<{ min_date: string | null }>(
      'SELECT MIN(date) AS min_date FROM party_transactions WHERE party_id = ?',
      party.id
    );
    const openingDate = earliest?.min_date ?? party.created_at?.slice(0, 10) ?? now.slice(0, 10);
    const direction = party.type === 'customer' ? 'out' : 'in';
    await database.runAsync(
      `INSERT INTO party_transactions
        (uuid, user_id, updated_at, party_id, direction, amount, note, date, kind, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'Opening Balance', ?, 'opening', ?)`,
      entryUuid,
      party.user_id,
      now,
      party.id,
      direction,
      party.opening_balance,
      openingDate,
      now
    );
  }

  await database.runAsync('PRAGMA user_version = 8');
}

/**
 * v9: local `sync_conflicts` table.
 *
 * Snapshots both sides of every last-write-wins conflict so the Conflicts
 * screen can review them and optionally restore the overwritten local version.
 * Device-local, never synced — mirrors `sync_history`.
 */
async function migrateV9(database: SQLite.SQLiteDatabase): Promise<void> {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS sync_conflicts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      record_uuid TEXT NOT NULL,
      message TEXT NOT NULL,
      local_json TEXT,
      remote_json TEXT,
      resolved INTEGER NOT NULL DEFAULT 0 CHECK (resolved IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sync_conflicts_open ON sync_conflicts(resolved, created_at);
  `);
  await database.runAsync('PRAGMA user_version = 9');
}

async function migrateV10(database: SQLite.SQLiteDatabase): Promise<void> {
  // Audit log for all syncable mutations (see SCHEMA_TABLES for the full
  // definition; this migration adds it to databases created before v10).
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      operation TEXT NOT NULL CHECK (operation IN ('insert', 'update', 'delete')),
      record_uuid TEXT,
      user_id TEXT,
      payload TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);
  `);
  await database.runAsync('PRAGMA user_version = 10');
}

async function migrateV11(database: SQLite.SQLiteDatabase): Promise<void> {
  // Record the local time of day (`HH:MM`) with every entry. Plain ALTER is
  // enough here (no CHECK needed); guarded so fresh databases that already
  // have the column via SCHEMA_TABLES are skipped.
  for (const table of ['transactions', 'transfers', 'party_transactions']) {
    const columns = await database.getAllAsync<{ name: string }>(
      `PRAGMA table_info(${table})`
    );
    if (!columns.some((col) => col.name === 'time')) {
      await database.runAsync(
        `ALTER TABLE ${table} ADD COLUMN time TEXT NOT NULL DEFAULT ''`
      );
    }
  }
  // Backfill existing entries with the local time they were recorded
  // (`created_at` is stored in UTC). Covers both the local `datetime('now')`
  // format and pulled ISO timestamps — SQLite parses both; anything
  // unparseable stays '' (opening-balance entries have no time of day).
  await database.execAsync(`
    UPDATE transactions SET time =
      COALESCE(strftime('%H:%M', datetime(created_at, 'localtime')), '')
      WHERE time = '';
    UPDATE transfers SET time =
      COALESCE(strftime('%H:%M', datetime(created_at, 'localtime')), '')
      WHERE time = '';
    UPDATE party_transactions SET time =
      COALESCE(strftime('%H:%M', datetime(created_at, 'localtime')), '')
      WHERE time = '';
  `);
  await database.runAsync('PRAGMA user_version = 11');
}

/**
 * v12: `attachments` JSON column on `transactions` and `party_transactions`.
 *
 * Stores the metadata array (`AttachmentMeta[]`) for image/PDF attachments; the
 * bytes themselves live in the app's document directory. Plain ALTER, guarded so
 * fresh databases that already have the column via SCHEMA_TABLES are skipped.
 */
async function migrateV12(database: SQLite.SQLiteDatabase): Promise<void> {
  for (const table of ['transactions', 'party_transactions']) {
    const columns = await database.getAllAsync<{ name: string }>(
      `PRAGMA table_info(${table})`
    );
    if (!columns.some((col) => col.name === 'attachments')) {
      await database.runAsync(
        `ALTER TABLE ${table} ADD COLUMN attachments TEXT NOT NULL DEFAULT '[]'`
      );
    }
  }
  await database.runAsync('PRAGMA user_version = 12');
}

/**
 * v13 (2026-08-17): Fix settings table schema to match cloud (Supabase).
 *
 * Cloud schema (001_initial.sql):
 *   CREATE TABLE settings (
 *     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *     user_id uuid NOT NULL,
 *     key text NOT NULL,
 *     value text NOT NULL,
 *     updated_at timestamptz NOT NULL DEFAULT now(),
 *     deleted_at timestamptz,
 *     version integer NOT NULL DEFAULT 1,
 *     UNIQUE (user_id, key)
 *   );
 *
 * Local schema before v13:
 *   CREATE TABLE settings (
 *     key TEXT PRIMARY KEY,          -- local PK was 'key'
 *     value TEXT NOT NULL,
 *     uuid TEXT,                     -- nullable, not unique
 *     user_id TEXT,
 *     updated_at TEXT,
 *     deleted_at TEXT,
 *     version INTEGER NOT NULL DEFAULT 1
 *   );
 *
 * Problem: push.ts reads `uuid AS id` for upsert; if uuid is NULL (common
 * for pre-sync rows), the upsert payload has `id: null` → RLS with check
 * fails or duplicate NULL ids are created. Sync fails with status 'error'.
 *
 * Fix: Recreate settings table with proper local PK (id AUTOINCREMENT)
 * and uuid NOT NULL UNIQUE. Backfill UUIDs for existing rows.
 */
async function migrateV13(database: SQLite.SQLiteDatabase): Promise<void> {
  // Check if migration already applied (fresh install gets correct schema from SCHEMA_TABLES)
  const columns = await database.getAllAsync<{ name: string }>(
    'PRAGMA table_info(settings)'
  );
  const hasIdColumn = columns.some((col) => col.name === 'id');
  if (hasIdColumn) {
    await database.runAsync('PRAGMA user_version = 13');
    return;
  }

  // No nested transaction — migrate() wraps in one.
  await database.execAsync('PRAGMA foreign_keys = OFF');

  // 1. Rename old table
  await database.execAsync('ALTER TABLE settings RENAME TO settings_old');

  // 2. Create new settings table matching cloud schema pattern
  await database.execAsync(`
    CREATE TABLE settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE,
      user_id TEXT,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      UNIQUE (user_id, key)
    );
  `);

  // 3. Migrate data: generate UUID for rows missing one
  await database.execAsync(`
    INSERT INTO settings (uuid, user_id, key, value, updated_at, deleted_at, version)
    SELECT
      COALESCE(uuid, ${RANDOM_UUID_SQL}) AS uuid,
      user_id,
      key,
      value,
      COALESCE(updated_at, datetime('now')) AS updated_at,
      deleted_at,
      COALESCE(version, 1) AS version
    FROM settings_old
  `);

  // 4. Drop old table
  await database.execAsync('DROP TABLE settings_old');

  // 5. Recreate the uuid index (will be created by SCHEMA_INDEXES after migrate())
  //    but ensure it exists now for any immediate operations.
  await database.execAsync(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_uuid ON settings (uuid);'
  );

  await database.execAsync('PRAGMA foreign_keys = ON');
  await database.runAsync('PRAGMA user_version = 13');
}

export async function initDatabase(): Promise<void> {
  const database = getDatabase();
  // 1. Create all tables first (CREATE TABLE IF NOT EXISTS is a no-op on
  //    existing tables, so this is safe for both fresh and legacy databases).
  await database.execAsync(SCHEMA_TABLES);
  // 2. Run migrations — these ALTER legacy tables to add the `uuid` column
  //    and other schema upgrades. Must happen before indexes are created,
  //    because the uuid-column indexes depend on that column existing.
  await migrate(database);
  // 3. Create all indexes. On a legacy database the uuid columns now exist
  //    (added by migrateV2), so the uuid-column indexes succeed. On a fresh
  //    install the tables already have uuid columns from SCHEMA_TABLES.
  await database.execAsync(SCHEMA_INDEXES);
  // 4. Build the FTS5 search index (when the SQLite build supports it). This
  //    runs after migrations because the v1/v4/v8 table rebuilds would drop
  //    any triggers created before them. Falls back to LIKE search silently.
  await initSearchIndex(database);
  // Offline mode seeds the default Cash/Bank accounts and categories right
  // away. In sync mode the cloud is the source of truth, so seeding is skipped
  // entirely: a returning user restores exactly their cloud data (never
  // duplicate defaults) and a brand-new user starts with an empty ledger.
  if (!isSyncConfigured()) {
    await seedDefaultsIfEmpty(database);
  }
}

/**
 * Seeds the default accounts and categories when the ledger is empty.
 * Only used in offline mode (no Supabase keys); sync mode leaves the cloud as
 * the source of truth so users never get duplicate defaults.
 */
export async function seedDefaultsIfEmpty(database = getDatabase()): Promise<void> {
  const row = await database.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM accounts'
  );
  if (row && row.count > 0) {
    return;
  }

  const userId = null; // stamped with the signed-in user on push
  const now = nowIso();
  const accountRows: { name: string; type: string; sortOrder: number }[] = [
    { name: 'Cash', type: 'cash', sortOrder: 1 },
    { name: 'Bank', type: 'bank', sortOrder: 2 },
  ];
  const incomeCategories: [string, string, number][] = [
    ['Salary', 'briefcase', 1],
    ['Business', 'store', 2],
    ['Other Income', 'circle-plus', 3],
  ];
  const expenseCategories: [string, string, number][] = [
    ['Food', 'utensils', 1],
    ['Transport', 'car', 2],
    ['Rent', 'home', 3],
    ['Shopping', 'shopping-bag', 4],
    ['Medical', 'heart-pulse', 5],
    ['Other Expense', 'circle-minus', 6],
  ];

  await database.withTransactionAsync(async () => {
    for (const account of accountRows) {
      await database.runAsync(
        `INSERT INTO accounts (uuid, user_id, updated_at, name, type, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
        uuid(),
        userId,
        now,
        account.name,
        account.type,
        account.sortOrder
      );
    }
    for (const [name, icon, order] of incomeCategories) {
      await database.runAsync(
        `INSERT INTO categories (uuid, user_id, updated_at, name, type, icon, sort_order)
         VALUES (?, ?, ?, ?, 'income', ?, ?)`,
        uuid(),
        userId,
        now,
        name,
        icon,
        order
      );
    }
    for (const [name, icon, order] of expenseCategories) {
      await database.runAsync(
        `INSERT INTO categories (uuid, user_id, updated_at, name, type, icon, sort_order)
         VALUES (?, ?, ?, ?, 'expense', ?, ?)`,
        uuid(),
        userId,
        now,
        name,
        icon,
        order
      );
    }
  });
}