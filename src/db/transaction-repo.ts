/** Transaction and combined ledger queries. */
import type { Href } from 'expo-router';

import { getDatabase, nowIso } from '@/db/database';
import { ftsMatchQuery, isFtsEnabled, searchFeedIdsByFts } from '@/db/search-index';
import { enqueueChange } from '@/db/sync/queue';
import { getCurrentUserId } from '@/services/supabase/auth';
import type {
  CategoryTotal,
  DaySummary,
  LedgerRow,
  NewTransaction,
  TransactionRow,
  TransactionType,
} from '@/types';
import { safeParseAttachments } from '@/utils/attachments';
import { monthBounds, nowTime } from '@/utils/format';
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
  const time = tx.time ?? nowTime();
  const result = await db.runAsync(
    'INSERT INTO transactions (uuid, user_id, updated_at, type, amount, account_id, category_id, note, date, time, kind, attachments) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    recordUuid,
    userId,
    now,
    tx.type,
    tx.amount,
    tx.accountId,
    tx.categoryId,
    tx.note,
    tx.date,
    time,
    kind,
    JSON.stringify(tx.attachments ?? [])
  );
  await enqueueChange(db, 'transactions', recordUuid, 'insert', { type: tx.type, amount: tx.amount, kind });
  return result.lastInsertRowId;
}

