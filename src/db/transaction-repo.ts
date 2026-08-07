/** Transaction and combined ledger queries. */
import type { Href } from 'expo-router';

import { getDatabase, nowIso } from '@/db/database';
import { enqueueChange } from '@/db/sync/queue-repo';
import { getCurrentUserId } from '@/services/supabase/auth';
import type {
  CategoryTotal,
  DaySummary,
  LedgerRow,
  NewTransaction,
  TransactionRow,
  TransactionType,
} from '@/types';
import { monthBounds } from '@/utils/format';
import { likeParam, SEARCH_LIMIT } from '@/utils/search';
import { uuid } from '@/utils/uuid';

/**
 * Ledger row ids are offset so transfer ids never collide with transaction
 * ids when both live in one feed (React keys + deletes).
 */
export const TRANSFER_ID_OFFSET = 10_000_000;

/** Maps a ledger row back to the underlying row id for deletion. */
export function ledgerDeleteId(row: LedgerRow): number {
  return row.kind === 'transfer' ? row.id - TRANSFER_ID_OFFSET : row.id;
}

/**
 * Route (with `editId`) that opens a ledger row in its edit form.
 * Must map through `ledgerDeleteId` — ledger transfer ids are offset by
 * `TRANSFER_ID_OFFSET`, so passing `row.id` straight to the route makes
 * `getTransfer`/`deleteTransfer` miss the real row (edit silently bounces).
 */
export function editRouteForLedgerRow(row: LedgerRow): Href | null {
  // Opening Balance entries are immutable — the dedicated flow edits the
  // opening balance itself, never the ledger row.
  if (row.entryKind === 'opening') {
    return null;
  }
  const targetId = ledgerDeleteId(row);
  const params = { editId: String(targetId) };
  if (row.kind === 'transfer') {
    return { pathname: '/transfer', params };
  }
  if (row.kind === 'income') {
    return { pathname: '/income', params };
  }
  return { pathname: '/expense', params };
}

export async function addTransaction(tx: NewTransaction): Promise<number> {
  const db = getDatabase();
  const recordUuid = uuid();
  const now = nowIso();
  const userId = getCurrentUserId();
  const kind = tx.kind ?? 'normal';
  const result = await db.runAsync(
    'INSERT INTO transactions (uuid, user_id, updated_at, type, amount, account_id, category_id, note, date, kind) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    recordUuid,
    userId,
    now,
    tx.type,
    tx.amount,
    tx.accountId,
    tx.categoryId,
    tx.note,
    tx.date,
    kind
  );
  await enqueueChange(db, {
    table: 'transactions',
    operation: 'insert',
    recordUuid,
    payload: { type: tx.type, amount: tx.amount, kind },
  });
  return result.lastInsertRowId;
}

/** Loads a single transaction (joined with its account + category) for editing. */
export async function getTransaction(id: number): Promise<TransactionRow | null> {
  const db = getDatabase();
  return db.getFirstAsync<TransactionRow>(
    `
    SELECT
      t.id,
      t.type,
      t.amount,
      t.account_id AS accountId,
      t.category_id AS categoryId,
      t.note,
      t.date,
      t.created_at AS createdAt,
      t.kind,
      a.name AS accountName,
      a.type AS accountType,
      c.name AS categoryName,
      c.icon AS categoryIcon
    FROM transactions t
    LEFT JOIN accounts a ON a.id = t.account_id
    LEFT JOIN categories c ON c.id = t.category_id
    WHERE t.id = ?
    `,
    id
  );
}

export async function updateTransaction(
  id: number,
  input: NewTransaction
): Promise<void> {
  if (!(input.amount > 0)) {
    throw new Error('Amount must be greater than zero.');
  }
  const db = getDatabase();
  await db.withTransactionAsync(async () => {
    const row = await db.getFirstAsync<{ uuid: string; kind: string }>(
      'SELECT uuid, kind FROM transactions WHERE id = ?',
      id
    );
    // Never allow editing an Opening Balance entry through the normal flow.
    if (row?.kind === 'opening') {
      throw new Error('Opening Balance entries are immutable. Edit the opening balance instead.');
    }
    const kind = input.kind ?? 'normal';
    await db.runAsync(
      'UPDATE transactions SET updated_at = ?, type = ?, amount = ?, account_id = ?, category_id = ?, note = ?, date = ?, kind = ? WHERE id = ?',
      nowIso(),
      input.type,
      input.amount,
      input.accountId,
      input.categoryId,
      input.note,
      input.date,
      kind,
      id
    );
    if (row?.uuid) {
      await enqueueChange(db, {
        table: 'transactions',
        operation: 'update',
        recordUuid: row.uuid,
      });
    }
  });
}

