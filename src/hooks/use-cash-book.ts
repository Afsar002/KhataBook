/** Loads the cash book for a given day and persists the counted amount. */
import { useCallback, useEffect, useState } from 'react';

import {
  clearCashCount,
  getCashBook,
  getCashBookEntries,
  setCashCount,
} from '@/db/cash-book-repo';
import type { CashBook, CashBookEntry } from '@/types';

export function useCashBook(date: string) {
  const [book, setBook] = useState<CashBook | null>(null);
  const [entries, setEntries] = useState<CashBookEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextBook, nextEntries] = await Promise.all([
        getCashBook(date),
        getCashBookEntries(date),
      ]);
      setBook(nextBook);
      setEntries(nextEntries);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveCount = useCallback(
    async (actual: number) => {
      await setCashCount(date, actual);
      await refresh();
    },
    [date, refresh]
  );

  const clearCount = useCallback(async () => {
    await clearCashCount(date);
    await refresh();
  }, [date, refresh]);

  return { book, entries, loading, error, refresh, saveCount, clearCount };
}
