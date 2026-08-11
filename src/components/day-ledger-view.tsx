/**
 * Shared body of the Cashbook today-screen and the pushed day-detail screen:
 * the summary card, the day header row, the 3-column entry list and the sticky
 * Withdraw / Deposit buttons. The parent screen supplies the top bar.
 */
import { ChevronRight } from 'lucide-react-native';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { DayEntryCard } from '@/components/day-entry-card';
import { EmptyState } from '@/components/empty-state';
import { LargeButton } from '@/components/large-button';
import { ThemedText } from '@/components/themed-text';
import { InterFonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { LedgerRow } from '@/types';
import { formatINR } from '@/utils/format';

type DayLedgerViewProps = {
  /** Day label for the header, e.g. "11 Aug". */
  title: string;
  /** Number of entries shown (used for the "N Entries" caption). */
  count: number;
  /** The day's expense total (red in the header). */
  withdraw: number;
  /** The day's income total (green in the header). */
  deposit: number;
  /** Running balance up to and including this day (all accounts). */
  cashInHand: number;
  /** This day's net balance (`income − expense`). */
  dayBalance: number;
  /** Non-transfer ledger rows for the day. */
  entries: LedgerRow[];
  /** Right-hand summary label: "Today's Balance" or "Day Balance". */
  balanceLabel: string;
  /** When true, the summary card shows the "VIEW DEPOSIT & WITHDRAW REPORT" row. */
  showReportRow?: boolean;
  onOpenReport?: () => void;
  /** Opens a row's edit form (opening-balance rows are not tappable). */
  onPressEntry?: (row: LedgerRow) => void;
  onWithdraw?: () => void;
  onDeposit?: () => void;
};

export function DayLedgerView({
  title,
  count,
  withdraw,
  deposit,
  cashInHand,
  dayBalance,
  entries,
  balanceLabel,
  showReportRow = false,
  onOpenReport,
  onPressEntry,
  onWithdraw,
  onDeposit,
}: DayLedgerViewProps) {
  const theme = useTheme();

  return (
    <View style={styles.root}>
      <Card style={styles.summaryCard}>
        <View style={styles.summaryTop}>
          <View style={styles.summaryCell}>
            <ThemedText type="small" themeColor="textSecondary">
              Cash in Hand
            </ThemedText>
            <ThemedText style={[styles.summaryAmount, { color: theme.income }]}>
              {formatINR(cashInHand)}
            </ThemedText>
          </View>
          <View style={[styles.summaryDivider, { backgroundColor: theme.border }]} />
          <View style={styles.summaryCell}>
            <ThemedText type="small" themeColor="textSecondary">
              {balanceLabel}
            </ThemedText>
            <ThemedText style={[styles.summaryAmount, { color: theme.income }]}>
              {formatINR(dayBalance)}
            </ThemedText>
          </View>
        </View>

        {showReportRow ? (
          <Pressable
            onPress={onOpenReport}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.reportRow,
              { borderTopColor: theme.border },
              pressed && styles.pressed,
            ]}>
            <ThemedText type="smallBold" style={styles.reportRowText}>
              VIEW DEPOSIT & WITHDRAW REPORT
            </ThemedText>
            <ChevronRight size={18} color={theme.text} />
          </Pressable>
        ) : null}
      </Card>

      {/* Mirrors the entry cards' 2:1:1 columns (Time | Withdraw | Deposit) so
          the totals sit centered / right-aligned above their columns below. */}
      <View style={styles.headerRow}>
        <View style={styles.headerDate}>
          <ThemedText style={styles.headerTitle}>{title}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {count} {count === 1 ? 'Entry' : 'Entries'}
          </ThemedText>
        </View>
        <View style={styles.headerTotalCol}>
          <ThemedText type="small" themeColor="textSecondary">
            Withdraw
          </ThemedText>
          <ThemedText type="smallBold" style={{ color: theme.expense }}>
            {formatINR(withdraw)}
          </ThemedText>
        </View>
        <View style={[styles.headerTotalCol, styles.headerTotalRight]}>
          <ThemedText type="small" themeColor="textSecondary">
            Deposit
          </ThemedText>
          <ThemedText type="smallBold" style={{ color: theme.income }}>
            {formatINR(deposit)}
          </ThemedText>
        </View>
      </View>

      <FlatList
        data={entries}
        style={styles.list}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <DayEntryCard
            time={item.time}
            pill={item.categoryName ?? undefined}
            withdraw={item.kind === 'expense' ? item.amount : null}
            deposit={item.kind === 'income' ? item.amount : null}
            hasAttachments={item.hasAttachments}
            onPress={
              onPressEntry && item.entryKind !== 'opening'
                ? () => onPressEntry(item)
                : undefined
            }
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <EmptyState
            type="entries"
            title="No entries this day"
            message="Add a deposit or withdrawal to get started."
          />
        }
        showsVerticalScrollIndicator={false}
      />

      <View style={styles.actions}>
        <LargeButton
          title="Withdraw"
          variant="expense"
          onPress={onWithdraw ?? (() => {})}
          height={56}
          style={styles.actionButton}
        />
        <LargeButton
          title="Deposit"
          variant="income"
          onPress={onDeposit ?? (() => {})}
          height={56}
          style={styles.actionButton}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  summaryCard: {
    gap: 0,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  summaryTop: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  summaryCell: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.two,
  },
  summaryDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    marginVertical: Spacing.three,
  },
  summaryAmount: {
    fontFamily: InterFonts.semibold,
    fontSize: 20,
  },
  reportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.two,
  },
  reportRowText: {
    letterSpacing: 0.4,
  },
  pressed: {
    opacity: 0.7,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
  },
  headerDate: {
    flex: 2,
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontFamily: InterFonts.bold,
    fontSize: 18,
  },
  headerTotalCol: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.half,
  },
  headerTotalRight: {
    alignItems: 'flex-end',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingVertical: Spacing.one,
  },
  separator: {
    height: Spacing.two,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.three,
  },
  actionButton: {
    flex: 1,
  },
});
