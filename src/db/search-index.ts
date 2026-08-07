/**
 * SQLite FTS5 full-text search index.
 *
 * A single `ledger_fts` virtual table indexes the free-text fields the global
 * search screen matches on — transaction/transfer notes (plus their account
 * and category names, and the amount as text), party name/phone and account
 * name. A search becomes an indexed FTS5 query (`ORDER BY rank`) instead of a
 * `LIKE '%…%'` scan of the whole ledger, so it stays fast as the ledger grows.
 *
 * The index is maintained by AFTER triggers on the base tables, so it stays
 * correct for writes coming from the local repos and from the cloud sync
 * engine alike. Renaming an account or category rebuilds the search text of
 * every ledger row that references it; deleting a category (whose FK is
 * `ON DELETE SET NULL`) rebuilds the transactions it used to tag.
 *
 * Rowids are namespaced per entity kind (see the `*_BASE` constants): a virtual
 * table has a single rowid space shared by all four kinds, so if every trigger
 * used its table's raw `id`, an account, a transaction and a party that happen
 * to have `id = 1` would all fight for rowid 1 and the second insert would
 * fail with a constraint error. Each kind lives in its own numeric band; the
 * search repos subtract the base to recover the real id.
 *
 * FTS5 — and the trigram tokenizer it needs for substring matching — is not
 * available on every SQLite build (notably some web backends). Creation is
 * attempted once at boot and the search repos transparently fall back to the
 * LIKE implementation when it is missing, so this module must never break a
 * database that cannot create it.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import { SEARCH_LIMIT } from '@/utils/search';

/** FTS5 virtual table backing the global search. */
export const FTS_TABLE = 'ledger_fts';

/**
 * Rowid namespaces for `ledger_fts`, one disjoint band per entity kind.
 * Transactions keep their raw id (which is also their feed id); the other
 * kinds are shifted so no two kinds ever share a rowid. The transfer band
 * mirrors the feed's `TRANSFER_ID_OFFSET` value so the two stay consistent.
 */
export const TX_BASE = 0;
export const TRANSFER_BASE = 10_000_000;
export const PARTY_BASE = 20_000_000;
export const ACCOUNT_BASE = 30_000_000;

/** True when `initSearchIndex` succeeded and FTS5 queries are available. */
let ftsEnabled = false;

export function isFtsEnabled(): boolean {
  return ftsEnabled;
}

/** Test hook — lets tests enable/disable the FTS path without a real DB. */
export function setFtsEnabledForTests(enabled: boolean): void {
  ftsEnabled = enabled;
}

/**
 * Creates the FTS5 table and maintenance triggers. Safe to call on every boot
 * (`IF NOT EXISTS` makes it a no-op once created); enables the FTS search path
 * for the rest of the session only when creation succeeds.
 */
export async function initSearchIndex(db: SQLiteDatabase): Promise<boolean> {
  try {
    await db.execAsync(FTS_DDL);
    ftsEnabled = true;
  } catch {
    // FTS5 / trigram unavailable — the LIKE fallback in the search repos
    // covers the same queries, so a missing index must not fail the boot.
    ftsEnabled = false;
  }
  return ftsEnabled;
}

