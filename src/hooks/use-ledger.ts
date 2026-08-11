/** Loads the combined ledger feed (income, expense, transfers) in pages. */
import { useCallback, useEffect, useRef, useState } from 'react';

import { listLedgerPage, type LedgerCursor, type LedgerFilter } from '@/db/transaction-repo';
import type { LedgerRow } from '@/types';

/**
 * Loads the combined feed filtered by `filter`. The feed reloads from the
 * newest page whenever the filter VALUE changes (not merely its identity), and
 * pagination resets so `loadMore` never mixes pages from an older query.
 */
export function useLedger(filter?: LedgerFilter) {
  const [entries, setEntries] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const cursorRef = useRef<LedgerCursor | null>(null);
  const requestRef = useRef(0);
  // Holds the filter the current pages were loaded with, so async callbacks
  // never read a stale closure. Synced in the effect below, never in render.
  const filterRef = useRef<LedgerFilter | undefined>(filter);
  // Last filter value actually applied — lets the load effect skip identity-only
  // churn (new object with the same values) without re-querying.
  const lastKeyRef = useRef<string | undefined>(undefined);

  /** Reloads from the newest page (and resets pagination). */
  const refresh = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    const page = await listLedgerPage(filterRef.current);
    if (requestId !== requestRef.current) {
      return; // A newer refresh/loadMore superseded this response.
    }
    setEntries(page.rows);
    cursorRef.current = page.nextCursor;
    setHasMore(page.hasMore);
    setLoading(false);
  }, []);

  /** Appends the next page, if there is one. */
  const loadMore = useCallback(async () => {
    if (loadingMore || !cursorRef.current || !hasMore) {
      return;
    }
    const requestId = requestRef.current;
    setLoadingMore(true);
    try {
      const page = await listLedgerPage(filterRef.current, cursorRef.current);
      if (requestId !== requestRef.current) {
        return; // Filters changed mid-load; drop this stale page.
      }
      setEntries((prev) => {
        const seen = new Set(prev.map((row) => row.id));
        return [...prev, ...page.rows.filter((row) => !seen.has(row.id))];
      });
      cursorRef.current = page.nextCursor;
      setHasMore(page.hasMore);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore]);

  // Reload when the filter VALUE changes. The value-key gate also ignores
  // identity-only churn (recreated object, same values) so a parent re-render
  // that rebuilds the filter doesn't fire a fresh query.
  useEffect(() => {
    filterRef.current = filter;
    const filterKey = JSON.stringify(filter ?? {});
    if (filterKey === lastKeyRef.current) {
      return;
    }
    lastKeyRef.current = filterKey;
    void refresh();
  }, [filter, refresh]);

  return { entries, loading, loadingMore, hasMore, refresh, loadMore };
}
