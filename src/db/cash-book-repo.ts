/**
 * Daily cash book: a day's expected cash in hand and the reconciliation
 * against the counted (actual) amount.
 *
 * "Cash" means every account with `type = 'cash'`, combined. The book follows
 * the same balance math as accounts — everything derives from the ledger:
 *   closing = opening + income - expense + transferIn - transferOut
 * `opening` is everything strictly before the day, so a day's book is
 * self-contained and historical days can be inspected without replaying rows.
 *
 * The Opening Balance is a first-class ledger entry (kind = 'opening') so it
 * flows through the same `income - expense` aggregation here.
 */
import { getDatabase } from '@/db/database';
import {
  LEDGER_PAGE_SIZE,
  TRANSFER_ID_OFFSET,
  type LedgerCursor,
} from '@/db/transaction-repo';
import { safeParseAttachments } from '@/utils/attachments';
import type { Href } from 'expo-router';
import type { CashBook, CashBookEntry } from '@/types';

/**
 * Route (with `editId`) that opens a cash entry in its edit form.
 * Transfer rows carry offset ids (`TRANSFER_ID_OFFSET`) in history pages but
 * raw ids in day pages — `transferId` (when present) wins, otherwise the
 * offset is stripped. Opening rows are immutable → null (non-tappable).
 */
export function editRouteForCashEntry(entry: CashBookEntry): Href | null {
  if (entry.type === 'opening' || entry.entryKind === 'opening') {
    return null;
  }
  if (entry.type === 'transfer_in' || entry.type === 'transfer_out' || entry.type === 'transfer_internal') {
    const targetId =
      entry.transferId && entry.transferId > 0
        ? entry.transferId
        : entry.id >= TRANSFER_ID_OFFSET
          ? entry.id - TRANSFER_ID_OFFSET
          : entry.id;
    return { pathname: '/transfer', params: { editId: String(targetId) } } as Href;
  }
  if (entry.type === 'income') {
    return { pathname: '/income', params: { editId: String(entry.id) } } as Href;
  }
  return { pathname: '/expense', params: { editId: String(entry.id) } } as Href;
}

export async function getCashBook(date: string): Promise<CashBook> {
  const db = getDatabase();
  const row = await db.getFirstAsync<{
    opening: number;
    income: number;
    expense: number;
    transferIn: number;
    transferOut: number;
  }>(
    `
    SELECT
      -- Opening: everything strictly before the day, derived from the ledger.
      COALESCE(
        (SELECT SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE -t.amount END)
         FROM transactions t JOIN accounts a ON a.id = t.account_id
         WHERE a.type = 'cash' AND t.date < ?),
        0
      )
      + COALESCE(
          (SELECT SUM(tr.amount) FROM transfers tr JOIN accounts a ON a.id = tr.to_account_id
           WHERE a.type = 'cash' AND tr.date < ?),
          0
        )
      - COALESCE(
          (SELECT SUM(tr.amount) FROM transfers tr JOIN accounts a ON a.id = tr.from_account_id
           WHERE a.type = 'cash' AND tr.date < ?),
          0
        )
      AS opening,
      COALESCE(
        (SELECT SUM(t.amount) FROM transactions t JOIN accounts a ON a.id = t.account_id
         WHERE a.type = 'cash' AND t.type = 'income' AND t.date = ?),
        0
      ) AS income,
      COALESCE(
        (SELECT SUM(t.amount) FROM transactions t JOIN accounts a ON a.id = t.account_id
         WHERE a.type = 'cash' AND t.type = 'expense' AND t.date = ?),
        0
      ) AS expense,
      COALESCE(
        (SELECT SUM(tr.amount) FROM transfers tr JOIN accounts a ON a.id = tr.to_account_id
         WHERE a.type = 'cash' AND tr.date = ?),
        0
      ) AS transferIn,
      COALESCE(
        (SELECT SUM(tr.amount) FROM transfers tr JOIN accounts a ON a.id = tr.from_account_id
         WHERE a.type = 'cash' AND tr.date = ?),
        0
      ) AS transferOut
    `,
    date,
    date,
    date,
    date,
    date,
    date,
    date
  );

  const opening = row?.opening ?? 0;
  const income = row?.income ?? 0;
  const expense = row?.expense ?? 0;
  const transferIn = row?.transferIn ?? 0;
  const transferOut = row?.transferOut ?? 0;
  return {
    date,
    opening,
    income,
    expense,
    transferIn,
    transferOut,
    closing: opening + income - expense + transferIn - transferOut,
    actual: await getCashCount(date),
  };
}

