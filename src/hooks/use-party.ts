/** Loads a single party with its balance and paginated ledger history. */
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  addPartyTransaction,
  deletePartyTransaction,
  getParty,
  getPartyBalance,
  listPartyLedgerPage,
  updatePartyTransaction,
} from '@/db/party-repo';
import type { LedgerCursor } from '@/db/transaction-repo';
import type { NewPartyTransaction, Party, PartyTransaction } from '@/types';

export function useParty(id: number) {
  const [party, setParty] = useState<Party | null>(null);
  const [balance, setBalance] = useState(0);
  const [ledger, setLedger] = useState<PartyTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const cursorRef = useRef<LedgerCursor | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [partyRow, balanceRow, page] = await Promise.all([
      getParty(id),
      getPartyBalance(id),
      listPartyLedgerPage(id),
    ]);
    setParty(partyRow);
    setBalance(balanceRow?.balance ?? 0);
    // The ledger includes the Opening Balance entry (kind = 'opening') as the
    // very first transaction — it is already part of the balance calculation.
    setLedger(page.rows);
    cursorRef.current = page.nextCursor;
    setHasMore(page.hasMore);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Appends the next page of khata entries, if there is one. */
  const loadMore = useCallback(async () => {
    if (loadingMore || !cursorRef.current || !hasMore) {
      return;
    }
    setLoadingMore(true);
    try {
      const page = await listPartyLedgerPage(id, cursorRef.current);
      setLedger((prev) => {
        const seen = new Set(prev.map((row) => row.id));
        return [...prev, ...page.rows.filter((row) => !seen.has(row.id))];
      });
      cursorRef.current = page.nextCursor;
      setHasMore(page.hasMore);
    } finally {
      setLoadingMore(false);
    }
  }, [id, loadingMore, hasMore]);

  const addEntry = useCallback(
    async (tx: NewPartyTransaction) => {
      await addPartyTransaction(tx);
      await refresh();
    },
    [refresh]
  );

  const removeEntry = useCallback(
    async (entryId: number) => {
      await deletePartyTransaction(entryId);
      await refresh();
    },
    [refresh]
  );

  const updateEntry = useCallback(
    async (entryId: number, tx: NewPartyTransaction) => {
      await updatePartyTransaction(entryId, tx);
      await refresh();
    },
    [refresh]
  );

  return {
    party,
    balance,
    ledger,
    loading,
    hasMore,
    loadingMore,
    refresh,
    loadMore,
    addEntry,
    removeEntry,
    updateEntry,
  };
}