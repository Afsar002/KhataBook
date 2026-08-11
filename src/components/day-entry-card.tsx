/**
 * One transaction in the Cashbook's 3-column list: Time (+ optional grey
 * category pill) | Withdraw | Deposit, split by faint vertical dividers.
 */
import { Paperclip } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { InterFonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatINR, formatTimeOfDay } from '@/utils/format';

type DayEntryCardProps = {
  /** `HH:MM` (24-hour); '' for opening-balance entries. */
  time: string;
  /** Optional grey pill label (the entry's category name). */
  pill?: string;
  /** Red amount shown in the middle cell; null hides the cell. */
  withdraw: number | null;
  /** Green amount shown in the right cell; null hides the cell. */
  deposit: number | null;
  /** True when the entry has attachment(s) — shows a paperclip. */
  hasAttachments?: boolean;
  /** When omitted the card is not tappable (opening-balance entries). */
  onPress?: () => void;
};

export function DayEntryCard({
  time,
  pill,
  withdraw,
  deposit,
  hasAttachments,
  onPress,
}: DayEntryCardProps) {
  const theme = useTheme();
  const timeLabel = formatTimeOfDay(time) || '—';

  const row = (
    <View style={styles.row}>
      <View style={[styles.cell, styles.timeCell]}>
        <View style={styles.timeWrap}>
          <ThemedText type="small" style={styles.time} numberOfLines={1}>
            {timeLabel}
          </ThemedText>
          {hasAttachments ? (
            <Paperclip size={12} color={theme.textSecondary} />
          ) : null}
        </View>
        {pill ? (
          <View style={[styles.pill, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.pillText}>
              {pill}
            </ThemedText>
          </View>
        ) : null}
      </View>

      <View style={[styles.cell, styles.withdrawCell, styles.divider, { borderLeftColor: theme.border }]}>
        {withdraw != null ? (
          <ThemedText
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            style={[styles.amount, styles.withdrawAmount, { color: theme.expense }]}>
            {formatINR(withdraw)}
          </ThemedText>
        ) : null}
      </View>

      <View style={[styles.cell, styles.depositCell, styles.divider, { borderLeftColor: theme.border }]}>
        {deposit != null ? (
          <ThemedText
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            style={[styles.amount, styles.depositAmount, { color: theme.income }]}>
            {formatINR(deposit)}
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
  // Deposit amount can never touch the card's physical edge, and the Withdraw /
  // Deposit columns line up with the header row above (same padding).
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
  // Time/Tag gets extra width (2) vs the equal Withdraw/Deposit columns (1),
  // and its text (time + pill) hugs the left edge of the column.
  timeCell: {
    flex: 2,
    alignItems: 'flex-start',
  },
  withdrawCell: {
    flex: 1,
  },
  depositCell: {
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
  pill: {
    borderRadius: Radius.chip,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
  pillText: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: InterFonts.medium,
    maxWidth: 140,
  },
  amount: {
    fontFamily: InterFonts.semibold,
    fontSize: 15,
  },
  withdrawAmount: {
    textAlign: 'center',
  },
  depositAmount: {
    textAlign: 'right',
  },
});
