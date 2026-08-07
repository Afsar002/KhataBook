/** Key/value app settings stored in SQLite. */
import { getDatabase, nowIso } from '@/db/database';
import { enqueueChange } from '@/db/sync/queue-repo';
import { getCurrentUserId } from '@/services/supabase/auth';
import { uuid } from '@/utils/uuid';

export async function getSetting(key: string): Promise<string | null> {
  const db = getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    key
  );
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = getDatabase();
  const now = nowIso();
  await db.withTransactionAsync(async () => {
    const existing = await db.getFirstAsync<{ uuid: string | null }>(
      'SELECT uuid FROM settings WHERE key = ?',
      key
    );
    if (existing?.uuid) {
      await db.runAsync(
        'UPDATE settings SET value = ?, updated_at = ? WHERE key = ?',
        value,
        now,
        key
      );
      await enqueueChange(db, {
        table: 'settings',
        operation: 'update',
        recordUuid: existing.uuid,
        payload: { value },
      });
    } else {
      // INSERT OR REPLACE would reset the uuid on every write; insert only on first.
      const recordUuid = uuid();
      await db.runAsync(
        'INSERT INTO settings (uuid, user_id, updated_at, key, value) VALUES (?, ?, ?, ?, ?)',
        recordUuid,
        getCurrentUserId(),
        now,
        key,
        value
      );
      await enqueueChange(db, {
        table: 'settings',
        operation: 'insert',
        recordUuid,
        payload: { value },
      });
    }
  });
}
