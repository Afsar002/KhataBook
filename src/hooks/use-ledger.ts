/** Loads the combined ledger feed (income, expense, transfers) in pages. */
import { useCallback, useEffect, useRef, useState } from 'react';

import { listLedgerPage, type LedgerCursor } from '@/db/transaction-repo';
import type { LedgerRow } from '@/types';

export function useLedger() {
  const [entries, setEntries] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const cursorRef = useRef<LedgerCursor | null>(null);

  /** Reloads from the newest page. */
  const refresh = useCallback(async () => {
    setLoading(true);
    const page = await listLedgerPage();
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
    setLoadingMore(true);
    try {
      const page = await listLedgerPage(cursorRef.current);
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

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { entries, loading, loadingMore, hasMore, refresh, loadMore };
}
