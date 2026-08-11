/** A single row in a ledger list: income, expense, or a transfer. */
import { memo } from 'react';
import { ArrowLeftRight, Paperclip, TrendingDown, TrendingUp } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { CategoryIcon } from '@/components/category-icon';
import { ThemedText } from '@/components/themed-text';
import { InterFonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { LedgerRow } from '@/types';
import { formatINR, formatISOToDisplay, formatTimeOfDay } from '@/utils/format';
import { impact } from '@/utils/haptics';

type TransactionItemProps = {
  item: LedgerRow;
  onPress?: (item: LedgerRow) => void;
  onLongPress?: (item: LedgerRow) => void;
  /** Show the transaction date under the amount. Defaults to true (History
   *  already groups rows by date, so it opts out). */
  showDate?: boolean;
};

function TransactionItemRow({ item, onPress, onLongPress, showDate = true }: TransactionItemProps) {
  const theme = useTheme();
  const isTransfer = item.kind === 'transfer';
  const isOpening = item.entryKind === 'opening';

  const amountColor = isOpening
    ? theme.text
    : isTransfer
      ? theme.text
      : item.kind === 'income'
        ? theme.income
        : theme.expense;
  const sign = isOpening || isTransfer ? '' : item.kind === 'income' ? '+' : '-';
  const Icon = isOpening
    ? TrendingUp
    : isTransfer
      ? ArrowLeftRight
      : item.kind === 'income'
        ? TrendingUp
        : TrendingDown;

  const title = isOpening
    ? 'Opening Balance'
    : isTransfer
      ? `${item.fromAccountName ?? ''} → ${item.toAccountName ?? ''}`
      : item.categoryName ?? item.accountName ?? '';
  const subtitle = isOpening
    ? item.accountName ?? ''
    : item.note || (isTransfer ? '' : item.accountName ?? '');

  return (
    <Pressable
      onPress={() => {
        impact('light');
        onPress?.(item);
      }}
      onLongPress={() => {
        impact('light');
        onLongPress?.(item);
      }}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${sign}${item.amount}`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View
        style={[
          styles.icon,
          {
            backgroundColor: isTransfer
              ? theme.backgroundElement
              : item.kind === 'income'
                ? theme.incomeSoft
                : theme.expenseSoft,
          },
        ]}>
        {!isTransfer && item.categoryIcon ? (
          <CategoryIcon name={item.categoryIcon} size={20} color={amountColor} />
        ) : (
          <Icon size={20} color={amountColor} />
        )}
      </View>

      <View style={styles.middle}>
        <ThemedText style={styles.title} numberOfLines={1}>
          {title}
        </ThemedText>
        {subtitle ? (
          <ThemedText themeColor="textSecondary" style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </ThemedText>
        ) : null}
      </View>

      <View style={styles.amountWrap}>
        <ThemedText
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          style={[styles.amount, { color: amountColor }]}>
          {sign}
          {formatINR(item.amount)}
        </ThemedText>
        {showDate ? (
          <View style={styles.dateWrap}>
            <ThemedText themeColor="textSecondary" style={styles.date} numberOfLines={1}>
              {formatISOToDisplay(item.date)}
              {item.time ? ` · ${formatTimeOfDay(item.time)}` : ''}
            </ThemedText>
            {item.hasAttachments ? (
              <Paperclip size={11} color={theme.textSecondary} />
            ) : null}
          </View>
        ) : item.time ? (
          // History groups rows by day, so just the time is enough there.
          <View style={styles.dateWrap}>
            <ThemedText themeColor="textSecondary" style={styles.date} numberOfLines={1}>
              {formatTimeOfDay(item.time)}
            </ThemedText>
            {item.hasAttachments ? (
              <Paperclip size={11} color={theme.textSecondary} />
            ) : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  pressed: {
    opacity: 0.6,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  middle: {
    flex: 1,
  },
  title: {
    fontFamily: InterFonts.semibold,
    fontSize: 17,
  },
  subtitle: {
    fontFamily: InterFonts.regular,
    fontSize: 13,
    marginTop: 1,
  },
  amount: {
    fontFamily: InterFonts.semibold,
    fontSize: 18,
  },
  amountWrap: {
    alignItems: 'flex-end',
    // Let the amount column compress (and the text shrink/truncate) instead of
    // bleeding past the card's right edge when the figure is very large.
    flexShrink: 1,
  },
  date: {
    fontFamily: InterFonts.regular,
    fontSize: 12,
    marginTop: 2,
  },
  dateWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    justifyContent: 'flex-end',
  },
});

export const TransactionItem = memo(TransactionItemRow);