/** The counted "cash in hand" stored for a day (0 when never counted). */
export async function getCashCount(date: string): Promise<number> {
  const db = getDatabase();
  const row = await db.getFirstAsync<{ actual: number }>(
    'SELECT actual FROM cash_counts WHERE date = ?',
    date
  );
  return row?.actual ?? 0;
}

/** Records the counted cash in hand for a day (upsert). */
export async function setCashCount(date: string, actual: number): Promise<void> {
  const db = getDatabase();
  await db.runAsync(
    'INSERT INTO cash_counts (date, actual) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET actual = excluded.actual',
    date,
    actual
  );
}

/** Removes the counted amount for a day (back to "not counted"). */
export async function clearCashCount(date: string): Promise<void> {
  const db = getDatabase();
  await db.runAsync('DELETE FROM cash_counts WHERE date = ?', date);
}

/** All-time cash balance (every `type='cash'` account combined) — running-balance anchor. */
export async function getCashTotalBalance(): Promise<number> {
  const db = getDatabase();
  const row = await db.getFirstAsync<{ total: number }>(
    `
    SELECT
      COALESCE(
        (SELECT SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE -t.amount END)
         FROM transactions t JOIN accounts a ON a.id = t.account_id
         WHERE a.type = 'cash'),
        0
      )
      + COALESCE(
          (SELECT SUM(tr.amount) FROM transfers tr JOIN accounts a ON a.id = tr.to_account_id
           WHERE a.type = 'cash'),
          0
        )
      - COALESCE(
          (SELECT SUM(tr.amount) FROM transfers tr JOIN accounts a ON a.id = tr.from_account_id
           WHERE a.type = 'cash'),
          0
        )
      AS total
    `
  );
  return row?.total ?? 0;
}

export interface CashLedgerPage {
  rows: CashBookEntry[];
  hasMore: boolean;
  nextCursor: LedgerCursor | null;
}

type CashLedgerRawRow = {
  id: number;
  date: string;
  time: string;
  createdAt: string;
  kind: 'income' | 'expense' | 'transfer';
  entryKind: 'normal' | 'opening';
  amount: number;
  note: string;
  categoryName: string | null;
  accountName: string | null;
  attachmentsRaw: string | null;
  fromCash: number;
  toCash: number;
  fromAccountName: string | null;
  toAccountName: string | null;
  /** Real transfer id (before TRANSFER_ID_OFFSET); 0 for transactions. */
  transferId: number;
};

/**
 * One page of the cash history ledger, newest first. Single union query:
 * cash `transactions` (join `accounts.type='cash'`) + cash-involving
 * `transfers` (direction from the `type` join, never the account name).
 * Cash↔cash internal moves emit one net-zero `transfer_internal` row so day
 * totals reconcile. Keyset cursor `(date, id)` with transfer ids offset by
 * `TRANSFER_ID_OFFSET` so they never collide with transaction ids.
 */
