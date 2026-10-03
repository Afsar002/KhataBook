/**
 * Daily cash book: expected vs actual cash reconciliation.
 *
 * Pick a day with the chevrons (or jump to Today). The summary shows the
 * book's opening, day flows and closing (expected cash in hand). Enter the
 * counted cash in hand and the difference is colour-coded — green when it
 * matches, amber when cash is short or extra.
 *
 * The `Day | History` toggle switches to a khata-style grouped ledger of
 * every cash entry (newest first) with infinite scroll and tap-to-edit.
 */
import { router, useFocusEffect } from 'expo-router';
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Scale } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, SectionList, StyleSheet, View } from 'react-native';

import { AmountInput } from '@/components/amount-input';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { LargeButton } from '@/components/large-button';
import { PartyDayEntryCard } from '@/components/party-day-entry-card';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { Segment } from '@/components/segment';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { editRouteForCashEntry } from '@/db/cash-book-repo';
import { useCashBook } from '@/hooks/use-cash-book';
import { cashHistoryEffect, useCashHistory } from '@/hooks/use-cash-history';
import { useTheme } from '@/hooks/use-theme';
import { formatDateLabel, formatINR, formatISOToDisplay, shiftISODate, todayISODate } from '@/utils/format';
import type { CashBookEntry } from '@/types';

type CashView = 'day' | 'history';

/** One date group in the history ledger: the day's entries + Out/In totals. */
type CashDayGroup = {
  date: string;
  out: number;
  in: number;
  entries: CashBookEntry[];
};

/** Maps a history entry to its Out / In cells (khata-style). */
function historyOutIn(entry: CashBookEntry): { give: number | null; receive: number | null } {
  switch (entry.type) {
    case 'expense':
    case 'transfer_out':
      return { give: entry.amount, receive: null };
    case 'income':
    case 'transfer_in':
      return { give: null, receive: entry.amount };
    case 'transfer_internal':
      // Cash↔cash internal move: net-zero, but visible on both sides so the
      // day totals reconcile with closing = opening + In − Out.
      return { give: entry.amount, receive: entry.amount };
    case 'opening':
      return { give: null, receive: null };
  }
}

/** Label shown under the time in a history card. */
function historyNote(entry: CashBookEntry): string {
  if (entry.type === 'transfer_in' || entry.type === 'transfer_out' || entry.type === 'transfer_internal') {
    const other = (entry.account ?? '').trim();
    const note = (entry.note ?? '').trim();
    if (other && note) {
      return `${other} · ${note}`;
    }
    return other || note;
  }
  if (entry.type === 'income' || entry.type === 'expense') {
    const category = (entry.category ?? '').trim();
    const note = (entry.note ?? '').trim();
    if (category && note) {
      return `${category} · ${note}`;
    }
    return category || note;
  }
  return entry.note ?? '';
}