export async function deleteTransaction(id: number): Promise<void> {
  const db = getDatabase();
  await db.withTransactionAsync(async () => {
    const row = await db.getFirstAsync<{ uuid: string; kind: string }>(
      'SELECT uuid, kind FROM transactions WHERE id = ?',
      id
    );
    // Never allow deleting an Opening Balance entry through the normal flow.
    if (row?.kind === 'opening') {
      throw new Error('Opening Balance entries are immutable. Edit the opening balance instead.');
    }
    await db.runAsync('DELETE FROM transactions WHERE id = ?', id);
    if (row?.uuid) {
      await enqueueChange(db, { table: 'transactions', operation: 'delete', recordUuid: row.uuid });
    }
  });
}

export async function listTransactions(limit?: number): Promise<TransactionRow[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<TransactionRow>(`
    SELECT
      t.id,
      t.type,
      t.amount,
      t.account_id AS accountId,
      t.category_id AS categoryId,
      t.note,
      t.date,
      t.created_at AS createdAt,
      t.kind,
      a.name AS accountName,
      a.type AS accountType,
      c.name AS categoryName,
      c.icon AS categoryIcon
    FROM transactions t
    LEFT JOIN accounts a ON a.id = t.account_id
    LEFT JOIN categories c ON c.id = t.category_id
    ORDER BY t.date DESC, t.id DESC
  `);
  return limit ? rows.slice(0, limit) : rows;
}

const LEDGER_SELECT = `
  SELECT
    t.id,
    t.type AS kind,
    t.amount,
    t.note,
    t.date,
    t.created_at AS createdAt,
    t.account_id AS accountId,
    a.name AS accountName,
    t.category_id AS categoryId,
    c.name AS categoryName,
    c.icon AS categoryIcon,
    t.kind AS entryKind,
    NULL AS fromAccountId,
    NULL AS fromAccountName,
    NULL AS toAccountId,
    NULL AS toAccountName
  FROM transactions t
  LEFT JOIN accounts a ON a.id = t.account_id
  LEFT JOIN categories c ON c.id = t.category_id
`;

const TRANSFER_SELECT = `
  SELECT
    tr.id + ${TRANSFER_ID_OFFSET} AS id,
    'transfer' AS kind,
    tr.amount,
    tr.note,
    tr.date,
    tr.created_at AS createdAt,
    NULL AS accountId,
    NULL AS accountName,
    NULL AS categoryId,
    NULL AS categoryName,
    NULL AS categoryIcon,
    'normal' AS entryKind,
    tr.from_account_id AS fromAccountId,
    fa.name AS fromAccountName,
    tr.to_account_id AS toAccountId,
    ta.name AS toAccountName
  FROM transfers tr
  JOIN accounts fa ON fa.id = tr.from_account_id
  JOIN accounts ta ON ta.id = tr.to_account_id
`;

/** Cursor into a feed, so pages continue from where the last one stopped. */
export interface LedgerCursor {
  /** Feed date of the last loaded row (inclusive upper bound for the next page). */
  date: string;
  /** Feed id of the last loaded row (already offset for transfers). */
  id: number;
}

export interface LedgerPage {
  rows: LedgerRow[];
  /** True when more rows exist past this page. */
  hasMore: boolean;
  /** Pass this as the cursor to `loadMore`, or null when the feed is exhausted. */
  nextCursor: LedgerCursor | null;
}

/** How many feed rows to fetch per page. */
export const LEDGER_PAGE_SIZE = 50;

/** Full feed (all transactions + all transfers) as a subquery, no ordering. */
const LEDGER_FEED = `
  SELECT * FROM (
    ${LEDGER_SELECT}
    UNION ALL
    ${TRANSFER_SELECT}
  ) AS feed
`;

/** One page of the combined feed, newest first. */
export async function listLedgerPage(cursor?: LedgerCursor): Promise<LedgerPage> {
  const db = getDatabase();
  const params: (string | number)[] = [];
  const where = cursor ? 'WHERE feed.date < ? OR (feed.date = ? AND feed.id < ?)' : '';
  if (cursor) {
    params.push(cursor.date, cursor.date, cursor.id);
  }
  const rows = await db.getAllAsync<LedgerRow>(
    `${LEDGER_FEED} ${where} ORDER BY feed.date DESC, feed.id DESC LIMIT ${LEDGER_PAGE_SIZE + 1}`,
    ...params
  );
  return pageResult(rows);
}

