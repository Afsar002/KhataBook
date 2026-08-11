/**
 * Day detail — pushed from the Deposit & Withdraw Report. Shows the chosen
 * day's ledger with the same layout as the Cashbook today-screen (minus the
 * report row), and sticky Withdraw/Deposit buttons pre-filled for that date.
 */
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { CircleHelp } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { DayLedgerView } from '@/components/day-ledger-view';
import { feedback } from '@/components/feedback';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { Spacing } from '@/constants/theme';
import {
  editRouteForLedgerRow,
  getDayLedgerSummary,
  listLedgerRange,
  type DayLedgerSummary,
} from '@/db/transaction-repo';
import { useResponsiveLayout } from '@/hooks/use-responsive';
import { useTheme } from '@/hooks/use-theme';
import type { LedgerRow } from '@/types';
import { formatDayMonth, formatLongDate } from '@/utils/format';

export default function HistoryDayScreen() {
  const theme = useTheme();
  const { contentMaxWidth } = useResponsiveLayout();
  const { date } = useLocalSearchParams<{ date: string }>();
  const [summary, setSummary] = useState<DayLedgerSummary | null>(null);
  const [entries, setEntries] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      setLoading(true);
      void (async () => {
        const [summary, rows] = await Promise.all([
          getDayLedgerSummary(date),
          listLedgerRange(date, date),
        ]);
        if (!mounted) {
          return;
        }
        setSummary(summary);
        setEntries(rows.filter((row) => row.kind !== 'transfer'));
        setLoading(false);
      })();
      return () => {
        mounted = false;
      };
    }, [date])
  );

  const openEntry = useCallback((row: LedgerRow) => {
    const route = editRouteForLedgerRow(row);
    if (route) {
      router.push(route);
    }
  }, []);

  return (
    <Screen scroll={false}>
      <View style={[styles.column, { maxWidth: contentMaxWidth }]}>
        <ScreenHeader
          title={`Report of ${formatLongDate(date)}`}
          right={
            <Pressable
              onPress={() =>
                feedback.toast({
                  message: "This day's deposits and withdrawals.",
                  tone: 'info',
                })
              }
              accessibilityRole="button"
              accessibilityLabel="Help"
              hitSlop={8}>
              <CircleHelp size={22} color={theme.text} />
            </Pressable>
          }
        />

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="small" color={theme.primary} />
          </View>
        ) : (
          <DayLedgerView
            title={formatDayMonth(date)}
            count={entries.length}
            withdraw={summary?.expense ?? 0}
            deposit={summary?.income ?? 0}
            cashInHand={summary?.cashInHand ?? 0}
            dayBalance={(summary?.income ?? 0) - (summary?.expense ?? 0)}
            entries={entries}
            balanceLabel="Day Balance"
            onPressEntry={openEntry}
            onWithdraw={() => router.push({ pathname: '/expense', params: { date } })}
            onDeposit={() => router.push({ pathname: '/income', params: { date } })}
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
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