export default function CashBookScreen() {
  const theme = useTheme();
  const today = todayISODate();
  const [date, setDate] = useState(today);
  const [view, setView] = useState<CashView>('day');
  const { book, entries, loading, saveCount, clearCount } = useCashBook(date);
  const history = useCashHistory();
  const [actual, setActual] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Refresh the history feed when returning (edits change rows + totals).
  // `history.refresh` is stable across renders; depending on the whole hook
  // object would refire the focus effect on every entry append.
  const historyRefresh = history.refresh;
  useFocusEffect(
    useCallback(() => {
      if (view === 'history') {
        void historyRefresh();
      }
    }, [view, historyRefresh])
  );

  /** Groups the (already newest-first) history ledger by date, totalling Out/In. */
  const historyGroups = useMemo<CashDayGroup[]>(() => {
    const byDate = new Map<string, CashDayGroup>();
    for (const entry of history.entries) {
      let group = byDate.get(entry.date);
      if (!group) {
        group = { date: entry.date, out: 0, in: 0, entries: [] };
        byDate.set(entry.date, group);
      }
      group.entries.push(entry);
      const effect = cashHistoryEffect(entry);
      if (effect < 0) {
        group.out += entry.amount;
      } else if (effect > 0) {
        group.in += entry.amount;
      } else if (entry.type === 'transfer_internal') {
        group.out += entry.amount;
        group.in += entry.amount;
      }
    }
    return Array.from(byDate.values());
  }, [history.entries]);

  const openHistoryEntry = useCallback((entry: CashBookEntry) => {
    const route = editRouteForCashEntry(entry);
    if (route) {
      router.push(route);
    }
  }, []);

  const isToday = date === today;
  const difference = useMemo(() => {
    if (!book) {
      return 0;
    }
    return book.closing - book.actual;
  }, [book]);

  const switchDate = (next: string) => {
    setDate(next);
    setActual('');
    setSaved(false);
  };

  const handleSave = async () => {
    if (!book || saving) {
      return;
    }
    setSaving(true);
    try {
      const value = actual ? parseFloat(actual) : 0;
      await saveCount(value);
      setSaved(true);
      setActual('');
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    if (!book) {
      return;
    }
    await clearCount();
    setActual('');
    setSaved(false);
  };

  const statusColor =
    book && book.actual > 0
      ? difference === 0
        ? theme.income
        : theme.expense
      : theme.textSecondary;

  const statusText =
    !book || book.actual === 0
      ? 'Enter the counted cash to reconcile this day.'
      : difference === 0
        ? 'Balanced — the counted cash matches the book.'
        : difference > 0
          ? `Cash short by ${formatINR(difference)} — counted less than the book.`
          : `Cash extra by ${formatINR(Math.abs(difference))} — counted more than the book.`;

  const isDay = view === 'day';

  return (
    <Screen scroll={isDay}>
      <ScreenHeader title="Cash Book" />

      <Segment
        options={[
          { key: 'day', label: 'Day' },
          { key: 'history', label: 'History' },
        ]}
        value={view}
        onChange={(key) => setView(key as CashView)}
      />

      {isDay ? (
        <>
      <Card style={styles.dateCard}>
        <Pressable
          onPress={() => switchDate(shiftISODate(date, -1))}
          accessibilityRole="button"
          accessibilityLabel="Previous day"
          hitSlop={8}
          style={[styles.dateButton, { backgroundColor: theme.backgroundElement }]}>
          <ChevronLeft size={20} color={theme.text} />
        </Pressable>
        <View style={styles.dateCenter}>
          <ThemedText type="smallBold" style={styles.dateLabel}>
            {formatDateLabel(date)}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', {
              weekday: 'short',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </ThemedText>
        </View>
        <Pressable
          onPress={() => switchDate(shiftISODate(date, 1))}
          accessibilityRole="button"
          accessibilityLabel="Next day"
          disabled={isToday}
          hitSlop={8}
          style={[
            styles.dateButton,
            { backgroundColor: theme.backgroundElement, opacity: isToday ? 0.35 : 1 },
          ]}>
          <ChevronRight size={20} color={theme.text} />
        </Pressable>
      </Card>

      <Card style={styles.summaryCard}>
        <SummaryRow label="Opening balance" value={book?.opening ?? 0} />
        <SummaryRow label="Cash received" value={book?.income ?? 0} color={theme.income} plus />
        <SummaryRow label="Cash spent" value={book?.expense ?? 0} color={theme.expense} minus />
        <SummaryRow label="Transferred in" value={book?.transferIn ?? 0} color={theme.income} plus />
        <SummaryRow label="Transferred out" value={book?.transferOut ?? 0} color={theme.expense} minus />
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <View style={styles.closingRow}>
          <ThemedText type="smallBold">Expected cash in hand</ThemedText>
          <ThemedText style={[styles.closingValue, { color: theme.primary }]}>
            {formatINR(book?.closing ?? 0)}
          </ThemedText>
        </View>
      </Card>

      <Card style={styles.reconcileCard}>
        <View style={styles.reconcileTitle}>
          <Scale size={18} color={theme.text} />
          <ThemedText type="smallBold" style={styles.reconcileTitleText}>
            Reconciliation
          </ThemedText>
        </View>
        <AmountInput value={actual} onChangeText={setActual} />
        <ThemedText type="small" themeColor="textSecondary">
          The cash you actually counted in hand for this day.
        </ThemedText>

        <View style={[styles.statusRow, { backgroundColor: theme.backgroundElement }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <ThemedText type="small" style={[styles.statusText, { color: statusColor }]}>
            {loading ? 'Loading…' : statusText}
          </ThemedText>
        </View>

        <LargeButton
          title={saved ? 'Saved' : 'Save Count'}
          variant="primary"
          icon={saved ? CheckCircle2 : undefined}
          onPress={handleSave}
          disabled={saving || !book}
        />
        {book && book.actual > 0 ? (
          <LargeButton title="Clear Count" variant="outline" onPress={handleClear} />
        ) : null}
      </Card>

      {loading ? null : (
        <View style={styles.ledgerSection}>
          <ThemedText type="smallBold" style={styles.ledgerHeader}>
            Day&apos;s Entries
          </ThemedText>
          {entries.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.emptyLedger}>
              No cash entries for this day.
            </ThemedText>
          ) : (
            <SectionList
              sections={[{ title: date, data: entries }]}
              renderItem={({ item }: { item: CashBookEntry }) => (
                <DayEntryRow item={item} onPress={() => openHistoryEntry(item)} />
              )}
              keyExtractor={(item, index) =>
                item.type === 'transfer_in' || item.type === 'transfer_out' || item.type === 'transfer_internal'
                  ? `transfer-${item.transferId ?? item.id}-${index}`
                  : `${item.type}-${item.id}-${index}`
              }
              stickySectionHeadersEnabled={false}
              contentContainerStyle={styles.ledgerList}
            />
          )}
        </View>
      )}

      <View style={styles.hint}>
        <CalendarDays size={14} color={theme.textSecondary} />
        <ThemedText type="small" themeColor="textSecondary">
          Count your cash at closing time to catch missing or extra money.
        </ThemedText>
      </View>
        </>
      ) : (
        <View style={styles.historyWrap}>
          <View style={styles.columnHeaders}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.columnHeaderTime}>
              Entries
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.columnHeaderGive}>
              Out
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.columnHeaderReceive}>
              In
            </ThemedText>
          </View>
          <SectionList
            sections={historyGroups.map((group) => ({
              date: group.date,
              out: group.out,
              in: group.in,
              data: group.entries,
            }))}
            keyExtractor={(item, index) =>
              item.type === 'transfer_in' || item.type === 'transfer_out' || item.type === 'transfer_internal'
                ? `transfer-${item.transferId ?? item.id}-${index}`
                : `${item.type}-${item.id}-${index}`
            }
            stickySectionHeadersEnabled={false}
            style={styles.historyList}
            contentContainerStyle={styles.historyContent}
            initialNumToRender={12}
            maxToRenderPerBatch={12}
            windowSize={7}
            renderSectionHeader={({ section }) => (
              <CashDayHeader
                date={section.date}
                count={section.data.length}
                out={section.out}
                in={section.in}
              />
            )}
            renderItem={({ item }: { item: CashBookEntry }) => (
              <HistoryEntryRow item={item} onPress={() => openHistoryEntry(item)} />
            )}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            SectionSeparatorComponent={() => <View style={styles.sectionSeparator} />}
            onEndReached={history.hasMore ? () => void history.loadMore() : undefined}
            onEndReachedThreshold={0.4}
            ListFooterComponent={
              history.loadingMore ? (
                <ActivityIndicator
                  color={theme.textSecondary}
                  style={styles.listFooter}
                  accessibilityLabel="Loading more entries"
                />
              ) : null
            }
            ListEmptyComponent={
              history.loading ? (
                <View style={styles.historyLoading}>
                  <ActivityIndicator size="small" color={theme.primary} />
                </View>
              ) : (
                <EmptyState
                  type="entries"
                  title="No cash entries yet"
                  message="Cash income, expenses and transfers will appear here."
                />
              )
            }
            showsVerticalScrollIndicator={false}
          />
        </View>
      )}
    </Screen>
  );
}

