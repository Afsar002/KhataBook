/** Loads the cash history ledger (all cash entries, newest first) in pages. */
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  getCashTotalBalance,
  listCashLedgerPage,
} from '@/db/cash-book-repo';
import type { LedgerCursor } from '@/db/transaction-repo';
import type { CashBookEntry } from '@/types';

/** Signed effect of one history row on the cash-in-hand balance. */
export function cashHistoryEffect(entry: CashBookEntry): number {
  switch (entry.type) {
    case 'income':
    case 'transfer_in':
      return entry.amount;
    case 'expense':
    case 'transfer_out':
      return -entry.amount;
    case 'transfer_internal':
    case 'opening':
      return 0;
  }
}

/**
 * Cash history: paginated newest-first `CashBookEntry` rows with per-row
 * running balances. Balances walk backward from the all-time cash total
 * (`getCashTotalBalance`), so each card's pill is the cash in hand right
 * after that entry — the same readability-first approach as the khata
 * running-balance walk (O(n) JS, no SQL window function).
 */
export function useCashHistory() {
  const [entries, setEntries] = useState<CashBookEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const cursorRef = useRef<LedgerCursor | null>(null);
  /** Rows currently on screen, oldest-first, used to extend balances on loadMore. */
  const orderedRef = useRef<CashBookEntry[]>([]);
  /** Cash in hand strictly before the oldest loaded row. */
  const beforeOldestRef = useRef(0);

  /** Applies backward-walk balances to `page` given the balance after its newest row. */
  const applyBalances = useCallback((page: CashBookEntry[], afterNewest: number) => {
    let running = afterNewest;
    for (const entry of page) {
      entry.runningBalance = running;
      running -= cashHistoryEffect(entry);
    }
    return running;
  }, []);

  /** Reloads from the newest page (and resets pagination). */
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [total, page] = await Promise.all([getCashTotalBalance(), listCashLedgerPage()]);
      const beforeOldest = applyBalances(page.rows, total);
      orderedRef.current = page.rows;
      beforeOldestRef.current = beforeOldest;
      setEntries(page.rows);
      cursorRef.current = page.nextCursor;
      setHasMore(page.hasMore);
    } finally {
      setLoading(false);
    }
  }, [applyBalances]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Appends the next page of history entries, if there is one. */
  const loadMore = useCallback(async () => {
    if (loadingMore || !cursorRef.current || !hasMore) {
      return;
    }
    setLoadingMore(true);
    try {
      const page = await listCashLedgerPage(cursorRef.current);
      if (page.rows.length === 0) {
        cursorRef.current = page.nextCursor;
        setHasMore(page.hasMore);
        return;
      }
      const beforeOldest = applyBalances(page.rows, beforeOldestRef.current);
      beforeOldestRef.current = beforeOldest;
      orderedRef.current = [...orderedRef.current, ...page.rows];
      setEntries((prev) => {
        const seen = new Set(prev.map((row) => row.id));
        return [...prev, ...page.rows.filter((row) => !seen.has(row.id))];
      });
      cursorRef.current = page.nextCursor;
      setHasMore(page.hasMore);
    } finally {
      setLoadingMore(false);
    }
  }, [applyBalances, loadingMore, hasMore]);

  return { entries, loading, loadingMore, hasMore, refresh, loadMore };
}
