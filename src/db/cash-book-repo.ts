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
import type { CashBook } from '@/types';

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

/**
 * Cash book entry with running balance (for detailed view like khata).
 */
export interface CashBookEntry {
  id: number;
  date: string;
  time: string;
  type: 'income' | 'expense' | 'transfer_in' | 'transfer_out' | 'opening';
  amount: number;
  note: string | null;
  category: string | null;
  account: string | null;
  runningBalance: number;
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

  // Get all transfers for this day
  const transfers = await db.getAllAsync<{
    id: number;
    date: string;
    time: string;
    amount: number;
    note: string | null;
    from_account: string | null;
    to_account: string | null;
  }>(
    `
    SELECT
      tr.id,
      tr.date,
      tr.time,
      tr.amount,
      tr.note,
      fa.name AS from_account,
      ta.name AS to_account
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
    const isIncome = t.type === 'income';
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
    const isTransferIn = tr.to_account && !tr.from_account?.includes('cash'); // simplified
    const fromCash = tr.from_account?.toLowerCase().includes('cash');
    const toCash = tr.to_account?.toLowerCase().includes('cash');

    // Only include transfers where cash account is involved
    if (fromCash || toCash) {
      combined.push({
        id: tr.id,
        date: tr.date,
        time: tr.time,
        type: toCash ? 'transfer_in' : 'transfer_out',
        amount: tr.amount,
        note: tr.note,
        category: null,
        account: toCash ? tr.from_account : tr.to_account,
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

  // Calculate running balance forward from opening
  let running = openingBalance;
  for (const entry of combined) {
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