/** Loads a single transaction (joined with its account + category) for editing. */
export async function getTransaction(id: number): Promise<TransactionRow | null> {
  const db = getDatabase();
  const row = await db.getFirstAsync<TransactionRow & { attachmentsRaw?: string | null }>(
    `
    SELECT
      t.id,
      t.type,
      t.amount,
      t.account_id AS accountId,
      t.category_id AS categoryId,
      t.note,
      t.date,
      t.time,
      t.created_at AS createdAt,
      t.kind,
      t.attachments AS attachmentsRaw,
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
  if (!row) {
    return null;
  }
  const { attachmentsRaw, ...rest } = row;
  return { ...rest, attachments: safeParseAttachments(attachmentsRaw) };
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
      'UPDATE transactions SET updated_at = ?, type = ?, amount = ?, account_id = ?, category_id = ?, note = ?, date = ?, kind = ?, attachments = ? WHERE id = ?',
      nowIso(),
      input.type,
      input.amount,
      input.accountId,
      input.categoryId,
      input.note,
      input.date,
      kind,
      JSON.stringify(input.attachments ?? []),
      id
    );
    if (row?.uuid) {
      await enqueueChange(db, 'transactions', row.uuid, 'update');
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
      await enqueueChange(db, 'transactions', row.uuid, 'delete');
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
      t.time,
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
    t.time AS time,
    t.created_at AS createdAt,
    t.account_id AS accountId,
    a.name AS accountName,
    t.category_id AS categoryId,
    c.name AS categoryName,
    c.icon AS categoryIcon,
    t.kind AS entryKind,
    t.attachments AS attachmentsRaw,
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
    tr.time AS time,
    tr.created_at AS createdAt,
    NULL AS accountId,
    NULL AS accountName,
    NULL AS categoryId,
    NULL AS categoryName,
    NULL AS categoryIcon,
    'normal' AS entryKind,
    NULL AS attachmentsRaw,
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

/** Full `YYYY-MM-DD` — shorter partial dates are ignored, matching the UI. */
const LEDGER_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * History screen filters, mirroring `HistoryFiltersState`. Applied as SQL
 * WHERE clauses over the `feed` subquery (see `buildLedgerFilter`).
 */
export interface LedgerFilter {
  /** Free-text search across note / category / account names / amount. */
  query?: string;
  /** Inclusive lower bound for `feed.date` (`YYYY-MM-DD`). */
  dateFrom?: string;
  /** Inclusive upper bound for `feed.date` (`YYYY-MM-DD`). */
  dateTo?: string;
  /** Inclusive lower bound for `feed.amount`. */
  minAmount?: string;
  /** Inclusive upper bound for `feed.amount`. */
  maxAmount?: string;
  /** Keep rows touching any of these accounts (transaction account or transfer ends). */
  accountIds?: number[];
  /** Keep rows in any of these categories (transactions only). */
  categoryIds?: number[];
}

/**
 * Builds the WHERE clause + params for a `LedgerFilter`, matched against the
 * `feed` subquery columns. Text search reuses the same LIKE semantics as
 * `searchLedgerByLike` (wildcard-escaped, ASCII case-insensitive, and numeric
 * queries also match amounts as text). Returns an empty `where` when nothing
 * is set, so callers can splice it with a cursor clause.
 */
export function buildLedgerFilter(filter: LedgerFilter): {
  where: string;
  params: (string | number)[];
} {
  const parts: string[] = [];
  const params: (string | number)[] = [];

  const q = filter.query?.trim() ?? '';
  if (q) {
    const like = likeParam(q);
    params.push(like, like, like, like, like);
    const numeric = q.replace(/[^0-9]/g, '');
    if (numeric) {
      params.push(`%${numeric}%`);
    }
    const amountClause = numeric
      ? ` OR CAST(feed.amount AS TEXT) LIKE ? ESCAPE '\\'`
      : '';
    parts.push(
      `(feed.note LIKE ? ESCAPE '\\' OR feed.categoryName LIKE ? ESCAPE '\\' ` +
        `OR feed.accountName LIKE ? ESCAPE '\\' OR feed.fromAccountName LIKE ? ESCAPE '\\' ` +
        `OR feed.toAccountName LIKE ? ESCAPE '\\'${amountClause})`
    );
  }

  if (filter.dateFrom && LEDGER_DATE_RE.test(filter.dateFrom)) {
    parts.push('feed.date >= ?');
    params.push(filter.dateFrom);
  }
  if (filter.dateTo && LEDGER_DATE_RE.test(filter.dateTo)) {
    parts.push('feed.date <= ?');
    params.push(filter.dateTo);
  }
  const min = Number(filter.minAmount);
  if (filter.minAmount !== '' && !Number.isNaN(min)) {
    parts.push('feed.amount >= ?');
    params.push(min);
  }
  const max = Number(filter.maxAmount);
  if (filter.maxAmount !== '' && !Number.isNaN(max)) {
    parts.push('feed.amount <= ?');
    params.push(max);
  }
  if (filter.accountIds && filter.accountIds.length > 0) {
    const ph = filter.accountIds.map(() => '?').join(',');
    parts.push(
      `(feed.accountId IN (${ph}) OR feed.fromAccountId IN (${ph}) OR feed.toAccountId IN (${ph}))`
    );
    params.push(...filter.accountIds, ...filter.accountIds, ...filter.accountIds);
  }
  if (filter.categoryIds && filter.categoryIds.length > 0) {
    const ph = filter.categoryIds.map(() => '?').join(',');
    parts.push(`feed.categoryId IN (${ph})`);
    params.push(...filter.categoryIds);
  }

  return { where: parts.join(' AND '), params };
}

/** One page of the combined feed, newest first, filtered by `filter` (if any). */
export async function listLedgerPage(
  filter?: LedgerFilter,
  cursor?: LedgerCursor | null
): Promise<LedgerPage> {
  const db = getDatabase();
  const parts: string[] = [];
  const params: (string | number)[] = [];
  const built = buildLedgerFilter(filter ?? {});
  if (built.where) {
    parts.push(built.where);
    params.push(...built.params);
  }
  if (cursor) {
    parts.push('(feed.date < ? OR (feed.date = ? AND feed.id < ?))');
    params.push(cursor.date, cursor.date, cursor.id);
  }
  const where = parts.length > 0 ? ` WHERE ${parts.join(' AND ')}` : '';
  const rows = await db.getAllAsync<LedgerRawRow>(
    `${LEDGER_FEED} ${where} ORDER BY feed.date DESC, feed.id DESC LIMIT ${LEDGER_PAGE_SIZE + 1}`,
    ...params
  );
  return pageResult(rows.map(toLedgerRow));
}

/**
 * All ledger rows within an inclusive date range, **newest first**. Pages
 * through `listLedgerPage({ dateFrom, dateTo })` until `hasMore` is false
 * (each page is already newest-first) and returns the accumulated array. Used
 * by the Cashbook, the day-detail screen and the transactions report — all
 * ledgers show the newest entry at the top.
 */
export async function listLedgerRange(
  from?: string,
  to?: string
): Promise<LedgerRow[]> {
  const all: LedgerRow[] = [];
  let cursor: LedgerCursor | null = null;
  let hasMore = true;
  while (hasMore) {
    const page = await listLedgerPage({ dateFrom: from, dateTo: to }, cursor);
    all.push(...page.rows);
    hasMore = page.hasMore;
    cursor = page.nextCursor;
  }
  return all;
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
  const rows = await db.getAllAsync<LedgerRawRow>(
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
  return pageResult(rows.map(toLedgerRow));
}

/** Raw feed row as returned by SQL, with the attachments JSON column exposed. */
type LedgerRawRow = LedgerRow & { attachmentsRaw?: string | null };

/**
 * Maps a raw feed row to a `LedgerRow`, converting the stored attachments JSON
 * into the cheap `hasAttachments` flag. The full metadata stays out of feed
 * rows — the edit form loads it separately via `getTransaction`/`getTransfer`.
 */
function toLedgerRow(raw: LedgerRawRow): LedgerRow {
  const { attachmentsRaw, ...rest } = raw;
  return { ...rest, hasAttachments: safeParseAttachments(attachmentsRaw).length > 0 };
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
 * account name or amount. When the FTS5 index is available this runs an
 * indexed FTS query and joins the matching ids back to the feed; otherwise it
 * falls back to a `LIKE` scan. Returns rows newest first.
 */
export async function searchLedger(query: string, limit = SEARCH_LIMIT): Promise<LedgerRow[]> {
  const db = getDatabase();
  const q = query.trim();
  if (!q) {
    return [];
  }
  if (isFtsEnabled()) {
    const match = ftsMatchQuery(q);
    if (match) {
      return searchLedgerByFts(db, match, limit);
    }
    // Query has no token ≥3 chars, which the trigram tokenizer can't index —
    // fall through to LIKE, which also covers 1–2 char amounts.
  }
  return searchLedgerByLike(db, q, limit);
}

/** FTS-backed search: match ids in the index, then load those feed rows. */
async function searchLedgerByFts(
  db: ReturnType<typeof getDatabase>,
  match: string,
  limit: number
): Promise<LedgerRow[]> {
  const { txIds, transferIds } = await searchFeedIdsByFts(db, match, limit);
  if (txIds.length === 0 && transferIds.length === 0) {
    return [];
  }
  const parts: string[] = [];
  const params: (string | number)[] = [];
  if (txIds.length > 0) {
    parts.push(`(${LEDGER_SELECT} WHERE t.id IN (${txIds.map(() => '?').join(',')}))`);
    params.push(...txIds);
  }
  if (transferIds.length > 0) {
    parts.push(`(${TRANSFER_SELECT} WHERE tr.id IN (${transferIds.map(() => '?').join(',')}))`);
    params.push(...transferIds);
  }
  const rows = await db.getAllAsync<LedgerRawRow>(parts.join(' UNION ALL '), ...params);
  return rows
    .map(toLedgerRow)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
    .slice(0, limit);
}

/** LIKE-backed search: substring match across the whole feed. */
async function searchLedgerByLike(
  db: ReturnType<typeof getDatabase>,
  q: string,
  limit: number
): Promise<LedgerRow[]> {
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
  const rows = await db.getAllAsync<LedgerRawRow>(
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
  return rows.map(toLedgerRow);
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

/** One day's aggregated ledger row (see `listDaySummaries`). */
export interface DayLedgerSummary {
  date: string;
  entryCount: number;
  income: number;
  expense: number;
  cashInHand: number;
}

/**
 * Per-day ledger summary for a date range, newest first. `cashInHand` is the
 * running balance computed over ALL days (not just the range), so the first
 * row carries the true pre-range balance in. Omit `from`/`to` for all time.
 *
 * Cash in hand = net of all CASH accounts: income − expense + transfers IN − transfers OUT.
 * Transfers between cash accounts cancel out; transfers between cash ↔ bank change cash in hand.
 */
export async function listDaySummaries(from?: string, to?: string): Promise<DayLedgerSummary[]> {
  const db = getDatabase();
  const params: string[] = [];
  let bounds = '';
  if (from && to) {
    bounds = 'WHERE date >= ? AND date <= ?';
    params.push(from, to);
  }
  return db.getAllAsync<DayLedgerSummary>(
    `
    WITH day_net AS (
      SELECT date,
        COUNT(*) AS entryCount,
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount END), 0) AS income,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount END), 0) AS expense
      FROM transactions
      GROUP BY date
    ), day_transfers AS (
      SELECT date,
        COALESCE(SUM(CASE WHEN fa.type = 'cash' AND ta.type <> 'cash' THEN tr.amount END), 0) AS cashOut,
        COALESCE(SUM(CASE WHEN fa.type <> 'cash' AND ta.type = 'cash' THEN tr.amount END), 0) AS cashIn
      FROM transfers tr
      JOIN accounts fa ON fa.id = tr.from_account_id
      JOIN accounts ta ON ta.id = tr.to_account_id
      WHERE fa.type = 'cash' OR ta.type = 'cash'
      GROUP BY date
    ), daily AS (
      SELECT dn.date,
             dn.entryCount,
             dn.income,
             dn.expense,
             COALESCE(dt.cashIn, 0) - COALESCE(dt.cashOut, 0) AS netTransfers
      FROM day_net dn
      LEFT JOIN day_transfers dt ON dt.date = dn.date
    ), cumulative AS (
      SELECT date, entryCount, income, expense,
             SUM(income - expense + netTransfers) OVER (ORDER BY date) AS cashInHand
      FROM daily
    )
    SELECT * FROM cumulative
    ${bounds}
    ORDER BY date DESC
    `,
    ...params
  );
}

/**
 * Cumulative balance (all accounts) up to and including `date`.
 *
 * `listDaySummaries` only emits rows for days that appear in the ledger, so a
 * day with no transactions (e.g. today before any entry is recorded) returns no
 * row and the Cashbook would otherwise show ₹0 for Cash in Hand. The running
 * balance still exists on such days — it just hasn't changed. Callers use this
 * to synthesize the summary for an entry-less day.
 */
export async function getRunningBalance(date: string): Promise<number> {
  const db = getDatabase();
  const row = await db.getFirstAsync<{ balance: number }>(
    `SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0) AS balance
     FROM transactions
     WHERE date <= ?`,
    date
  );
  return row?.balance ?? 0;
}

/**
 * Attaches a per-entry running balance (cash in hand) to a day's ledger rows.
 *
 * `listLedgerRange` returns the day's rows newest-first (date DESC, id DESC);
 * this re-derives the balance forward from the day's start so the last row's
 * running balance equals the day's closing `cashInHand` shown in the header.
 * Transfers never change total cash in hand (money stays in the book), so only
 * income/expense rows move the balance — matching `getRunningBalance`. Rows
 * are mutated in place and the same array is returned.
 */
export async function withDayRunningBalance(
  date: string,
  entries: LedgerRow[]
): Promise<LedgerRow[]> {
  if (entries.length === 0) {
    return entries;
  }
  const dayNet = await getDaySummary(date);
  const inclusiveBalance = await getRunningBalance(date);
  // Balance strictly before this day, then walk the day's rows chronologically.
  let running = inclusiveBalance - (dayNet.income - dayNet.expense);
  const chronological = [...entries].reverse();
  for (const row of chronological) {
    if (row.kind === 'income') {
      running += row.amount;
    } else if (row.kind === 'expense') {
      running -= row.amount;
    }
    row.runningBalance = running;
  }
  return entries;
}

/**
 * Summary row for a single day, always present. A day with no entries returns
 * no row from `listDaySummaries`; this synthesizes one with the day's running
 * balance so Cash in Hand never shows ₹0 (the true balance still exists — it
 * just hasn't changed that day).
 */
export async function getDayLedgerSummary(date: string): Promise<DayLedgerSummary> {
  const rows = await listDaySummaries(date, date);
  if (rows[0]) {
    return rows[0];
  }
  return {
    date,
    entryCount: 0,
    income: 0,
    expense: 0,
    cashInHand: await getRunningBalance(date),
  };
}

/**
 * Normalize a `listDaySummaries` result so every day's `cashInHand` exactly
 * equals the previous day's `cashInHand` plus that day's own balance
 * (income − expense). The SQL already computes the running window, but this
 * re-derives it bottom-up as a hard guarantee: the earliest row keeps its SQL
 * value (which carries the pre-range balance in for bounded ranges) and each
 * later row is rebuilt as `previous + current`. Pass rows newest-first (as
 * returned by the query); the result is returned newest-first too.
 */
export function runningCashInHand(days: DayLedgerSummary[]): DayLedgerSummary[] {
  if (days.length === 0) {
    return days;
  }
  const asc = [...days].reverse();
  let running = asc[0].cashInHand;
  for (let i = 1; i < asc.length; i++) {
    running += asc[i].income - asc[i].expense;
    asc[i] = { ...asc[i], cashInHand: running };
  }
  return asc.reverse();
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