export async function listCashLedgerPage(cursor?: LedgerCursor | null): Promise<CashLedgerPage> {
  const db = getDatabase();
  const params: (string | number)[] = [];
  const where = cursor ? 'AND (feed.date < ? OR (feed.date = ? AND feed.id < ?))' : '';
  if (cursor) {
    params.push(cursor.date, cursor.date, cursor.id);
  }
  const raw = await db.getAllAsync<CashLedgerRawRow>(
    `
    SELECT * FROM (
      SELECT
        t.id AS id,
        t.date AS date,
        t.time AS time,
        t.created_at AS createdAt,
        t.type AS kind,
        t.amount AS amount,
        t.note AS note,
        c.name AS categoryName,
        a.name AS accountName,
        t.attachments AS attachmentsRaw,
        0 AS fromCash,
        0 AS toCash,
        NULL AS fromAccountName,
        NULL AS toAccountName,
        0 AS transferId,
        t.kind AS entryKind
      FROM transactions t
      JOIN accounts a ON a.id = t.account_id
      LEFT JOIN categories c ON c.id = t.category_id
      WHERE a.type = 'cash'
      UNION ALL
      SELECT
        tr.id + ${TRANSFER_ID_OFFSET} AS id,
        tr.date AS date,
        tr.time AS time,
        tr.created_at AS createdAt,
        'transfer' AS kind,
        tr.amount AS amount,
        tr.note AS note,
        NULL AS categoryName,
        NULL AS accountName,
        NULL AS attachmentsRaw,
        CASE WHEN fa.type = 'cash' THEN 1 ELSE 0 END AS fromCash,
        CASE WHEN ta.type = 'cash' THEN 1 ELSE 0 END AS toCash,
        fa.name AS fromAccountName,
        ta.name AS toAccountName,
        tr.id AS transferId,
        'normal' AS entryKind
      FROM transfers tr
      JOIN accounts fa ON fa.id = tr.from_account_id
      JOIN accounts ta ON ta.id = tr.to_account_id
      WHERE fa.type = 'cash' OR ta.type = 'cash'
    ) AS feed
    WHERE 1 = 1 ${where}
    ORDER BY feed.date DESC, feed.id DESC
    LIMIT ${LEDGER_PAGE_SIZE + 1}
    `,
    ...params
  );
  const rows: CashBookEntry[] = raw.map((r) => {
    if (r.kind === 'transfer') {
      const internal = r.fromCash === 1 && r.toCash === 1;
      const transferIn = !internal && r.toCash === 1;
      return {
        id: r.id,
        transferId: r.transferId,
        date: r.date,
        time: r.time ?? '',
        createdAt: r.createdAt ?? '',
        type: internal ? 'transfer_internal' : transferIn ? 'transfer_in' : 'transfer_out',
        amount: r.amount,
        note: r.note ?? '',
        category: null,
        // Show the other side: money in ← from, money out → to.
        account: internal
          ? `${r.fromAccountName ?? 'Cash'} → ${r.toAccountName ?? 'Cash'}`
          : transferIn
            ? (r.fromAccountName ?? '')
            : (r.toAccountName ?? ''),
        hasAttachments: false,
        entryKind: 'normal' as const,
        runningBalance: 0,
      };
    }
    return {
      id: r.id,
      transferId: 0,
      date: r.date,
      time: r.time ?? '',
      createdAt: r.createdAt ?? '',
      type: r.kind as 'income' | 'expense',
      amount: r.amount,
      note: r.note ?? '',
      category: r.categoryName,
      account: r.accountName,
      hasAttachments: safeParseAttachments(r.attachmentsRaw).length > 0,
      entryKind: r.entryKind,
      runningBalance: 0,
    };
  });
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
 * Gets all cash transactions for a day with running balance (like party ledger).
 */
export async function getCashBookEntries(date: string): Promise<CashBookEntry[]> {
  const db = getDatabase();

  // First get opening balance (everything before this day)
  const openingRow = await db.getFirstAsync<{ opening: number }>(
    `
    SELECT
      COALESCE(
        (SELECT SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE -t.amount END)
         FROM transactions t JOIN accounts a ON a.id = t.account_id
         WHERE a.type = 'cash' AND t.date < ?),
        0
      )
      + COALESCE(
          (SELECT SUM(tr.amount) FROM transfers tr JOIN accounts a ON a.id = tr.to_account_id
           WHERE a.type = 'cash' AND tr.date < ?),
          0
        )
      - COALESCE(
          (SELECT SUM(tr.amount) FROM transfers tr JOIN accounts a ON a.id = tr.from_account_id
           WHERE a.type = 'cash' AND tr.date < ?),
          0
        )
      AS opening
    `,
    date,
    date,
    date
  );

  const openingBalance = openingRow?.opening ?? 0;

  // Get all cash transactions for this day (oldest first for running balance calc)
  const transactions = await db.getAllAsync<{
    id: number;
    date: string;
    time: string;
    type: string;
    amount: number;
    note: string | null;
    category: string | null;
    account: string | null;
  }>(
    `
    SELECT
      t.id,
      t.date,
      t.time,
      t.type,
      t.amount,
      t.note,
      c.name AS category,
      a.name AS account
    FROM transactions t
    LEFT JOIN categories c ON c.id = t.category_id
    LEFT JOIN accounts a ON a.id = t.account_id
    WHERE a.type = 'cash' AND t.date = ?
    ORDER BY t.id ASC
    `,
    date
  );

  // Get all transfers for this day (direction from the account TYPE join — never the name)
  const transfers = await db.getAllAsync<{
    id: number;
    date: string;
    time: string;
    amount: number;
    note: string | null;
    from_account: string | null;
    to_account: string | null;
    from_type: string | null;
    to_type: string | null;
  }>(
    `
    SELECT
      tr.id,
      tr.date,
      tr.time,
      tr.amount,
      tr.note,
      fa.name AS from_account,
      ta.name AS to_account,
      fa.type AS from_type,
      ta.type AS to_type
    FROM transfers tr
    LEFT JOIN accounts fa ON fa.id = tr.from_account_id
    LEFT JOIN accounts ta ON ta.id = tr.to_account_id
    WHERE (fa.type = 'cash' OR ta.type = 'cash') AND tr.date = ?
    ORDER BY tr.id ASC
    `,
    date
  );

  // Combine and sort by time/id (oldest first)
  const combined: CashBookEntry[] = [];

  for (const t of transactions) {
    combined.push({
      id: t.id,
      date: t.date,
      time: t.time,
      type: t.type as 'income' | 'expense',
      amount: t.amount,
      note: t.note,
      category: t.category,
      account: t.account,
      runningBalance: 0, // will calculate below
    });
  }

  for (const tr of transfers) {
    const fromCash = tr.from_type === 'cash';
    const toCash = tr.to_type === 'cash';

    // Only include transfers where a cash account is involved
    if (fromCash || toCash) {
      const internal = fromCash && toCash;
      combined.push({
        id: tr.id,
        date: tr.date,
        time: tr.time,
        type: internal ? 'transfer_internal' : toCash ? 'transfer_in' : 'transfer_out',
        amount: tr.amount,
        note: tr.note,
        category: null,
        account: internal ? `${tr.from_account ?? 'Cash'} → ${tr.to_account ?? 'Cash'}` : toCash ? tr.from_account : tr.to_account,
        runningBalance: 0,
      });
    }
  }

  // Sort by time, then id (oldest first)
  combined.sort((a, b) => {
    const timeDiff = a.time.localeCompare(b.time);
    if (timeDiff !== 0) return timeDiff;
    return a.id - b.id;
  });

  // Calculate running balance forward from opening (internal moves are net-zero)
  let running = openingBalance;
  for (const entry of combined) {
    if (entry.type === 'transfer_internal') {
      entry.runningBalance = running;
      continue;
    }
    const increasesBalance = entry.type === 'income' || entry.type === 'transfer_in';
    running += increasesBalance ? entry.amount : -entry.amount;
    entry.runningBalance = running;
  }

  // Prepend opening balance as first entry
  if (openingBalance !== 0) {
    combined.unshift({
      id: 0,
      date,
      time: '00:00',
      type: 'opening',
      amount: openingBalance,
      note: 'Opening Balance',
      category: null,
      account: null,
      runningBalance: openingBalance,
    });
  }

  return combined;
}