/**
 * App metadata service — reads global configuration from the cloud `app_meta` table.
 *
 * Used for:
 *  - Minimum version enforcement: block cloud sync when app version < min_version
 *  - Data-migration prompts: warn when restoring backups from very old versions
 *
 * The table has a single row (id=1) managed via Supabase dashboard/SQL.
 */
import { getSupabaseClient } from '@/services/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface AppMeta {
  min_version: string;
  notice: string | null;
  migrate_from: string[];
  migrate_notice: string | null;
}

/**
 * Fetches the app_meta row (id=1). Returns defaults if the table doesn't exist,
 * RLS blocks it, or the row is missing — the app should continue working in
 * those cases (fail-open for min_version enforcement).
 */
export async function fetchAppMeta(
  getClient: () => SupabaseClient | null = getSupabaseClient
): Promise<AppMeta> {
  const supabase = getClient();
  if (!supabase) {
    return defaultMeta();
  }
  try {
    const { data, error } = await supabase
      .from('app_meta')
      .select('min_version, notice, migrate_from, migrate_notice')
      .eq('id', 1)
      .single();
    if (error) {
      console.warn('[app-meta] fetch failed:', error.message);
      return defaultMeta();
    }
    if (!data) {
      return defaultMeta();
    }
    return {
      min_version: data.min_version ?? '1.0.0',
      notice: data.notice ?? null,
      migrate_from: Array.isArray(data.migrate_from) ? data.migrate_from : [],
      migrate_notice: data.migrate_notice ?? null,
    };
  } catch (e) {
    console.warn('[app-meta] unexpected error:', e);
    return defaultMeta();
  }
}

/** Compares two semver strings (e.g. '1.12.0' vs '1.11.0'). Returns true if a >= b. */
export function versionSatisfies(current: string, required: string): boolean {
  const parse = (v: string) => v.split('.').map((n) => parseInt(n, 10) || 0);
  const [ca, cb, cc] = parse(current);
  const [ra, rb, rc] = parse(required);
  if (ca !== ra) return ca > ra;
  if (cb !== rb) return cb > rb;
  return cc >= rc;
}

function defaultMeta(): AppMeta {
  return {
    min_version: '1.0.0',
    notice: null,
    migrate_from: [],
    migrate_notice: null,
  };
}