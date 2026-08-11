/**
 * Older Entries — pushed from the Cashbook's summary card. Browse the ledger by
 * duration (This Month default) and download the range as a PDF. Tapping a day
 * card opens that day's detail screen.
 */
import { router, useFocusEffect } from 'expo-router';
import { ChevronRight, CircleHelp, Download } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import {
  DEFAULT_DURATION,
  DurationPicker,
  durationBounds,
  type DurationKey,
} from '@/components/duration-picker';
import { EmptyState } from '@/components/empty-state';
import { feedback } from '@/components/feedback';
import { LargeButton } from '@/components/large-button';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { InterFonts, Radius, Spacing } from '@/constants/theme';
import {
  listDaySummaries,
  listLedgerRange,
  runningCashInHand,
  type DayLedgerSummary,
} from '@/db/transaction-repo';
import { useResponsiveLayout } from '@/hooks/use-responsive';
import { useTheme } from '@/hooks/use-theme';
import { formatDayMonth, formatINR, formatRangeDate } from '@/utils/format';
import { buildTransactionsPdf } from '@/utils/pdf';
import { writeAndShareFile } from '@/utils/share';

export default function HistoryReportScreen() {
  const theme = useTheme();
  const { contentMaxWidth } = useResponsiveLayout();
  const [duration, setDuration] = useState<DurationKey>(DEFAULT_DURATION);

  const bounds = useMemo(() => durationBounds(duration), [duration]);

  return (
    <Screen scroll={false}>
      <View style={[styles.column, { maxWidth: contentMaxWidth }]}>
        <ScreenHeader
          title="Older Entries"
          right={
            <Pressable
              onPress={() =>
                feedback.toast({
                  message: 'Browse days by duration, or download this range as a PDF.',
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

        <ReportDaily
          from={bounds.from}
          to={bounds.to}
          duration={duration}
          onDurationChange={setDuration}
        />
      </View>
    </Screen>
  );
}

/** Daily day-card view: duration dropdown + range card + day cards + sticky Download. */
function ReportDaily({
  from,
  to,
  duration,
  onDurationChange,
}: {
  from?: string;
  to?: string;
  duration: DurationKey;
  onDurationChange: (key: DurationKey) => void;
}) {
  const theme = useTheme();
  const [days, setDays] = useState<DayLedgerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      setLoading(true);
      void listDaySummaries(from, to).then((rows) => {
        if (!mounted) {
          return;
        }
        // Enforce the running-total contract row-by-row (previous cash in hand
        // + current day balance), seeded from the SQL's pre-range carry-in.
        setDays(runningCashInHand(rows));
        setLoading(false);
      });
      return () => {
        mounted = false;
      };
    }, [from, to])
  );

  const handleExport = async () => {
    if (exporting) {
      return;
    }
    setExporting(true);
    try {
      const data = await listLedgerRange(from, to);
      if (data.length === 0) {
        feedback.toast({ message: 'No transactions in this range.', tone: 'info' });
        return;
      }
      const pdfBytes = await buildTransactionsPdf({ dateFrom: from ?? '', dateTo: to ?? '', entries: data });
      const rangeLabel = from && to ? `${from}-to-${to}` : from ?? to ?? 'all';
      await writeAndShareFile({
        filename: `dailykhata-transactions-${rangeLabel}.pdf`,
        content: pdfBytes,
        mimeType: 'application/pdf',
        dialogTitle: 'Save PDF',
      });
      feedback.toast({ message: 'Transactions PDF generated', tone: 'success' });
    } catch (error) {
      feedback.toast({
        message: error instanceof Error ? error.message : String(error),
        tone: 'error',
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <View style={styles.dailyRoot}>
      <Card style={styles.rangeCard} pad={false}>
        <View style={styles.rangeRow}>
          <View style={styles.rangeCell}>
            <ThemedText type="small" themeColor="textSecondary">
              From
            </ThemedText>
            <ThemedText style={styles.rangeValue}>{from ? formatRangeDate(from) : 'All time'}</ThemedText>
          </View>
          <View style={[styles.rangeDivider, { backgroundColor: theme.border }]} />
          <View style={styles.rangeCell}>
            <ThemedText type="small" themeColor="textSecondary">
              To
            </ThemedText>
            <ThemedText style={styles.rangeValue}>{to ? formatRangeDate(to) : 'All time'}</ThemedText>
          </View>
        </View>
      </Card>

      <DurationPicker value={duration} onChange={onDurationChange} />

      <View style={styles.dayHeader}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.dayHeaderDate}>
          Date
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.dayHeaderCell}>
          Daily Balance
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.dayHeaderCell}>
          Cash in Hand
        </ThemedText>
        <View style={styles.dayHeaderChevron} />
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="small" color={theme.primary} />
        </View>
      ) : (
        <FlatList
          data={days}
          style={styles.dayList}
          keyExtractor={(item) => item.date}
          renderItem={({ item }) => {
            const dayBalance = item.income - item.expense;
            return (
              <Pressable
                onPress={() =>
                  router.push({ pathname: '/history-day/[date]', params: { date: item.date } })
                }
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.dayCard,
                  { backgroundColor: theme.card, borderColor: theme.border },
                  pressed && styles.pressed,
                ]}>
                <ThemedText style={styles.dayTitle}>{formatDayMonth(item.date)}</ThemedText>
                <View style={styles.dayCenter}>
                  <ThemedText
                    style={[
                      styles.dayAmount,
                      { color: dayBalance >= 0 ? theme.income : theme.expense },
                    ]}>
                    {formatINR(dayBalance)}
                  </ThemedText>
                </View>
                <View style={styles.dayRight}>
                  <ThemedText style={[styles.dayAmount, { color: theme.text }]}>
                    {formatINR(item.cashInHand)}
                  </ThemedText>
                </View>
                <ChevronRight size={20} color={theme.textSecondary} />
              </Pressable>
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <EmptyState type="entries" title="No entries in this period" message="Try a different duration." />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      <LargeButton
        title={exporting ? 'Generating…' : 'Download'}
        icon={Download}
        onPress={handleExport}
        height={56}
        disabled={exporting}
        style={{ ...styles.download, backgroundColor: theme.info }}
      />
    </View>
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
  dailyRoot: {
    flex: 1,
  },
  rangeCard: {
    overflow: 'hidden',
  },
  rangeRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  rangeCell: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.half,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
  },
  rangeDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    marginVertical: Spacing.two,
  },
  rangeValue: {
    fontFamily: InterFonts.semibold,
    fontSize: 15,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayList: {
    flex: 1,
  },
  listContent: {
    paddingVertical: Spacing.one,
  },
  separator: {
    height: Spacing.two,
  },
  dayCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.card,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  pressed: {
    opacity: 0.7,
  },
  dayTitle: {
    fontFamily: InterFonts.bold,
    fontSize: 16,
    minWidth: 64,
  },
  dayCenter: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.half,
  },
  dayRight: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.half,
  },
  dayAmount: {
    fontFamily: InterFonts.semibold,
    fontSize: 15,
  },
  // Column headers above the day list. The row mirrors the day card's layout
  // (same padding, gap, min-width and chevron width) so DATE / Daily Balance /
  // Cash in Hand line up over their columns below.
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.half,
  },
  dayHeaderDate: {
    minWidth: 64,
    fontSize: 12,
    textTransform: 'uppercase',
    fontFamily: InterFonts.semibold,
  },
  dayHeaderCell: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    textTransform: 'uppercase',
    fontFamily: InterFonts.semibold,
  },
  dayHeaderChevron: {
    width: 20,
  },
  download: {
    marginTop: Spacing.three,
    marginBottom: Spacing.three,
  },
});
