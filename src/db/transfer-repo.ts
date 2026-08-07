/** Transfer queries (money moved between accounts). */
import { getDatabase, nowIso } from '@/db/database';
import { enqueueChange } from '@/db/sync/queue-repo';
import { getCurrentUserId } from '@/services/supabase/auth';
import type { NewTransfer, TransferRow } from '@/types';
import { uuid } from '@/utils/uuid';

export async function addTransfer(tx: NewTransfer): Promise<number> {
  if (tx.fromAccountId === tx.toAccountId) {
    throw new Error('From and To accounts must be different.');
  }
  if (!(tx.amount > 0)) {
    throw new Error('Amount must be greater than zero.');
  }
  const db = getDatabase();
  const recordUuid = uuid();
  const now = nowIso();
  const userId = getCurrentUserId();
  const result = await db.runAsync(
    'INSERT INTO transfers (uuid, user_id, updated_at, from_account_id, to_account_id, amount, note, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    recordUuid,
    userId,
    now,
    tx.fromAccountId,
    tx.toAccountId,
    tx.amount,
    tx.note,
    tx.date
  );
  await enqueueChange(db, {
    table: 'transfers',
    operation: 'insert',
    recordUuid,
    payload: { fromAccountId: tx.fromAccountId, toAccountId: tx.toAccountId, amount: tx.amount },
  });
  return result.lastInsertRowId;
}

/** Loads a single transfer (joined with both account names) for editing. */
export async function getTransfer(id: number): Promise<TransferRow | null> {
  const db = getDatabase();
  return db.getFirstAsync<TransferRow>(
    `
    SELECT
      tr.id,
      tr.from_account_id AS fromAccountId,
      tr.to_account_id AS toAccountId,
      tr.amount,
      tr.note,
      tr.date,
      tr.created_at AS createdAt,
      fa.name AS fromAccountName,
      fa.type AS fromAccountType,
      ta.name AS toAccountName,
      ta.type AS toAccountType
    FROM transfers tr
    JOIN accounts fa ON fa.id = tr.from_account_id
    JOIN accounts ta ON ta.id = tr.to_account_id
    WHERE tr.id = ?
    `,
    id
  );
}

export async function updateTransfer(id: number, input: NewTransfer): Promise<void> {
  if (input.fromAccountId === input.toAccountId) {
    throw new Error('From and To accounts must be different.');
  }
  if (!(input.amount > 0)) {
    throw new Error('Amount must be greater than zero.');
  }
  const db = getDatabase();
  await db.withTransactionAsync(async () => {
    const row = await db.getFirstAsync<{ uuid: string }>(
      'SELECT uuid FROM transfers WHERE id = ?',
      id
    );
    await db.runAsync(
      'UPDATE transfers SET updated_at = ?, from_account_id = ?, to_account_id = ?, amount = ?, note = ?, date = ? WHERE id = ?',
      nowIso(),
      input.fromAccountId,
      input.toAccountId,
      input.amount,
      input.note,
      input.date,
      id
    );
    if (row?.uuid) {
      await enqueueChange(db, {
        table: 'transfers',
        operation: 'update',
        recordUuid: row.uuid,
      });
    }
  });
}

export async function deleteTransfer(id: number): Promise<void> {
  const db = getDatabase();
  await db.withTransactionAsync(async () => {
    const row = await db.getFirstAsync<{ uuid: string }>(
      'SELECT uuid FROM transfers WHERE id = ?',
      id
    );
    await db.runAsync('DELETE FROM transfers WHERE id = ?', id);
    if (row?.uuid) {
      await enqueueChange(db, { table: 'transfers', operation: 'delete', recordUuid: row.uuid });
    }
  });
}

export async function listTransfers(): Promise<TransferRow[]> {
  const db = getDatabase();
  return db.getAllAsync<TransferRow>(
    `
    SELECT
      tr.id,
      tr.from_account_id AS fromAccountId,
      tr.to_account_id AS toAccountId,
      tr.amount,
      tr.note,
      tr.date,
      tr.created_at AS createdAt,
      fa.name AS fromAccountName,
      fa.type AS fromAccountType,
      ta.name AS toAccountName,
      ta.type AS toAccountType
    FROM transfers tr
    JOIN accounts fa ON fa.id = tr.from_account_id
    JOIN accounts ta ON ta.id = tr.to_account_id
    ORDER BY tr.date DESC, tr.id DESC
    `
  );
}
