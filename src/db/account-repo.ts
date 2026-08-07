/** Account queries. */
import { getDatabase, nowIso } from '@/db/database';
import { enqueueChange } from '@/db/sync/queue-repo';
import { getCurrentUserId } from '@/services/supabase/auth';
import type { Account, AccountBalance, AccountType } from '@/types';
import { likeParam, SEARCH_LIMIT } from '@/utils/search';
import { uuid } from '@/utils/uuid';

export interface NewAccount {
  name: string;
  type: AccountType;
  openingBalance?: number;
}

export async function listAccounts(): Promise<Account[]> {
  const db = getDatabase();
  return db.getAllAsync<Account>(
    'SELECT id, name, type, opening_balance AS openingBalance, sort_order AS sortOrder FROM accounts ORDER BY sort_order, id'
  );
}

/**
 * Running balance per account, derived entirely from the ledger.
 *
 * The Opening Balance is the first ledger entry (kind = 'opening'), so the
 * balance is simply: income − expense + transfers in − transfers out.
 * There is no separate `opening_balance` addition — the ledger is the single
 * source of truth.
 */
const BALANCE_SQL = `
  COALESCE(
    (SELECT SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE -t.amount END)
     FROM transactions t WHERE t.account_id = a.id),
    0
  )
  + COALESCE(
      (SELECT SUM(amount) FROM transfers tr WHERE tr.to_account_id = a.id),
      0
    )
  - COALESCE(
      (SELECT SUM(amount) FROM transfers tr WHERE tr.from_account_id = a.id),
      0
    )
`;

/** One account with its running balance, or null when it doesn't exist. */
export async function getAccount(id: number): Promise<AccountBalance | null> {
  const db = getDatabase();
  return db.getFirstAsync<AccountBalance>(
    `
    SELECT
      a.id,
      a.name,
      a.type,
      a.sort_order AS sortOrder,
      a.opening_balance AS openingBalance,
      ${BALANCE_SQL} AS balance
    FROM accounts a
    WHERE a.id = ?
    `,
    id
  );
}

export async function getAccountBalances(): Promise<AccountBalance[]> {
  const db = getDatabase();
  return db.getAllAsync<AccountBalance>(`
    SELECT
      a.id,
      a.name,
      a.type,
      a.sort_order AS sortOrder,
      a.opening_balance AS openingBalance,
      ${BALANCE_SQL} AS balance
    FROM accounts a
    ORDER BY a.sort_order, a.id
  `);
}

/** Accounts whose name matches the query, with running balances. */
export async function searchAccounts(query: string, limit = SEARCH_LIMIT): Promise<AccountBalance[]> {
  const db = getDatabase();
  const q = query.trim();
  if (!q) {
    return [];
  }
  const like = likeParam(q);
  return db.getAllAsync<AccountBalance>(
    `
    SELECT
      a.id,
      a.name,
      a.type,
      a.sort_order AS sortOrder,
      a.opening_balance AS openingBalance,
      ${BALANCE_SQL} AS balance
    FROM accounts a
    WHERE a.name LIKE ? ESCAPE '\\'
    ORDER BY a.sort_order, a.id
    LIMIT ${limit}
    `,
    like
  );
}

/**
 * Creates an account and, when it has an opening balance, an immutable
 * "Opening Balance" ledger entry timestamped as the earliest transaction.
 */
export async function addAccount(input: NewAccount): Promise<number> {
  const db = getDatabase();
  const orderRow = await db.getFirstAsync<{ next: number }>(
    'SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM accounts'
  );
  const recordUuid = uuid();
  const now = nowIso();
  const userId = getCurrentUserId();
  const openingBalance = input.openingBalance || 0;

  let accountId = 0;
  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      'INSERT INTO accounts (uuid, user_id, updated_at, name, type, opening_balance, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
      recordUuid,
      userId,
      now,
      input.name.trim(),
      input.type,
      openingBalance,
      orderRow?.next ?? 1
    );
    accountId = result.lastInsertRowId;

    // Opening Balance is the very first ledger entry.
    if (openingBalance !== 0) {
      const entryUuid = uuid();
      const openingDate = now.slice(0, 10);
      await db.runAsync(
        `INSERT INTO transactions
          (uuid, user_id, updated_at, type, amount, account_id, category_id, note, date, kind, created_at)
         VALUES (?, ?, ?, 'income', ?, ?, NULL, 'Opening Balance', ?, 'opening', ?)`,
        entryUuid,
        userId,
        now,
        openingBalance,
        accountId,
        openingDate,
        now
      );
      await enqueueChange(db, {
        table: 'transactions',
        operation: 'insert',
        recordUuid: entryUuid,
        payload: { type: 'income', amount: openingBalance, kind: 'opening' },
      });
    }
  });

  await enqueueChange(db, {
    table: 'accounts',
    operation: 'insert',
    recordUuid,
    payload: { name: input.name.trim(), type: input.type },
  });
  return accountId;
}

export async function renameAccount(id: number, name: string): Promise<void> {
  const db = getDatabase();
  const trimmed = name.trim();
  await db.withTransactionAsync(async () => {
    const row = await db.getFirstAsync<{ uuid: string }>(
      'SELECT uuid FROM accounts WHERE id = ?',
      id
    );
    await db.runAsync(
      'UPDATE accounts SET name = ?, updated_at = ? WHERE id = ?',
      trimmed,
      nowIso(),
      id
    );
    if (row?.uuid) {
      await enqueueChange(db, { table: 'accounts', operation: 'update', recordUuid: row.uuid });
    }
  });
}

/** Deletes an account, but only when it has no entries (income/expense/transfers). */
export async function deleteAccount(id: number): Promise<boolean> {
  const db = getDatabase();
  const inUse = await db.getFirstAsync<{ count: number }>(
    `SELECT
       (SELECT COUNT(*) FROM transactions WHERE account_id = ?) +
       (SELECT COUNT(*) FROM transfers WHERE from_account_id = ? OR to_account_id = ?)
     AS count`,
    id,
    id,
    id
  );
  if (inUse && inUse.count > 0) {
    return false;
  }
  await db.withTransactionAsync(async () => {
    const row = await db.getFirstAsync<{ uuid: string }>(
      'SELECT uuid FROM accounts WHERE id = ?',
      id
    );
    await db.runAsync('DELETE FROM accounts WHERE id = ?', id);
    if (row?.uuid) {
      await enqueueChange(db, { table: 'accounts', operation: 'delete', recordUuid: row.uuid });
    }
  });
  return true;
}