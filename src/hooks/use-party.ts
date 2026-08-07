/** Loads a single party with its balance and ledger history. */
import { useCallback, useEffect, useState } from 'react';

import {
  addPartyTransaction,
  deletePartyTransaction,
  getParty,
  getPartyBalance,
  listPartyTransactions,
  updatePartyTransaction,
} from '@/db/party-repo';
import type { NewPartyTransaction, Party, PartyTransaction } from '@/types';

export function useParty(id: number) {
  const [party, setParty] = useState<Party | null>(null);
  const [balance, setBalance] = useState(0);
  const [ledger, setLedger] = useState<PartyTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [partyRow, balanceRow, ledgerRows] = await Promise.all([
      getParty(id),
      getPartyBalance(id),
      listPartyTransactions(id),
    ]);
    setParty(partyRow);
    setBalance(balanceRow?.balance ?? 0);
    // The ledger includes the Opening Balance entry (kind = 'opening') as the
    // very first transaction — it is already part of the balance calculation.
    setLedger(ledgerRows);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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

  return { party, balance, ledger, loading, refresh, addEntry, removeEntry, updateEntry };
}