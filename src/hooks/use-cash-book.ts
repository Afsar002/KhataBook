/** Loads the cash book for a given day and persists the counted amount. */
import { useCallback, useEffect, useState } from 'react';

import {
  clearCashCount,
  getCashBook,
  setCashCount,
} from '@/db/cash-book-repo';
import type { CashBook } from '@/types';

export function useCashBook(date: string) {
  const [book, setBook] = useState<CashBook | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const next = await getCashBook(date);
    setBook(next);
    setLoading(false);
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

  return { book, loading, refresh, saveCount, clearCount };
}
