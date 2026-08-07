/**
 * Device-local sync state (`sync_meta` table). Never uploaded — it tracks
 * per-table pull cursors, the last successful sync, the current user, and
 * the auto-sync preference.
 */
import { getDatabase } from '@/db/database';

export const LAST_SYNC_KEY = 'last_sync_at';
export const LAST_SUCCESS_KEY = 'last_success_at';
export const AUTO_SYNC_KEY = 'auto_sync';
export const WIFI_ONLY_KEY = 'sync_wifi_only';
export const SYNC_INTERVAL_KEY = 'sync_interval_minutes';
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

/**
 * Wi-Fi-only preference: when on, auto-sync defers until the device is on Wi-Fi
 * (manual "Sync Now" always runs). Off by default.
 */
export async function getWifiOnlySync(): Promise<boolean> {
  const value = await getMeta(WIFI_ONLY_KEY);
  return value === '1';
}

export async function setWifiOnlySync(enabled: boolean): Promise<void> {
  await setMeta(WIFI_ONLY_KEY, enabled ? '1' : '0');
}

/** Periodic auto-sync interval in minutes; 0 = off (event-driven only). */
export async function getSyncIntervalMinutes(): Promise<number> {
  const value = await getMeta(SYNC_INTERVAL_KEY);
  if (value === null) {
    return 0;
  }
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) || parsed < 0 ? 0 : parsed;
}

export async function setSyncIntervalMinutes(minutes: number): Promise<void> {
  await setMeta(SYNC_INTERVAL_KEY, String(Math.max(0, Math.floor(minutes))));
}

/** Clears all sync state so the next pull is a full download. */
export async function resetSyncMeta(): Promise<void> {
  const db = getDatabase();
  await db.runAsync('DELETE FROM sync_meta');
}
