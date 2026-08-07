/**
 * Real-SQLite integration tests for the FTS5 search index.
 *
 * The repo tests mock expo-sqlite, so they never exercise the actual trigger
 * SQL. This file runs `FTS_DDL` against Node's built-in SQLite (`node:sqlite`,
 * which ships FTS5 + the trigram tokenizer) to verify that the maintenance
 * triggers really keep the index in sync through inserts, updates, deletes and
 * account/category renames — the cases a broken trigger would silently miss.
 */
import { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

import {
  ACCOUNT_BASE,
  FTS_DDL,
  PARTY_BASE,
  TRANSFER_BASE,
  ftsMatchQuery,
  searchFeedIdsByFts,
} from '@/db/search-index';

/** node:sqlite has no getAllAsync — adapt it to the expo-sqlite shape. */
function adapter(db: DatabaseSync): SQLiteDatabase {
  return {
    getAllAsync: async (sql: string, ...params: (string | number)[]) =>
      db.prepare(sql).all(...params),
  } as unknown as SQLiteDatabase;
}

/** Minimal base tables matching the columns the search triggers reference. */
const BASE_SCHEMA = `
  PRAGMA foreign_keys = ON;
  CREATE TABLE accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    opening_balance REAL NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT 'tag',
    sort_order INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    amount REAL NOT NULL,
    account_id INTEGER NOT NULL REFERENCES accounts(id),
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    note TEXT NOT NULL DEFAULT '',
    date TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'normal'
  );
  CREATE TABLE transfers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_account_id INTEGER NOT NULL REFERENCES accounts(id),
    to_account_id INTEGER NOT NULL REFERENCES accounts(id),
    amount REAL NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    date TEXT NOT NULL
  );
  CREATE TABLE parties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    opening_balance REAL NOT NULL DEFAULT 0
  );
`;

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(BASE_SCHEMA);
  db.exec(FTS_DDL);
  return db;
}

/** One transaction referencing Cash + Food with the note "lunch at canteen". */
function seed(db: DatabaseSync): void {
  db.exec(`
    INSERT INTO accounts (name, type) VALUES ('Cash', 'cash');
    INSERT INTO accounts (name, type) VALUES ('SBI Bank', 'bank');
    INSERT INTO categories (name, type) VALUES ('Food', 'expense');
    INSERT INTO transactions (type, amount, account_id, category_id, note, date)
      VALUES ('expense', 150, 1, 1, 'lunch at canteen', '2026-08-01');
  `);
}

function bodyOf(db: DatabaseSync, rowid: number): string {
  const row = db
    .prepare('SELECT body FROM ledger_fts WHERE rowid = ?')
    .get(rowid) as { body: string };
  return row.body;
}

describe('search-index — real SQLite FTS5', () => {
  it('indexes a transaction on insert and keeps it in sync on update/delete', () => {
    const db = freshDb();
    seed(db);

    const inserted = bodyOf(db, 1);
    expect(inserted).toContain('lunch at canteen');
    expect(inserted).toContain('Food');
    expect(inserted).toContain('Cash');
    expect(inserted).toContain('150');

    db.exec("UPDATE transactions SET note = 'dinner at home' WHERE id = 1");
    expect(bodyOf(db, 1)).toContain('dinner at home');

    db.exec('DELETE FROM transactions WHERE id = 1');
    // Only the tx row should be gone — the seed's two account rows remain.
    const count = db
      .prepare("SELECT COUNT(*) AS c FROM ledger_fts WHERE kind = 'tx'")
      .get() as { c: number };
    expect(count.c).toBe(0);
  });

  it('indexes transfers with both account names', () => {
    const db = freshDb();
    db.exec(`
      INSERT INTO accounts (name, type) VALUES ('Cash', 'cash');
      INSERT INTO accounts (name, type) VALUES ('SBI Bank', 'bank');
      INSERT INTO transfers (from_account_id, to_account_id, amount, note, date)
        VALUES (1, 2, 500, 'sent to savings', '2026-08-02');
    `);
    const body = bodyOf(db, 1 + TRANSFER_BASE);
    expect(body).toContain('sent to savings');
    expect(body).toContain('Cash');
    expect(body).toContain('SBI Bank');
    expect(body).toContain('500');
  });

  it('indexes parties and accounts', () => {
    const db = freshDb();
    db.exec(`
      INSERT INTO parties (name, type, phone) VALUES ('Ramesh Store', 'customer', '9876543210');
      INSERT INTO accounts (name, type) VALUES ('HDFC', 'bank');
    `);
    expect(bodyOf(db, 1 + PARTY_BASE)).toBe('Ramesh Store 9876543210');
    // The fresh db has a single account, so it gets id 1.
    expect(bodyOf(db, 1 + ACCOUNT_BASE)).toBe('HDFC');
  });

  it('rebuilds transaction search text when a category is renamed', () => {
    const db = freshDb();
    seed(db);
    db.exec("UPDATE categories SET name = 'Snacks' WHERE id = 1");
    expect(bodyOf(db, 1)).toContain('Snacks');
    expect(bodyOf(db, 1)).not.toContain('Food');
  });

  it('rebuilds transaction search text when an account is renamed', () => {
    const db = freshDb();
    seed(db);
    db.exec("UPDATE accounts SET name = 'Wallet' WHERE id = 1");
    expect(bodyOf(db, 1)).toContain('Wallet');
    expect(bodyOf(db, 1)).not.toContain('Cash');
  });

  it('drops the category name from bodies when a category is deleted (SET NULL)', () => {
    const db = freshDb();
    seed(db);
    db.exec('DELETE FROM categories WHERE id = 1');
    expect(bodyOf(db, 1)).not.toContain('Food');
    expect(bodyOf(db, 1)).toContain('Cash');
  });

  it('rebuilds when a transaction moves account and category', () => {
    const db = freshDb();
    seed(db);
    db.exec(`
      INSERT INTO categories (name, type) VALUES ('Travel', 'expense');
      UPDATE transactions SET category_id = 2, account_id = 2 WHERE id = 1;
    `);
    expect(bodyOf(db, 1)).toContain('Travel');
    expect(bodyOf(db, 1)).toContain('SBI Bank');
    expect(bodyOf(db, 1)).not.toContain('Food');
    expect(bodyOf(db, 1)).not.toContain('Cash');
  });

  it('finds feed ids by substring via the trigram tokenizer', async () => {
    const db = freshDb();
    seed(db);
    await expect(searchFeedIdsByFts(adapter(db), '"canteen"', 30)).resolves.toEqual({
      txIds: [1],
      transferIds: [],
    });
    await expect(searchFeedIdsByFts(adapter(db), '"zzzzz"', 30)).resolves.toEqual({
      txIds: [],
      transferIds: [],
    });
  });
});

describe('ftsMatchQuery', () => {
  it('builds quoted trigram terms that AND together', () => {
    expect(ftsMatchQuery('chai shop')).toBe('"chai" "shop"');
  });

  it('drops tokens shorter than 3 characters and dedupes', () => {
    expect(ftsMatchQuery('a bc chai chai')).toBe('"chai"');
  });

  it('returns null when no token is long enough for trigram', () => {
    expect(ftsMatchQuery('ab')).toBeNull();
    expect(ftsMatchQuery('₹ 12')).toBeNull();
  });

  it('neutralizes FTS syntax by quoting', () => {
    expect(ftsMatchQuery('chai-masala')).toBe('"chai" "masala"');
    // No ≥3-char token survives the syntax stripping → not a trigram query.
    expect(ftsMatchQuery('a-b*c')).toBeNull();
  });
});
