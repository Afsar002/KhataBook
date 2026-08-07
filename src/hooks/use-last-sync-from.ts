/**
 * The synced `last_sync_from` value — which named device last pushed its data.
 * Re-reads whenever the sync status changes (a pull/push may have updated it).
 */
import { useEffect, useState } from 'react';

import { useSync } from '@/context/sync-context';
import { getSetting } from '@/db/settings';

export function useLastSyncFrom(): string {
  const { status } = useSync();
  const [from, setFrom] = useState('');

  useEffect(() => {
    let mounted = true;
    void getSetting('last_sync_from').then((value) => {
      if (mounted) {
        setFrom(value ?? '');
      }
    });
    return () => {
      mounted = false;
    };
  }, [status]);

  return from;
}
