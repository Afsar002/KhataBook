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