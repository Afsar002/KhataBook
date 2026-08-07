/**
 * Device-local sync state (`sync_meta` table). Never uploaded — it tracks
 * per-table pull cursors, the last successful sync, the current user, and
 * the auto-sync preference.
 */
import { getDatabase } from '@/db/database';

export const LAST_SYNC_KEY = 'last_sync_at';
export const LAST_SUCCESS_KEY = 'last_success_at';
export const AUTO_SYNC_KEY = 'auto_sync';
export const CURRENT_USER_KEY = 'current_user_id';

/** Pull cursor key for a table: rows with `updated_at > cursor` are fetched. */
export const cursorKey = (table: string): string => `last_pulled_${table}`;

export async function getMeta(key: string): Promise<string | null> {
  const db = getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM sync_meta WHERE key = ?',
    key
  );
  return row?.value ?? null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  const db = getDatabase();
  await db.runAsync(
    'INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)',
    key,
    value
  );
}

export async function getAutoSync(): Promise<boolean> {
  const value = await getMeta(AUTO_SYNC_KEY);
  return value === null ? true : value === '1';
}

export async function setAutoSync(enabled: boolean): Promise<void> {
  await setMeta(AUTO_SYNC_KEY, enabled ? '1' : '0');
}

/** Clears all sync state so the next pull is a full download. */
export async function resetSyncMeta(): Promise<void> {
  const db = getDatabase();
  await db.runAsync('DELETE FROM sync_meta');
}
