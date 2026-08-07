/** Loads the khata headline figures (receivable / payable / net). */
import { useCallback, useEffect, useState } from 'react';

import { getKhataSummary } from '@/db/party-repo';
import type { KhataSummary } from '@/types';

const EMPTY: KhataSummary = { receivable: 0, payable: 0, net: 0 };

export function useKhataSummary() {
  const [summary, setSummary] = useState<KhataSummary>(EMPTY);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setSummary(await getKhataSummary());
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { summary, loading, refresh };
}
