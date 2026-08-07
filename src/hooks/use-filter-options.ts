/**
 * Loads the option lists the History advanced filters need: all accounts and
 * all (income + expense) categories.
 */
import { useCallback, useEffect, useState } from 'react';

import { listAccounts } from '@/db/account-repo';
import { listCategories } from '@/db/category-repo';
import type { Account, Category } from '@/types';

export function useFilterOptions() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const refresh = useCallback(async () => {
    const [acct, income, expense] = await Promise.all([
      listAccounts(),
      listCategories('income'),
      listCategories('expense'),
    ]);
    setAccounts(acct);
    setCategories([...income, ...expense]);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { accounts, categories, refresh };
}
