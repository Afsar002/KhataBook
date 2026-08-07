/** Loads accounts and their running balances; exposes CRUD helpers. */
import { useCallback, useEffect, useState } from 'react';

import {
  addAccount as insertAccount,
  deleteAccount as removeAccount,
  getAccountBalances,
  listAccounts,
  renameAccount as renameAccountRow,
  type NewAccount,
} from '@/db/account-repo';
import type { Account, AccountBalance } from '@/types';

export function useAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [balances, setBalances] = useState<AccountBalance[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [accountRows, balanceRows] = await Promise.all([
      listAccounts(),
      getAccountBalances(),
    ]);
    setAccounts(accountRows);
    setBalances(balanceRows);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const add = useCallback(
    async (account: NewAccount) => {
      const id = await insertAccount(account);
      await refresh();
      return id;
    },
    [refresh]
  );

  const rename = useCallback(
    async (id: number, name: string) => {
      await renameAccountRow(id, name);
      await refresh();
    },
    [refresh]
  );

  const remove = useCallback(
    async (id: number): Promise<boolean> => {
      const ok = await removeAccount(id);
      if (ok) {
        await refresh();
      }
      return ok;
    },
    [refresh]
  );

  return { accounts, balances, loading, refresh, add, rename, remove };
}