/** Day-view row: Out/In cells + tap-to-edit (opening rows stay plain). */
function DayEntryRow({ item, onPress }: { item: CashBookEntry; onPress: () => void }) {
  const isInternal = item.type === 'transfer_internal';
  const isOpening = item.type === 'opening';
  const give =
    (item.type === 'expense' || item.type === 'transfer_out' || isInternal) && !isOpening
      ? item.amount
      : null;
  const receive =
    (item.type === 'income' || item.type === 'transfer_in' || isInternal) && !isOpening
      ? item.amount
      : null;
  const route = editRouteForCashEntry(item);
  return (
    <PartyDayEntryCard
      time={item.time}
      date={item.date}
      note={item.note ?? ''}
      give={give}
      receive={receive}
      runningBalance={item.runningBalance}
      hasAttachments={item.hasAttachments}
      onPress={route ? onPress : undefined}
    />
  );
}

/** History-view row: Out = expense + transfer_out, In = income + transfer_in. */
function HistoryEntryRow({ item, onPress }: { item: CashBookEntry; onPress: () => void }) {
  const { give, receive } = historyOutIn(item);
  const route = editRouteForCashEntry(item);
  return (
    <PartyDayEntryCard
      time={item.time}
      date={item.date}
      note={historyNote(item)}
      give={give}
      receive={receive}
      runningBalance={item.runningBalance}
      hasAttachments={item.hasAttachments}
      onPress={route ? onPress : undefined}
    />
  );
}

