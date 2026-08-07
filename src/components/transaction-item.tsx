/** A single row in a ledger list: income, expense, or a transfer. */
import { memo } from 'react';
import { ArrowLeftRight, TrendingDown, TrendingUp } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CategoryIcon } from '@/components/category-icon';
import { InterFonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { LedgerRow } from '@/types';
import { formatINR } from '@/utils/format';
import { impact } from '@/utils/haptics';

type TransactionItemProps = {
  item: LedgerRow;
  onPress?: (item: LedgerRow) => void;
  onLongPress?: (item: LedgerRow) => void;
};

function TransactionItemRow({ item, onPress, onLongPress }: TransactionItemProps) {
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
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: theme.textSecondary }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      <Text style={[styles.amount, { color: amountColor }]}>
        {sign}
        {formatINR(item.amount)}
      </Text>
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
});

export const TransactionItem = memo(TransactionItemRow);
