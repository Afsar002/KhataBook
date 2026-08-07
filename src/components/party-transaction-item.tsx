/** A single khata ledger entry. */
import { memo } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { InterFonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { PartyTransaction } from '@/types';
import { formatINR } from '@/utils/format';
import { impact } from '@/utils/haptics';

type PartyTransactionItemProps = {
  item: PartyTransaction;
  actionLabel: string;
  /** Whether this entry increases the party balance (vs. decreases it). */
  increases: boolean;
  onPress?: (item: PartyTransaction) => void;
  onLongPress?: (item: PartyTransaction) => void;
};

function PartyTransactionItemRow({
  item,
  actionLabel,
  increases,
  onPress,
  onLongPress,
}: PartyTransactionItemProps) {
  const theme = useTheme();
  const Icon = increases ? TrendingUp : TrendingDown;
  const color = increases ? theme.income : theme.expense;

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
      accessibilityLabel={`${actionLabel} ${formatINR(item.amount)}`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View
        style={[
          styles.icon,
          { backgroundColor: increases ? theme.incomeSoft : theme.expenseSoft },
        ]}>
        <Icon size={18} color={color} />
      </View>
      <View style={styles.middle}>
        <Text style={[styles.title, { color: theme.text }]}>{actionLabel}</Text>
        {item.note ? (
          <Text style={[styles.sub, { color: theme.textSecondary }]} numberOfLines={1}>
            {item.note}
          </Text>
        ) : null}
      </View>
      <Text style={[styles.amount, { color }]}>
        {increases ? '+' : '-'}
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
  },
  pressed: {
    opacity: 0.6,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  middle: {
    flex: 1,
  },
  title: {
    fontFamily: InterFonts.semibold,
    fontSize: 15,
  },
  sub: {
    fontFamily: InterFonts.regular,
    fontSize: 13,
    marginTop: 1,
  },
  amount: {
    fontFamily: InterFonts.semibold,
    fontSize: 15,
  },
});

export const PartyTransactionItem = memo(PartyTransactionItemRow);
