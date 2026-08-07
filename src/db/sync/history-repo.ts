/**
 * Local sync history log (`sync_history` table). Records human-readable sync
 * events — most importantly LWW conflicts where a newer cloud row overwrote a
 * local edit that hadn't been uploaded yet — so the user can see what the
 * engine silently resolved. Device-local, never synced.
 */
import { getDatabase } from '@/db/database';
import type { SyncHistoryEntry } from '@/types';

export type SyncEventType = 'info' | 'conflict';

/** Appends an event to the log. */
export async function addSyncEvent(eventType: SyncEventType, message: string): Promise<void> {
  const db = getDatabase();
  await db.runAsync(
    'INSERT INTO sync_history (event_type, message, created_at) VALUES (?, ?, ?)',
    eventType,
    message,
    new Date().toISOString()
  );
}

/** Most recent events first, capped at `limit`. */
export async function listSyncEvents(limit = 20): Promise<SyncHistoryEntry[]> {
  const db = getDatabase();
  return db.getAllAsync<SyncHistoryEntry>(
    `SELECT id, event_type AS eventType, message, created_at AS createdAt
     FROM sync_history
     ORDER BY created_at DESC, id DESC
     LIMIT ?`,
    limit
  );
}

/** Wipes the log (kept tiny; the "Sync History" view can offer this). */
export async function clearSyncHistory(): Promise<void> {
  const db = getDatabase();
  await db.runAsync('DELETE FROM sync_history');
}
