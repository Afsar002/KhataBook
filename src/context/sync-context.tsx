/**
 * Sync status context.
 *
 * Mirrors the sync engine's plain, UI-independent state into React and exposes
 * the manual "Sync Now" action plus the auto-sync toggle. The engine stays the
 * single source of truth; this context only subscribes and forwards.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import {
  getAutoSync,
  getSyncIntervalMinutes,
  getWifiOnlySync,
  setAutoSync as persistAutoSync,
  setSyncIntervalMinutes as persistSyncIntervalMinutes,
  setWifiOnlySync as persistWifiOnlySync,
} from '@/db/sync/meta';
import {
  armPeriodicSync,
  getLastResult,
  getLastSyncAt,
  getSyncStatus,
  initSyncState,
  isSyncing,
  onStatusChange,
  syncNow,
  type SyncSummary,
} from '@/services/sync/sync-engine';
import { getRealtimeMode, onRealtimeModeChange } from '@/services/sync/realtime';
import type { RealtimeMode, SyncStatus } from '@/types';
import { getSupabaseClient } from '@/services/supabase/client';

interface SyncContextValue {
  status: SyncStatus;
  lastSyncAt: string | null;
  /** Outcome of the most recent sync run (pushed/pulled/failed/conflicts). */
  lastResult: SyncSummary | null;
  /** True while a sync run is in flight. */
  syncing: boolean;
  /** Live multi-device sync: 'live' | 'trigger' | 'off'. */
  realtimeMode: RealtimeMode;
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
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(getLastSyncAt());
  const [lastResult, setLastResult] = useState<SyncSummary | null>(getLastResult());
  const [syncing, setSyncing] = useState(isSyncing());
  const [realtimeMode, setRealtimeMode] = useState<RealtimeMode>(getRealtimeMode());
  const [autoSync, setAutoSyncState] = useState(true);
  const [wifiOnly, setWifiOnlyState] = useState(false);
  const [intervalMinutes, setIntervalMinutesState] = useState(0);

  useEffect(() => {
    void initSyncState(getSupabaseClient).then(() => {
      setStatus(getSyncStatus());
      setLastSyncAt(getLastSyncAt());
      setLastResult(getLastResult());
    });
    void getAutoSync().then(setAutoSyncState);
    void getWifiOnlySync().then(setWifiOnlyState);
    void getSyncIntervalMinutes().then((minutes) => {
      setIntervalMinutesState(minutes);
      void armPeriodicSync();
    });

    const unsubscribe = onStatusChange((nextStatus, nextLastSyncAt) => {
      setStatus(nextStatus);
      setLastSyncAt(nextLastSyncAt);
      setLastResult(getLastResult());
      setSyncing(isSyncing());
    });

    const unsubscribeRealtime = onRealtimeModeChange(setRealtimeMode);

    return () => {
      unsubscribe();
      unsubscribeRealtime();
    };
  }, []);

  const setAutoSync = useCallback((value: boolean) => {
    setAutoSyncState(value);
    void persistAutoSync(value);
  }, []);

  const setWifiOnly = useCallback((value: boolean) => {
    setWifiOnlyState(value);
    void persistWifiOnlySync(value);
  }, []);

  const setIntervalMinutes = useCallback((value: number) => {
    const minutes = Math.max(0, Math.floor(value));
    setIntervalMinutesState(minutes);
    void persistSyncIntervalMinutes(minutes).then(() => void armPeriodicSync());
  }, []);

  const runNow = useCallback(async () => {
    await syncNow(getSupabaseClient);
  }, []);

  const value = useMemo(
    () => ({
      status,
      lastSyncAt,
      lastResult,
      syncing,
      realtimeMode,
      autoSync,
      setAutoSync,
      wifiOnly,
      setWifiOnly,
      intervalMinutes,
      setIntervalMinutes,
      runNow,
    }),
    [
      status,
      lastSyncAt,
      lastResult,
      syncing,
      realtimeMode,
      autoSync,
      setAutoSync,
      wifiOnly,
      setWifiOnly,
      intervalMinutes,
      setIntervalMinutes,
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
