/** Loads categories for a transaction type. */
import { useCallback, useEffect, useState } from 'react';

import { listCategories } from '@/db/category-repo';
import type { Category, TransactionType } from '@/types';

export function useCategories(type?: TransactionType) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const rows = await listCategories(type);
    setCategories(rows);
    setLoading(false);
  }, [type]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { categories, loading, refresh };
}
