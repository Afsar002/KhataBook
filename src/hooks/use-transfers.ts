/** Loads transfers and exposes add/remove helpers. */
import { useCallback, useEffect, useState } from 'react';

import {
  addTransfer as insertTransfer,
  deleteTransfer,
  listTransfers,
  updateTransfer,
} from '@/db/transfer-repo';
import type { NewTransfer, TransferRow } from '@/types';

export function useTransfers() {
  const [transfers, setTransfers] = useState<TransferRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setTransfers(await listTransfers());
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const add = useCallback(
    async (tx: NewTransfer) => {
      await insertTransfer(tx);
      await refresh();
    },
    [refresh]
  );

  const remove = useCallback(
    async (id: number) => {
      await deleteTransfer(id);
      await refresh();
    },
    [refresh]
  );

  const update = useCallback(
    async (id: number, tx: NewTransfer) => {
      await updateTransfer(id, tx);
      await refresh();
    },
    [refresh]
  );

  return { transfers, loading, refresh, add, remove, update };
}