/** DDL for the FTS table + all maintenance triggers (idempotent). */
export const FTS_DDL = `
  CREATE VIRTUAL TABLE IF NOT EXISTS ledger_fts USING fts5(
    body,
    kind UNINDEXED,
    tokenize = 'trigram'
  );

  -- ===== transactions =====
  CREATE TRIGGER IF NOT EXISTS ledger_fts_tx_ai AFTER INSERT ON transactions BEGIN
    INSERT INTO ledger_fts(rowid, kind, body) VALUES (
      new.id, 'tx',
      new.note || ' ' ||
      COALESCE((SELECT name FROM categories WHERE id = new.category_id), '') || ' ' ||
      COALESCE((SELECT name FROM accounts WHERE id = new.account_id), '') || ' ' ||
      CAST(new.amount AS TEXT)
    );
  END;

  CREATE TRIGGER IF NOT EXISTS ledger_fts_tx_au AFTER UPDATE ON transactions BEGIN
    UPDATE ledger_fts SET body =
      new.note || ' ' ||
      COALESCE((SELECT name FROM categories WHERE id = new.category_id), '') || ' ' ||
      COALESCE((SELECT name FROM accounts WHERE id = new.account_id), '') || ' ' ||
      CAST(new.amount AS TEXT)
    WHERE rowid = old.id AND kind = 'tx';
  END;

  CREATE TRIGGER IF NOT EXISTS ledger_fts_tx_ad AFTER DELETE ON transactions BEGIN
    DELETE FROM ledger_fts WHERE rowid = old.id AND kind = 'tx';
  END;

  -- ===== transfers (rowid band: ${TRANSFER_BASE}) =====
  CREATE TRIGGER IF NOT EXISTS ledger_fts_tr_ai AFTER INSERT ON transfers BEGIN
    INSERT INTO ledger_fts(rowid, kind, body) VALUES (
      new.id + ${TRANSFER_BASE}, 'transfer',
      new.note || ' ' ||
      COALESCE((SELECT name FROM accounts WHERE id = new.from_account_id), '') || ' ' ||
      COALESCE((SELECT name FROM accounts WHERE id = new.to_account_id), '') || ' ' ||
      CAST(new.amount AS TEXT)
    );
  END;

  CREATE TRIGGER IF NOT EXISTS ledger_fts_tr_au AFTER UPDATE ON transfers BEGIN
    UPDATE ledger_fts SET body =
      new.note || ' ' ||
      COALESCE((SELECT name FROM accounts WHERE id = new.from_account_id), '') || ' ' ||
      COALESCE((SELECT name FROM accounts WHERE id = new.to_account_id), '') || ' ' ||
      CAST(new.amount AS TEXT)
    WHERE rowid = old.id + ${TRANSFER_BASE} AND kind = 'transfer';
  END;

  CREATE TRIGGER IF NOT EXISTS ledger_fts_tr_ad AFTER DELETE ON transfers BEGIN
    DELETE FROM ledger_fts WHERE rowid = old.id + ${TRANSFER_BASE} AND kind = 'transfer';
  END;

  -- ===== parties (rowid band: ${PARTY_BASE}) =====
  CREATE TRIGGER IF NOT EXISTS ledger_fts_party_ai AFTER INSERT ON parties BEGIN
    INSERT INTO ledger_fts(rowid, kind, body) VALUES (new.id + ${PARTY_BASE}, 'party', new.name || ' ' || new.phone);
  END;

  CREATE TRIGGER IF NOT EXISTS ledger_fts_party_au AFTER UPDATE ON parties BEGIN
    UPDATE ledger_fts SET body = new.name || ' ' || new.phone WHERE rowid = old.id + ${PARTY_BASE} AND kind = 'party';
  END;

  CREATE TRIGGER IF NOT EXISTS ledger_fts_party_ad AFTER DELETE ON parties BEGIN
    DELETE FROM ledger_fts WHERE rowid = old.id + ${PARTY_BASE} AND kind = 'party';
  END;

  -- ===== accounts (rowid band: ${ACCOUNT_BASE}) =====
  CREATE TRIGGER IF NOT EXISTS ledger_fts_acc_ai AFTER INSERT ON accounts BEGIN
    INSERT INTO ledger_fts(rowid, kind, body) VALUES (new.id + ${ACCOUNT_BASE}, 'account', new.name);
  END;

  CREATE TRIGGER IF NOT EXISTS ledger_fts_acc_au AFTER UPDATE ON accounts BEGIN
    UPDATE ledger_fts SET body = new.name WHERE rowid = old.id + ${ACCOUNT_BASE} AND kind = 'account';
  END;

  CREATE TRIGGER IF NOT EXISTS ledger_fts_acc_ad AFTER DELETE ON accounts BEGIN
    DELETE FROM ledger_fts WHERE rowid = old.id + ${ACCOUNT_BASE} AND kind = 'account';
  END;

  -- ===== rename / drop rebuilds =====
  -- Account renamed → rebuild every ledger row that references it. Each kind's
  -- band is shifted back so the IN-list rowids line up with the stored ones.
  CREATE TRIGGER IF NOT EXISTS ledger_fts_acc_rename AFTER UPDATE ON accounts BEGIN
    UPDATE ledger_fts SET body = (
      SELECT t.note || ' ' ||
             COALESCE(c.name, '') || ' ' ||
             COALESCE(a.name, '') || ' ' ||
             CAST(t.amount AS TEXT)
      FROM transactions t
      LEFT JOIN categories c ON c.id = t.category_id
      LEFT JOIN accounts a ON a.id = t.account_id
      WHERE t.id = ledger_fts.rowid
    ) WHERE kind = 'tx' AND rowid IN (SELECT id FROM transactions WHERE account_id = new.id);

    UPDATE ledger_fts SET body = (
      SELECT tr.note || ' ' ||
             COALESCE(a1.name, '') || ' ' ||
             COALESCE(a2.name, '') || ' ' ||
             CAST(tr.amount AS TEXT)
      FROM transfers tr
      LEFT JOIN accounts a1 ON a1.id = tr.from_account_id
      LEFT JOIN accounts a2 ON a2.id = tr.to_account_id
      WHERE tr.id + ${TRANSFER_BASE} = ledger_fts.rowid
    ) WHERE kind = 'transfer'
      AND rowid IN (
        SELECT id + ${TRANSFER_BASE} FROM transfers
        WHERE from_account_id = new.id OR to_account_id = new.id
      );
  END;

  -- Category renamed → rebuild every transaction that references it.
  CREATE TRIGGER IF NOT EXISTS ledger_fts_cat_rename AFTER UPDATE ON categories BEGIN
    UPDATE ledger_fts SET body = (
      SELECT t.note || ' ' ||
             COALESCE(c.name, '') || ' ' ||
             COALESCE(a.name, '') || ' ' ||
             CAST(t.amount AS TEXT)
      FROM transactions t
      LEFT JOIN categories c ON c.id = t.category_id
      LEFT JOIN accounts a ON a.id = t.account_id
      WHERE t.id = ledger_fts.rowid
    ) WHERE kind = 'tx' AND rowid IN (SELECT id FROM transactions WHERE category_id = new.id);
  END;

  -- Category deleted → the FK sets transactions.category_id NULL, so the
  -- trigger cannot scope by old id; rebuild every transaction body instead.
  CREATE TRIGGER IF NOT EXISTS ledger_fts_cat_delete AFTER DELETE ON categories BEGIN
    UPDATE ledger_fts SET body = (
      SELECT t.note || ' ' ||
             COALESCE(c.name, '') || ' ' ||
             COALESCE(a.name, '') || ' ' ||
             CAST(t.amount AS TEXT)
      FROM transactions t
      LEFT JOIN categories c ON c.id = t.category_id
      LEFT JOIN accounts a ON a.id = t.account_id
      WHERE t.id = ledger_fts.rowid
    ) WHERE kind = 'tx';
  END;
`;

