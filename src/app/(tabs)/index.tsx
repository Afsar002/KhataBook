/**
 * Cashbook — the History tab renamed. Shows today's ledger: a summary card
 * (Cash in Hand · Today's Balance), a day header with Withdraw/Deposit totals,
 * a 3-column Time/Withdraw/Deposit entry list, and sticky −Withdraw/+Deposit
 * buttons. "VIEW DEPOSIT & WITHDRAW REPORT" opens the report screen.
 */
import { router, useFocusEffect } from 'expo-router';
import { CircleHelp } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { DayLedgerView } from '@/components/day-ledger-view';
import { feedback } from '@/components/feedback';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import {
  editRouteForLedgerRow,
  getDayLedgerSummary,
  listLedgerRange,
  withDayRunningBalance,
  type DayLedgerSummary,
} from '@/db/transaction-repo';
import { useResponsiveLayout } from '@/hooks/use-responsive';
import { useTheme } from '@/hooks/use-theme';
import type { LedgerRow } from '@/types';
import { formatDayMonth, todayISODate } from '@/utils/format';

export default function HistoryScreen() {
  const theme = useTheme();
  const { contentMaxWidth } = useResponsiveLayout();
  const today = todayISODate();
  const [summary, setSummary] = useState<DayLedgerSummary | null>(null);
  const [entries, setEntries] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      setLoading(true);
      void (async () => {
        const [summary, rows] = await Promise.all([
          getDayLedgerSummary(today),
          listLedgerRange(today, today),
        ]);
        if (!mounted) {
          return;
        }
        setSummary(summary);
        const dayRows = rows.filter((row) => row.kind !== 'transfer');
        setEntries(await withDayRunningBalance(today, dayRows));
        setLoading(false);
      })();
      return () => {
        mounted = false;
      };
    }, [today])
  );

  const openEntry = useCallback((row: LedgerRow) => {
    const route = editRouteForLedgerRow(row);
    if (route) {
      router.push(route);
    }
  }, []);

  return (
    <Screen scroll={false} hasTabBar>
      <View style={[styles.column, { maxWidth: contentMaxWidth }]}>
        <View style={styles.topBar}>
          <ThemedText type="subtitle" style={styles.title}>
            Cashbook
          </ThemedText>
          <Pressable
            onPress={() =>
              feedback.toast({
                message: "Today's deposits and withdrawals. Use the report to browse other days.",
                tone: 'info',
              })
            }
            accessibilityRole="button"
            accessibilityLabel="Help"
            hitSlop={8}
            style={styles.helpButton}>
            <CircleHelp size={22} color={theme.text} />
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="small" color={theme.primary} />
          </View>
        ) : (
          <DayLedgerView
            title={formatDayMonth(today)}
            count={entries.length}
            withdraw={summary?.expense ?? 0}
            deposit={summary?.income ?? 0}
            cashInHand={summary?.cashInHand ?? 0}
            entries={entries}
            showReportRow
            onOpenReport={() => router.push('/history-report')}
            onPressEntry={openEntry}
            onWithdraw={() => router.push({ pathname: '/expense', params: { date: today } })}
            onDeposit={() => router.push({ pathname: '/income', params: { date: today } })}
          />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  column: {
    flex: 1,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    gap: Spacing.three,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    flex: 1,
  },
  helpButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
