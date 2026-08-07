/** Loads parties (customers/suppliers) with their running balances. */
import { useCallback, useEffect, useState } from 'react';

import { addParty, deleteParty, listParties, type NewParty } from '@/db/party-repo';
import type { PartyBalance, PartyType } from '@/types';

export function useParties(type?: PartyType) {
  const [parties, setParties] = useState<PartyBalance[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const rows = await listParties(type);
    setParties(rows);
    setLoading(false);
  }, [type]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const add = useCallback(
    async (party: NewParty) => {
      const id = await addParty(party);
      await refresh();
      return id;
    },
    [refresh]
  );

  const remove = useCallback(
    async (id: number) => {
      await deleteParty(id);
      await refresh();
    },
    [refresh]
  );

  return { parties, loading, refresh, add, remove };
}
