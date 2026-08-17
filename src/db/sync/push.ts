/**
 * Pushes the local sync queue to Supabase.
 *
 * Insert/update operations are upserted on the record uuid; deletes become
 * soft-delete tombstones (`deleted_at`), so a deletion propagates to other
 * devices without destroying the row (last-write-wins can resurrect it if a
 * newer edit arrives). Every upload stamps the row with the signed-in user's
 * id, which is what row-level security checks.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import { MAX_RETRY_COUNT, listPendingChanges, markDone, markFailed } from '@/db/sync/queue-repo';
import { readRowForPush } from '@/db/sync/tables';

export interface PushResult {
  pushed: number;
  deleted: number;
  failed: number;
  /** True when auth failed (expired/revoked token) and push must stop. */
  authError: boolean;
}

function isAuthError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('JWT') || message.includes('401') || message.includes('Auth session missing');
}

/** Returns the push order position so parents upload before children. */
function tablePriority(table: string): number {
  const order = [
    'accounts',
    'categories',
    'parties',
    'transactions',
    'transfers',
    'party_transactions',
    'settings',
  ];
  const index = order.indexOf(table);
  return index === -1 ? order.length : index;
}

export async function pushPendingChanges(
  supabase: SupabaseClient,
  userId: string
): Promise<PushResult> {
  const result: PushResult = { pushed: 0, deleted: 0, failed: 0, authError: false };
  const pending = await listPendingChanges();

  // Parents first so cloud foreign keys resolve on the first attempt.
  const ordered = [...pending].sort(
    (a, b) => tablePriority(a.tableName) - tablePriority(b.tableName)
  );

  for (const entry of ordered) {
    if (entry.retryCount >= MAX_RETRY_COUNT) {
      continue; // parked; a manual Sync Now will retry
    }

    try {
      if (entry.operation === 'delete') {
        await deleteRemote(supabase, entry.tableName, entry.recordUuid);
        result.deleted += 1;
      } else {
        const row = await readRowForPush(entry.tableName, entry.recordUuid);
        if (!row) {
          // Local row is already gone — treat the queued op as a tombstone.
          await deleteRemote(supabase, entry.tableName, entry.recordUuid);
          result.deleted += 1;
        } else {
          const payload = {
            ...row,
            user_id: userId,
          };
          const { error } = await supabase
            .from(entry.tableName)
            .upsert(payload, { onConflict: 'id' });
          if (error) {
            throw error;
          }
          result.pushed += 1;
        }
      }
      await markDone(entry.id);
    } catch (error) {
      if (isAuthError(error)) {
        result.authError = true;
        return result; // stop — the session needs refreshing/re-auth
      }
      // Log the actual error for debugging
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`[Sync Push Failed] table=${entry.tableName} uuid=${entry.recordUuid} error=${errMsg}`);
      result.failed += 1;
      await markFailed(entry.id, entry.retryCount + 1);
    }
  }

  return result;
}

/** Soft-deletes a cloud row (idempotent — missing rows are already gone). */
async function deleteRemote(
  supabase: SupabaseClient,
  table: string,
  recordUuid: string
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from(table)
    .update({ deleted_at: now, updated_at: now })
    .eq('id', recordUuid);
  if (error) {
    throw error;
  }
}
