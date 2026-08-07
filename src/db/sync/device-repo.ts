/**
 * Device repo for `sync_devices` table — tracks all devices that have
 * successfully synced. Device-local, never synced.
 */
import { getDatabase, nowIso } from '@/db/database';
import type { SyncDevice } from '@/types';

/** Records a successful sync by this device (upserts by device_name). */
export async function recordDeviceSync(deviceName: string): Promise<void> {
  const db = getDatabase();
  const now = nowIso();
  await db.runAsync(
    `INSERT INTO sync_devices (device_name, last_sync_at)
     VALUES (?, ?)
     ON CONFLICT(device_name) DO UPDATE SET last_sync_at = excluded.last_sync_at`,
    deviceName,
    now
  );
}

/** Lists all devices that have synced, most recent first. */
export async function listSyncedDevices(): Promise<SyncDevice[]> {
  const db = getDatabase();
  return db.getAllAsync<SyncDevice>(
    `SELECT id, device_name AS deviceName, last_sync_at AS lastSyncAt, first_seen_at AS firstSeenAt
     FROM sync_devices
     ORDER BY last_sync_at DESC`
  );
}

/** Returns the number of unique devices that have synced. */
export async function countSyncedDevices(): Promise<number> {
  const db = getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM sync_devices'
  );
  return row?.count ?? 0;
}