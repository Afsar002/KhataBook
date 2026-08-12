/**
 * One khata entry in the Cashbook-style 3-column ledger:
 * Date + Time, with running balance pill + note | Give (red) | Receive (green).
 *
 * Mirrors `DayEntryCard` exactly (2:1:1 flex, left-aligned time, centered give,
 * right-aligned receive, faint vertical dividers) so the customer/supplier
 * ledger reads identically to the Cashbook. Opening-balance entries pass no
 * `onPress`, so they render as plain (non-tappable) cards.
 */
import { Paperclip } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { InterFonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatINR, formatTimeOfDay } from '@/utils/format';

type PartyDayEntryCardProps = {
  /** `HH:MM` (24-hour); '' for opening-balance entries. */
  time: string;
  /** Date in ISO format (YYYY-MM-DD) for the date label. */
  date: string;
  /** The entry's note (shown under the time); '' hides the line. */
  note: string;
  /** Red amount in the center cell (money given / credit); null hides the cell. */
  give: number | null;
  /** Green amount in the right cell (money received / advance); null hides the cell. */
  receive: number | null;
  /** Running balance after this entry — shown in a green pill. */
  runningBalance?: number;
  /** True when the entry has attachment(s) — shows a paperclip. */
  hasAttachments?: boolean;
  /** When omitted the card is not tappable (opening-balance entries). */
  onPress?: () => void;
};

export function PartyDayEntryCard({
  time,
  date,
  note,
  give,
  receive,
  runningBalance,
  hasAttachments,
  onPress,
}: PartyDayEntryCardProps) {
  const theme = useTheme();
  const timeLabel = formatTimeOfDay(time) || '—';
  const dateLabel = date;

  const row = (
    <View style={styles.row}>
      <View style={[styles.cell, styles.timeCell]}>
        <View style={styles.timeWrap}>
          <ThemedText type="small" style={styles.date} numberOfLines={1}>
            {dateLabel}
          </ThemedText>
          <ThemedText type="small" style={styles.time} numberOfLines={1}>
            {timeLabel}
          </ThemedText>
          {hasAttachments ? <Paperclip size={12} color={theme.textSecondary} /> : null}
        </View>
        {runningBalance != null ? (
          <View style={[styles.balancePill, { backgroundColor: theme.incomeSoft }]}>
            <ThemedText type="smallBold" style={[styles.balanceText, { color: theme.income }]}>
              {formatINR(runningBalance)}
            </ThemedText>
          </View>
        ) : null}
        {note ? (
          <ThemedText
            type="small"
            themeColor="textSecondary"
            numberOfLines={1}
            style={styles.note}>
            {note}
          </ThemedText>
        ) : null}
      </View>

      <View style={[styles.cell, styles.giveCell, styles.divider, { borderLeftColor: theme.border }]}>
        {give != null ? (
          <ThemedText
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            style={[styles.amount, styles.giveAmount, { color: theme.expense }]}>
            {formatINR(give)}
          </ThemedText>
        ) : null}
      </View>

      <View style={[styles.cell, styles.receiveCell, styles.divider, { borderLeftColor: theme.border }]}>
        {receive != null ? (
          <ThemedText
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            style={[styles.amount, styles.receiveAmount, { color: theme.income }]}>
            {formatINR(receive)}
          </ThemedText>
        ) : null}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <Card style={styles.card} pad={false}>
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}>
          {row}
        </Pressable>
      </Card>
    );
  }
  return (
    <Card style={styles.card} pad={false}>
      {row}
    </Card>
  );
}

const styles = StyleSheet.create({
  // A soft shadow lifts each entry card off the background — the hairline
  // border alone reads too faint against `theme.background`. No overflow:hidden
  // (it would clip the iOS shadow); the cells paint no background so nothing
  // pokes past the rounded corners.
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  pressable: {
    flex: 1,
  },
  pressed: {
    opacity: 0.7,
  },
  // Horizontal padding lives on the row (not the cells) so a right-aligned
  // Receive amount can never touch the card's physical edge, and the Give /
  // Receive columns line up with the daily header row above (same padding).
  row: {
    flexDirection: 'row',
    minHeight: 64,
    paddingHorizontal: Spacing.three,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.two,
  },
  // Time/Note gets extra width (2) vs the equal Give/Receive columns (1),
  // and its text hugs the left edge of the column.
  timeCell: {
    flex: 2,
    alignItems: 'flex-start',
  },
  giveCell: {
    flex: 1,
  },
  receiveCell: {
    flex: 1,
    alignItems: 'flex-end',
  },
  divider: {
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  time: {
    fontFamily: InterFonts.semibold,
  },
  timeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  note: {
    fontSize: 12,
    lineHeight: 16,
    maxWidth: 170,
  },
  date: {
    fontFamily: InterFonts.medium,
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 1,
  },
  balancePill: {
    borderRadius: 8,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    marginTop: Spacing.half,
    alignSelf: 'flex-start',
  },
  balanceText: {
    fontSize: 11,
    lineHeight: 14,
  },
  amount: {
    fontFamily: InterFonts.semibold,
    fontSize: 15,
  },
  giveAmount: {
    textAlign: 'center',
  },
  receiveAmount: {
    textAlign: 'right',
  },
});
