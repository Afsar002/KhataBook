import { useFocusEffect } from 'expo-router';
import { ChevronLeft, ChevronRight, FileText } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { CategoryIcon } from '@/components/category-icon';
import { FitText } from '@/components/fit-text';
import { feedback } from '@/components/feedback';
import { LargeButton } from '@/components/large-button';
import { Screen } from '@/components/screen';
import { Segment } from '@/components/segment';
import { ThemedText } from '@/components/themed-text';
import { InterFonts, Radius, Spacing } from '@/constants/theme';
import { useAccounts } from '@/hooks/use-accounts';
import { useMonthlyReport } from '@/hooks/use-monthly-report';
import { useTheme } from '@/hooks/use-theme';
import type { CategoryTotal } from '@/types';
import { formatINR, monthKey, monthLabel } from '@/utils/format';
import { buildMonthlyReportPdf } from '@/utils/pdf';
import { writeAndShareFile } from '@/utils/share';

type BreakdownKey = 'all' | 'expense' | 'income';

export default function ReportsScreen() {
  const theme = useTheme();
  const now = new Date();

  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [breakdown, setBreakdown] = useState<BreakdownKey>('expense');
  const [busy, setBusy] = useState(false);

  const { report, refresh } = useMonthlyReport(monthKey(year, month));
  const { balances, refresh: refreshAccounts } = useAccounts();

  useFocusEffect(
    useCallback(() => {
      void refresh();
      void refreshAccounts();
    }, [refresh, refreshAccounts])
  );

  const canGoNext =
    year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth());

  const goPrev = () => {
    if (month === 0) {
      setMonth(11);
      setYear(year - 1);
    } else {
      setMonth(month - 1);
    }
  };

  const goNext = () => {
    if (!canGoNext) {
      return;
    }
    if (month === 11) {
      setMonth(0);
      setYear(year + 1);
    } else {
      setMonth(month + 1);
    }
  };

  const handleExportPdf = () => {
    void (async () => {
      setBusy(true);
      try {
        const bytes = await buildMonthlyReportPdf({ year, month, report });
        await writeAndShareFile({
          filename: `dailykhata-report-${monthKey(year, month)}.pdf`,
          content: bytes,
          mimeType: 'application/pdf',
          dialogTitle: 'Export monthly report',
        });
        feedback.toast({ message: 'Monthly report saved as PDF.', tone: 'success' });
      } catch (error) {
        feedback.toast({
          message: error instanceof Error ? error.message : String(error),
          tone: 'error',
        });
      } finally {
        setBusy(false);
      }
    })();
  };

  const { summary } = report;
  const profit = summary.income - summary.expense;

  const cashBalance = balances
    .filter((account) => account.type === 'cash')
    .reduce((sum, account) => sum + account.balance, 0);
  const bankBalance = balances
    .filter((account) => account.type === 'bank')
    .reduce((sum, account) => sum + account.balance, 0);

  const breakdownList: CategoryTotal[] =
    breakdown === 'all'
      ? [...report.expenses, ...report.incomes]
      : breakdown === 'expense'
        ? report.expenses
        : report.incomes;
  const maxTotal = breakdownList[0]?.total ?? 0;

  return (
    <Screen hasTabBar>
      <ThemedText type="subtitle">Reports</ThemedText>

      <View style={styles.monthRow}>
        <Pressable
          onPress={goPrev}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          hitSlop={8}
          style={[styles.monthButton, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <ChevronLeft size={24} color={theme.text} />
        </Pressable>

        <ThemedText type="default" style={styles.monthLabel}>
          {monthLabel(year, month)}
        </ThemedText>

        <Pressable
          onPress={goNext}
          disabled={!canGoNext}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          hitSlop={8}
          style={[
            styles.monthButton,
            { backgroundColor: theme.backgroundElement, borderColor: theme.border },
            !canGoNext && styles.monthButtonDisabled,
          ]}>
          <ChevronRight size={24} color={canGoNext ? theme.text : theme.border} />
        </Pressable>
      </View>

      <Card style={styles.summaryCard}>
            <View style={styles.summaryColumn}>
              <ThemedText type="small" themeColor="textSecondary">
                Income
              </ThemedText>
              <FitText fontSize={16} style={[styles.summaryAmount, { color: theme.income }]}>
                {formatINR(summary.income)}
              </FitText>
            </View>
            <View style={[styles.summaryColumn, styles.summaryDivider, { borderLeftColor: theme.border }]}>
              <ThemedText type="small" themeColor="textSecondary">
                Expense
              </ThemedText>
              <FitText fontSize={16} style={[styles.summaryAmount, { color: theme.expense }]}>
                {formatINR(summary.expense)}
              </FitText>
            </View>
            <View style={[styles.summaryColumn, styles.summaryDivider, { borderLeftColor: theme.border }]}>
              <ThemedText type="small" themeColor="textSecondary">
                Profit
              </ThemedText>
              <FitText
                fontSize={16}
                style={[
                  styles.summaryAmount,
                  { color: profit >= 0 ? theme.income : theme.expense },
                ]}>
                {formatINR(profit)}
              </FitText>
            </View>
          </Card>

          <Card style={styles.summaryCard}>
            <View style={styles.summaryColumn}>
              <ThemedText type="small" themeColor="textSecondary">
                Money Out
              </ThemedText>
              <FitText fontSize={16} style={[styles.summaryAmount, { color: theme.text }]}>
                {formatINR(report.party.given)}
              </FitText>
            </View>
            <View style={[styles.summaryColumn, styles.summaryDivider, { borderLeftColor: theme.border }]}>
              <ThemedText type="small" themeColor="textSecondary">
                Money In
              </ThemedText>
              <FitText fontSize={16} style={[styles.summaryAmount, { color: theme.text }]}>
                {formatINR(report.party.received)}
              </FitText>
            </View>
          </Card>

          <Card style={styles.summaryCard}>
            <View style={styles.summaryColumn}>
              <ThemedText type="small" themeColor="textSecondary">
                Cash
              </ThemedText>
              <FitText fontSize={16} style={[styles.summaryAmount, { color: theme.income }]}>
                {formatINR(cashBalance)}
              </FitText>
            </View>
            <View style={[styles.summaryColumn, styles.summaryDivider, { borderLeftColor: theme.border }]}>
              <ThemedText type="small" themeColor="textSecondary">
                Bank
              </ThemedText>
              <FitText fontSize={16} style={[styles.summaryAmount, { color: theme.income }]}>
                {formatINR(bankBalance)}
              </FitText>
            </View>
          </Card>

          <Segment
            options={[
              { key: 'all', label: 'All' },
              { key: 'expense', label: 'Expenses' },
              { key: 'income', label: 'Income' },
            ]}
            value={breakdown}
            onChange={(key) => setBreakdown(key as BreakdownKey)}
          />

          <Card style={styles.breakdownCard}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              {breakdown === 'all' ? 'All transactions' : breakdown === 'expense' ? 'Top expenses' : 'Top income'}
            </ThemedText>
            {breakdownList.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                Nothing recorded for this month.
              </ThemedText>
            ) : (
              breakdownList.map((item, index) => {
                const isExpense = item.type === 'expense';
                return (
                  <View key={`${item.name}-${index}`} style={styles.breakdownRow}>
                    <View style={styles.breakdownHeader}>
                      <View style={styles.breakdownTitle}>
                        <CategoryIcon
                          name={item.icon}
                          size={18}
                          color={isExpense ? theme.expense : theme.income}
                        />
                        <ThemedText type="default" numberOfLines={1} ellipsizeMode="tail">{item.name}</ThemedText>
                      </View>
                      <ThemedText type="smallBold" numberOfLines={1} ellipsizeMode="tail">
                        {formatINR(item.total)}
                      </ThemedText>
                    </View>
                    <View style={[styles.barTrack, { backgroundColor: theme.backgroundElement }]}>
                      <View
                        style={[
                          styles.barFill,
                          {
                            backgroundColor: isExpense ? theme.expense : theme.income,
                            width: `${maxTotal > 0 ? Math.round((item.total / maxTotal) * 100) : 0}%`,
                          },
                        ]}
                      />
                    </View>
                  </View>
                );
              })
            )}
          </Card>

          <LargeButton
            title="Export this month (PDF)"
            subtitle="Save the report as a PDF file"
            icon={FileText}
            onPress={handleExportPdf}
            variant="outline"
            height={64}
            disabled={busy}
          />
    </Screen>
  );
}

const styles = StyleSheet.create({
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  monthButton: {
    width: 48,
    height: 48,
    borderRadius: Radius.button,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthButtonDisabled: {
    opacity: 0.4,
  },
  monthLabel: {
    flex: 1,
    textAlign: 'center',
    fontFamily: InterFonts.semibold,
  },
  summaryCard: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  summaryColumn: {
    flex: 1,
    gap: Spacing.one,
  },
  summaryDivider: {
    borderLeftWidth: 1,
    paddingLeft: Spacing.three,
  },
  summaryAmount: {
    fontFamily: InterFonts.bold,
    fontSize: 16,
  },
  breakdownCard: {
    gap: Spacing.two,
  },
  breakdownRow: {
    gap: Spacing.one,
  },
  breakdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  breakdownTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flex: 1,
  },
  barTrack: {
    height: 6,
    borderRadius: Radius.chip,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: Radius.chip,
  },
});