/** History section header: date + entry count left, day Out/In totals right. */
function CashDayHeader({
  date,
  count,
  out,
  in: inTotal,
}: {
  date: string;
  count: number;
  out: number;
  in: number;
}) {
  const theme = useTheme();
  return (
    <View style={styles.dayHeader}>
      <View style={styles.dayHeaderLeft}>
        <ThemedText type="smallBold">{formatISOToDisplay(date)}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {count} {count === 1 ? 'entry' : 'entries'}
        </ThemedText>
      </View>
      <View style={styles.dayHeaderTotals}>
        {out > 0 ? (
          <ThemedText type="smallBold" style={{ color: theme.expense }}>
            {formatINR(out)}
          </ThemedText>
        ) : null}
        {inTotal > 0 ? (
          <ThemedText type="smallBold" style={{ color: theme.income }}>
            {formatINR(inTotal)}
          </ThemedText>
        ) : null}
      </View>
    </View>
  );
}

function SummaryRow({
  label,
  value,
  color,
  plus,
  minus,
}: {
  label: string;
  value: number;
  color?: string;
  plus?: boolean;
  minus?: boolean;
}) {
  const theme = useTheme();
  const prefix = plus ? '+' : minus ? '-' : '';
  return (
    <View style={styles.summaryRow}>
      <ThemedText type="default" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText style={[styles.summaryValue, { color: color ?? theme.text }]}>
        {prefix}
        {formatINR(value)}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  dateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  dateButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateCenter: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.half,
  },
  dateLabel: {
    fontSize: 18,
  },
  summaryCard: {
    gap: Spacing.two,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryValue: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
  },
  divider: {
    height: 1,
  },
  closingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closingValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 24,
  },
  reconcileCard: {
    gap: Spacing.two,
  },
  reconcileTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  reconcileTitleText: {
    fontSize: 16,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    flex: 1,
  },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
  },
  ledgerSection: {
    marginTop: Spacing.two,
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
  },
  ledgerHeader: {
    color: 'rgb(14,15,14)',
    marginBottom: Spacing.half,
  },
  emptyLedger: {
    textAlign: 'center',
    paddingVertical: Spacing.four,
  },
  ledgerList: {
    paddingBottom: Spacing.four,
  },
  historyWrap: {
    flex: 1,
    gap: Spacing.two,
  },
  columnHeaders: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    gap: Spacing.two,
  },
  columnHeaderTime: {
    flex: 2,
    textAlign: 'left',
  },
  columnHeaderGive: {
    flex: 1,
    textAlign: 'center',
  },
  columnHeaderReceive: {
    flex: 1,
    textAlign: 'right',
  },
  historyList: {
    flex: 1,
  },
  historyContent: {
    paddingBottom: Spacing.four,
  },
  historyLoading: {
    alignItems: 'center',
    paddingVertical: Spacing.six,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    gap: Spacing.two,
  },
  dayHeaderLeft: {
    flex: 1,
    gap: 2,
  },
  dayHeaderTotals: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  separator: {
    height: Spacing.one,
  },
  sectionSeparator: {
    height: Spacing.two,
  },
  listFooter: {
    paddingVertical: Spacing.three,
  },
});
