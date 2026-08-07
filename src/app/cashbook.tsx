/**
 * Daily cash book: expected vs actual cash reconciliation.
 *
 * Pick a day with the chevrons (or jump to Today). The summary shows the
 * book's opening, day flows and closing (expected cash in hand). Enter the
 * counted cash in hand and the difference is colour-coded — green when it
 * matches, amber when cash is short or extra.
 */
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Scale } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AmountInput } from '@/components/amount-input';
import { Card } from '@/components/card';
import { LargeButton } from '@/components/large-button';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useCashBook } from '@/hooks/use-cash-book';
import { useTheme } from '@/hooks/use-theme';
import { formatDateLabel, formatINR, shiftISODate, todayISODate } from '@/utils/format';

export default function CashBookScreen() {
  const theme = useTheme();
  const today = todayISODate();
  const [date, setDate] = useState(today);
  const { book, loading, saveCount, clearCount } = useCashBook(date);
  const [actual, setActual] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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

  return (
    <Screen>
      <ScreenHeader title="Cash Book" />

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

      <View style={styles.hint}>
        <CalendarDays size={14} color={theme.textSecondary} />
        <ThemedText type="small" themeColor="textSecondary">
          Count your cash at closing time to catch missing or extra money.
        </ThemedText>
      </View>
    </Screen>
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
});
