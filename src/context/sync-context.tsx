/**
 * Sync status context.
 *
 * Mirrors the sync engine's plain, UI-independent state into React and exposes
 * the manual "Sync Now" action plus the auto-sync toggle. The engine stays the
 * single source of truth; this context only subscribes and forwards.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import {
  getSyncStatus,
  initSyncState,
  isSyncing,
  onResult,
  onStatusChange,
  setAutoSync,
  setIntervalMinutes,
  setWifiOnly,
  syncNow,
  type SyncResult,
  type SyncStatus,
} from '@/services/sync/engine';
import { getSupabaseClient } from '@/services/supabase/client';

interface SyncContextValue {
  status: SyncStatus;
  /** Outcome of the most recent sync run (pushed/pulled/failed/conflicts). */
  lastResult: SyncResult | null;
  /** True while a sync run is in flight. */
  syncing: boolean;
  /** Current realtime connection mode. */
  realtimeMode: 'off' | 'connecting' | 'live' | 'degraded';
  /** Whether local edits auto-upload (off by default only if the user turns it off). */
  autoSync: boolean;
  setAutoSync: (value: boolean) => void;
  /** Defer auto-sync until the device is on Wi-Fi. */
  wifiOnly: boolean;
  setWifiOnly: (value: boolean) => void;
  /** Periodic auto-sync interval in minutes; 0 = off. */
  intervalMinutes: number;
  setIntervalMinutes: (value: number) => void;
  /** Manual "Sync Now". */
  runNow: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SyncStatus>(getSyncStatus());
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);
  const [syncing, setSyncing] = useState(isSyncing());

  useEffect(() => {
    void initSyncState(getSupabaseClient);

    const unsubscribeStatus = onStatusChange((nextStatus) => {
      setStatus(nextStatus);
      setSyncing(nextStatus.state === 'syncing');
    });

    const unsubscribeResult = onResult((result) => {
      setLastResult(result);
    });

    return () => {
      unsubscribeStatus();
      unsubscribeResult();
    };
  }, []);

  const handleSetAutoSync = useCallback(async (value: boolean) => {
    await setAutoSync(value);
  }, []);

  const handleSetWifiOnly = useCallback(async (value: boolean) => {
    await setWifiOnly(value);
  }, []);

  const handleSetIntervalMinutes = useCallback(async (value: number) => {
    const minutes = Math.max(0, Math.floor(value));
    await setIntervalMinutes(minutes);
  }, []);

  const runNow = useCallback(async () => {
    await syncNow('manual', getSupabaseClient);
  }, []);

  const value = useMemo(
    () => ({
      status,
      lastResult,
      syncing,
      realtimeMode: status.realtimeMode,
      autoSync: status.autoSync,
      setAutoSync: handleSetAutoSync,
      wifiOnly: status.wifiOnly,
      setWifiOnly: handleSetWifiOnly,
      intervalMinutes: status.intervalMinutes,
      setIntervalMinutes: handleSetIntervalMinutes,
      runNow,
    }),
    [
      status,
      lastResult,
      syncing,
      handleSetAutoSync,
      handleSetWifiOnly,
      handleSetIntervalMinutes,
      runNow,
    ]
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return ctx;
}