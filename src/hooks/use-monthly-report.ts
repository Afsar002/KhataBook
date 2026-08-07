/** Loads the monthly report (summary + category breakdowns). */
import { useCallback, useEffect, useState } from 'react';

import { getCategoryBreakdown, getMonthSummary } from '@/db/transaction-repo';
import { getMonthPartyTotals } from '@/db/party-repo';
import type { MonthReport } from '@/types';

const EMPTY: MonthReport = {
  summary: { income: 0, expense: 0 },
  expenses: [],
  incomes: [],
  party: { given: 0, received: 0 },
};

export function useMonthlyReport(yearMonth: string) {
  const [report, setReport] = useState<MonthReport>(EMPTY);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [summary, expenses, incomes, party] = await Promise.all([
      getMonthSummary(yearMonth),
      getCategoryBreakdown(yearMonth, 'expense'),
      getCategoryBreakdown(yearMonth, 'income'),
      getMonthPartyTotals(yearMonth),
    ]);
    setReport({ summary, expenses, incomes, party });
    setLoading(false);
  }, [yearMonth]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { report, loading, refresh };
}
