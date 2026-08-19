/** Category queries and CRUD (add / rename / delete). */
import { getDatabase, nowIso } from '@/db/database';
import { enqueueChange } from '@/db/sync/queue';
import { getCurrentUserId } from '@/services/supabase/auth';
import type { Category, TransactionType } from '@/types';
import { uuid } from '@/utils/uuid';

export interface NewCategory {
  name: string;
  type: TransactionType;
  icon: string;
}

export async function listCategories(type?: TransactionType): Promise<Category[]> {
  const db = getDatabase();
  if (type) {
    return db.getAllAsync<Category>(
      'SELECT id, name, type, icon, sort_order AS sortOrder FROM categories WHERE type = ? ORDER BY sort_order, id',
      type
    );
  }
  return db.getAllAsync<Category>(
    'SELECT id, name, type, icon, sort_order AS sortOrder FROM categories ORDER BY type, sort_order, id'
  );
}

/** All categories (income + expense), for the management screen. */
export async function listAllCategories(): Promise<Category[]> {
  const db = getDatabase();
  return db.getAllAsync<Category>(
    'SELECT id, name, type, icon, sort_order AS sortOrder FROM categories ORDER BY type, sort_order, id'
  );
}

export async function addCategory(input: NewCategory): Promise<number> {
  const db = getDatabase();
  const name = input.name.trim();
  const orderRow = await db.getFirstAsync<{ next: number }>(
    'SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM categories WHERE type = ?',
    input.type
  );
  const recordUuid = uuid();
  const now = nowIso();
  const userId = getCurrentUserId();
  const result = await db.runAsync(
    'INSERT INTO categories (uuid, user_id, updated_at, name, type, icon, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
    recordUuid,
    userId,
    now,
    name,
    input.type,
    input.icon,
    orderRow?.next ?? 0
  );
  await enqueueChange(db, {
    table: 'categories',
    operation: 'insert',
    recordUuid,
    payload: { name, type: input.type, icon: input.icon },
  });
  return result.lastInsertRowId;
}

export async function updateCategory(
  id: number,
  input: { name: string; icon: string }
): Promise<void> {
  const db = getDatabase();
  const name = input.name.trim();
  await db.withTransactionAsync(async () => {
    const row = await db.getFirstAsync<{ uuid: string }>(
      'SELECT uuid FROM categories WHERE id = ?',
      id
    );
    await db.runAsync(
      'UPDATE categories SET name = ?, icon = ?, updated_at = ? WHERE id = ?',
      name,
      input.icon,
      nowIso(),
      id
    );
    if (row?.uuid) {
      await enqueueChange(db, {
        table: 'categories',
        operation: 'update',
        recordUuid: row.uuid,
        payload: { name, icon: input.icon },
      });
    }
  });
}

/**
 * Deletes a category. Transactions that used it keep their entries (their
 * `category_id` is nulled by the `ON DELETE SET NULL` foreign key).
 */
export async function deleteCategory(id: number): Promise<void> {
  const db = getDatabase();
  await db.withTransactionAsync(async () => {
    const row = await db.getFirstAsync<{ uuid: string }>(
      'SELECT uuid FROM categories WHERE id = ?',
      id
    );
    await db.runAsync('DELETE FROM categories WHERE id = ?', id);
    if (row?.uuid) {
      await enqueueChange(db, {
        table: 'categories',
        operation: 'delete',
        recordUuid: row.uuid,
      });
    }
  });
}
