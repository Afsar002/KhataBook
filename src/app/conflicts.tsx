/**
 * Sync conflict review screen.
 *
 * When a pull overwrites a local change that hadn't uploaded yet, both versions
 * are snapshotted locally (see `db/sync/conflict-repo.ts`). This screen lists
 * those open conflicts and lets the user either keep the cloud version (the
 * default) or restore their own version, which is written back and queued for
 * re-upload.
 */
import { AlertTriangle, Check, RotateCcw } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { feedback } from '@/components/feedback';
import { LargeButton } from '@/components/large-button';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  listConflicts,
  resolveConflict,
  restoreLocalVersion,
} from '@/db/sync/conflict-repo';
import type { SyncConflict } from '@/types';

/** Column names that describe sync bookkeeping rather than the record itself. */
const META_KEYS = new Set([
  'id',
  'key',
  'uuid',
  'user_id',
  'updated_at',
  'created_at',
  'deleted_at',
  'version',
  'sort_order',
]);

/** Friendly label per table (matches the sync history log). */
const TABLE_LABEL: Record<string, string> = {
  accounts: 'Account',
  categories: 'Category',
  transactions: 'Entry',
  transfers: 'Transfer',
  parties: 'Party',
  party_transactions: 'Party entry',
  settings: 'Setting',
};

/** "name: Cash · type: cash" — the meaningful fields of a snapshot. */
function summarizeRow(json: string | null): string | null {
  if (!json) {
    return null;
  }
  try {
    const row = JSON.parse(json) as Record<string, unknown>;
    const fields = Object.entries(row).filter(
      ([key, value]) =>
        !META_KEYS.has(key) && value !== null && value !== undefined && value !== ''
    );
    if (fields.length === 0) {
      return '(record)';
    }
    return fields
      .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`)
      .join(' · ');
  } catch {
    return null;
  }
}

function formatWhen(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) {
    return iso;
  }
  const diff = Date.now() - then;
  if (diff < 60_000) {
    return 'just now';
  }
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hr ago`;
  }
  return new Date(iso).toLocaleDateString();
}

export default function ConflictsScreen() {
  const theme = useTheme();
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setConflicts(await listConflicts(200));
    } catch {
      feedback.toast({ message: 'Failed to load conflicts', tone: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Wrap each action so the tapped card shows a spinner and the list refreshes. */
  const runAction = async (conflict: SyncConflict, action: 'keepCloud' | 'restoreMine') => {
    if (busyId !== null) {
      return;
    }
    setBusyId(conflict.id);
    try {
      if (action === 'restoreMine') {
        await restoreLocalVersion(conflict.id);
        feedback.toast({ message: 'Restored your version — it will re-upload', tone: 'success' });
      } else {
        await resolveConflict(conflict.id);
        feedback.toast({ message: 'Kept the cloud version', tone: 'success' });
      }
      void load();
    } catch {
      feedback.toast({ message: 'Something went wrong', tone: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  const pendingCount = conflicts.length;

  return (
    <Screen scroll>
      <ScreenHeader title="Conflicts" />

      <ThemedText type="small" themeColor="textSecondary">
        {pendingCount === 0
          ? 'Local changes are never overwritten without a trace. Cloud wins by default; restore your own version if you prefer it.'
          : `${pendingCount} local ${pendingCount === 1 ? 'change was' : 'changes were'} overwritten by a newer cloud version. Choose which side to keep.`}
      </ThemedText>

      {loading ? (
        <ActivityIndicator color={theme.primary} style={styles.loader} />
      ) : conflicts.length === 0 ? (
        <Card>
          <EmptyState
            type="conflicts"
            title="No open conflicts"
            message="Nothing was silently overwritten. Your last sync went through clean."
          />
        </Card>
      ) : (
        conflicts.map((conflict) => {
          const busy = busyId === conflict.id;
          const mine = summarizeRow(conflict.localJson);
          const theirs = summarizeRow(conflict.remoteJson);
          return (
            <Card key={conflict.id} pad>
              <View style={styles.conflictHeader}>
                <View style={styles.conflictTitle}>
                  <AlertTriangle size={16} color={theme.danger} />
                  <ThemedText type="smallBold">
                    {TABLE_LABEL[conflict.tableName] ?? conflict.tableName}
                  </ThemedText>
                </View>
                <ThemedText type="small" themeColor="textSecondary">
                  {formatWhen(conflict.createdAt)}
                </ThemedText>
              </View>

              <ThemedText type="small" themeColor="textSecondary" style={styles.message}>
                {conflict.message}
              </ThemedText>

              {mine || theirs ? (
                <View style={[styles.compare, { backgroundColor: theme.backgroundElement }]}>
                  {mine ? (
                    <View style={styles.compareRow}>
                      <ThemedText type="smallBold" themeColor="primary">
                        Your version
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {mine}
                      </ThemedText>
                    </View>
                  ) : null}
                  {theirs ? (
                    <View style={styles.compareRow}>
                      <ThemedText type="smallBold" themeColor="danger">
                        Cloud version
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {theirs}
                      </ThemedText>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {busy ? (
                <ActivityIndicator color={theme.primary} style={styles.actionLoader} />
              ) : (
                <View style={styles.actions}>
                  <LargeButton
                    title="Keep cloud"
                    subtitle="Cloud wins"
                    icon={Check}
                    variant="outline"
                    height={56}
                    style={styles.actionButton}
                    onPress={() => void runAction(conflict, 'keepCloud')}
                  />
                  <LargeButton
                    title="Restore mine"
                    subtitle="Re-upload my version"
                    icon={RotateCcw}
                    height={56}
                    style={styles.actionButton}
                    onPress={() => void runAction(conflict, 'restoreMine')}
                  />
                </View>
              )}
            </Card>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loader: {
    marginTop: Spacing.five,
  },
  actionLoader: {
    marginVertical: Spacing.three,
  },
  conflictHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  conflictTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flexShrink: 1,
  },
  message: {
    marginTop: Spacing.two,
  },
  compare: {
    marginTop: Spacing.three,
    borderRadius: Radius.card,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  compareRow: {
    gap: 2,
  },
  actions: {
    marginTop: Spacing.three,
    gap: Spacing.two,
  },
  actionButton: {
    flex: 1,
  },
});
