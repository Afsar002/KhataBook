/** Loads one account with its running balance and paginated ledger history. */
import { useCallback, useEffect, useRef, useState } from 'react';

import { getAccount } from '@/db/account-repo';
import {
  deleteTransaction,
  ledgerDeleteId,
  listAccountLedgerPage,
  type LedgerCursor,
} from '@/db/transaction-repo';
import { deleteTransfer } from '@/db/transfer-repo';
import type { AccountBalance, LedgerRow } from '@/types';

export function useAccount(accountId: number) {
  const [account, setAccount] = useState<AccountBalance | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const cursorRef = useRef<LedgerCursor | null>(null);

  /** Reloads the account and its newest page of entries. */
  const refresh = useCallback(async () => {
    const [acc, page] = await Promise.all([
      getAccount(accountId),
      listAccountLedgerPage(accountId),
    ]);
    setAccount(acc);
    // The ledger includes Opening Balance entries (kind = 'opening') — they
    // are the first transaction, so they show up here exactly as recorded.
    setLedger(page.rows);
    cursorRef.current = page.nextCursor;
    setHasMore(page.hasMore);
  }, [accountId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Appends the next page of entries, if there is one. */
  const loadMore = useCallback(async () => {
    if (loadingMore || !cursorRef.current || !hasMore) {
      return;
    }
    setLoadingMore(true);
    try {
      const page = await listAccountLedgerPage(accountId, cursorRef.current);
      setLedger((prev) => {
        const seen = new Set(prev.map((row) => row.id));
        return [...prev, ...page.rows.filter((row) => !seen.has(row.id))];
      });
      cursorRef.current = page.nextCursor;
      setHasMore(page.hasMore);
    } finally {
      setLoadingMore(false);
    }
  }, [accountId, loadingMore, hasMore]);

  /** Deletes one ledger entry (income/expense or transfer) and refreshes the balance. */
  const removeEntry = useCallback(
    async (row: LedgerRow) => {
      if (row.entryKind === 'opening') {
        // Opening Balance entries are immutable. The dedicated flow edits
        // the opening balance itself; a normal delete must never touch it.
        return;
      }
      const id = ledgerDeleteId(row);
      if (row.kind === 'transfer') {
        await deleteTransfer(id);
      } else {
        await deleteTransaction(id);
      }
      setLedger((prev) => prev.filter((r) => r.id !== row.id));
      setAccount(await getAccount(accountId));
    },
    [accountId]
  );

  return { account, ledger, hasMore, loadMore, loadingMore, refresh, removeEntry };
}