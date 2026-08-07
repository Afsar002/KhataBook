/** Loads income/expense totals for a given day. */
import { useCallback, useEffect, useState } from 'react';

import { getDaySummary } from '@/db/transaction-repo';
import type { DaySummary } from '@/types';

export function useDaySummary(date: string) {
  const [summary, setSummary] = useState<DaySummary>({ income: 0, expense: 0 });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const next = await getDaySummary(date);
    setSummary(next);
    setLoading(false);
  }, [date]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { summary, loading, refresh };
}