/** One page of the feed limited to one account's entries + transfers. */
export async function listAccountLedgerPage(
  accountId: number,
  cursor?: LedgerCursor
): Promise<LedgerPage> {
  const db = getDatabase();
  const params: (string | number)[] = [accountId, accountId, accountId];
  const where = cursor ? 'WHERE feed.date < ? OR (feed.date = ? AND feed.id < ?)' : '';
  if (cursor) {
    params.push(cursor.date, cursor.date, cursor.id);
  }
  const rows = await db.getAllAsync<LedgerRow>(
    `
    SELECT * FROM (
      ${LEDGER_SELECT}
      WHERE t.account_id = ?
      UNION ALL
      ${TRANSFER_SELECT}
      WHERE tr.from_account_id = ? OR tr.to_account_id = ?
    ) AS feed
    ${where}
    ORDER BY feed.date DESC, feed.id DESC
    LIMIT ${LEDGER_PAGE_SIZE + 1}
    `,
    ...params
  );
  return pageResult(rows);
}

/** Splits a fetched page into its rows + next-page cursor. */
function pageResult(rows: LedgerRow[]): LedgerPage {
  const hasMore = rows.length > LEDGER_PAGE_SIZE;
  const page = hasMore ? rows.slice(0, LEDGER_PAGE_SIZE) : rows;
  const last = page[page.length - 1];
  return {
    rows: page,
    hasMore,
    nextCursor: hasMore && last ? { date: last.date, id: last.id } : null,
  };
}

/**
 * Search the combined feed (transactions + transfers) by note, category,
 * account name or amount. Matching happens in SQLite (`LIKE`) so only the
 * matching rows are loaded into JS. Returns rows newest first.
 */
export async function searchLedger(query: string, limit = SEARCH_LIMIT): Promise<LedgerRow[]> {
  const db = getDatabase();
  const q = query.trim();
  if (!q) {
    return [];
  }
  const like = likeParam(q);
  const params: string[] = [like, like, like, like, like];
  // A purely-numeric query also matches amounts as text, e.g. "5" → 500, 1500.5.
  const numeric = q.replace(/[^0-9]/g, '');
  if (numeric) {
    params.push(`%${numeric}%`);
  }
  const amountClause = numeric
    ? ` OR CAST(feed.amount AS TEXT) LIKE ? ESCAPE '\\'`
    : '';
  return db.getAllAsync<LedgerRow>(
    `
    SELECT * FROM (
      ${LEDGER_SELECT}
      UNION ALL
      ${TRANSFER_SELECT}
    ) AS feed
    WHERE feed.note LIKE ? ESCAPE '\\'
       OR feed.categoryName LIKE ? ESCAPE '\\'
       OR feed.accountName LIKE ? ESCAPE '\\'
       OR feed.fromAccountName LIKE ? ESCAPE '\\'
       OR feed.toAccountName LIKE ? ESCAPE '\\'
       ${amountClause}
    ORDER BY feed.date DESC, feed.id DESC
    LIMIT ${limit}
    `,
    ...params
  );
}

/** Income and expense totals for a single day (`YYYY-MM-DD`). */
export async function getDaySummary(date: string): Promise<DaySummary> {
  const db = getDatabase();
  const row = await db.getFirstAsync<{ income: number; expense: number }>(
    `
    SELECT
      COALESCE(SUM(CASE WHEN type = 'income' THEN amount END), 0) AS income,
      COALESCE(SUM(CASE WHEN type = 'expense' THEN amount END), 0) AS expense
    FROM transactions
    WHERE date = ?
    `,
    date
  );
  return { income: row?.income ?? 0, expense: row?.expense ?? 0 };
}

/** Income and expense totals for a month (`YYYY-MM`). */
export async function getMonthSummary(yearMonth: string): Promise<DaySummary> {
  const db = getDatabase();
  const { start, end } = monthBounds(yearMonth);
  const row = await db.getFirstAsync<{ income: number; expense: number }>(
    `
    SELECT
      COALESCE(SUM(CASE WHEN type = 'income' THEN amount END), 0) AS income,
      COALESCE(SUM(CASE WHEN type = 'expense' THEN amount END), 0) AS expense
    FROM transactions
    WHERE date >= ? AND date < ?
    `,
    start,
    end
  );
  return { income: row?.income ?? 0, expense: row?.expense ?? 0 };
}

/** Per-category totals for a month and type, largest first. */
export async function getCategoryBreakdown(
  yearMonth: string,
  type: TransactionType
): Promise<CategoryTotal[]> {
  const db = getDatabase();
  const { start, end } = monthBounds(yearMonth);
  return db.getAllAsync<CategoryTotal>(
    `
    SELECT
      COALESCE(c.name, 'Other') AS name,
      c.icon AS icon,
      SUM(t.amount) AS total,
      ? AS type
    FROM transactions t
    LEFT JOIN categories c ON c.id = t.category_id
    WHERE t.date >= ? AND t.date < ? AND t.type = ?
    GROUP BY c.id, c.name, c.icon
    ORDER BY total DESC
    `,
    type,
    start,
    end,
    type
  );
}