/** Upper bound on FTS terms per query, so a long paste stays cheap. */
const FTS_MAX_TERMS = 8;

/**
 * Converts user input into an FTS5 MATCH expression, or null when the query
 * has no token long enough for the trigram tokenizer (needs ≥3 characters).
 *
 * Each term is quoted to neutralize FTS5 syntax characters (quotes, `:`, `*`,
 * `-`, parens, …); terms AND together so all of them must appear. Trigram
 * matches substrings, so "stati" still finds "station" — close to the old
 * `LIKE '%q%'` behaviour for anything ≥3 characters.
 */
export function ftsMatchQuery(query: string): string | null {
  const tokens = query.match(/[A-Za-z0-9]{3,}/g);
  if (!tokens) {
    return null;
  }
  const unique = [...new Set(tokens)].slice(0, FTS_MAX_TERMS);
  return unique.map((token) => `"${token}"`).join(' ');
}

/** Rowids of feed rows (transactions + transfers) matching an FTS expression. */
export interface FtsFeedIds {
  txIds: number[];
  transferIds: number[];
}

/**
 * Runs the FTS query against the ledger index and returns the matching
 * transactions and transfers as separate id lists (the caller joins them back
 * to the feed). Ordered by FTS relevance, then capped at `limit`.
 */
export async function searchFeedIdsByFts(
  db: SQLiteDatabase,
  match: string,
  limit = SEARCH_LIMIT
): Promise<FtsFeedIds> {
  const rows = await db.getAllAsync<{ rowid: number; kind: string }>(
    `SELECT rowid, kind FROM ${FTS_TABLE}
     WHERE ${FTS_TABLE} MATCH ?
       AND kind IN ('tx', 'transfer')
     ORDER BY rank
     LIMIT ${limit}`,
    match
  );
  const txIds: number[] = [];
  const transferIds: number[] = [];
  for (const row of rows) {
    if (row.kind === 'tx') {
      txIds.push(row.rowid);
    } else {
      // Transfer rowids are stored in their own band — shift back to the real
      // transfer id before handing it to the feed query.
      transferIds.push(row.rowid - TRANSFER_BASE);
    }
  }
  return { txIds, transferIds };
}
