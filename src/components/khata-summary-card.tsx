/** Khata headline cards: money to receive, money to pay, net. */
import { HandCoins, Scale, Wallet, type LucideIcon } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { KhataSummary } from '@/types';
import { formatINR } from '@/utils/format';

type KhataSummaryCardProps = {
  summary: KhataSummary;
};

export function KhataSummaryCard({ summary }: KhataSummaryCardProps) {
  const theme = useTheme();
  const netSign = summary.net >= 0 ? '+' : '-';

  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <SummaryColumn
          label="Total Receivable"
          amount={summary.receivable}
          icon={HandCoins}
          color={theme.income}
        />
        <SummaryColumn
          label="Total Payable"
          amount={summary.payable}
          icon={Wallet}
          color={theme.expense}
        />
        <SummaryColumn
          label="Net Balance"
          amount={summary.net}
          icon={Scale}
          color={theme.info}
          sign={netSign}
        />
      </View>
    </Card>
  );
}

function SummaryColumn({
  label,
  amount,
  icon: Icon,
  color,
  sign,
}: {
  label: string;
  amount: number;
  icon: LucideIcon;
  color: string;
  sign?: string;
}) {
  return (
    <View style={styles.column}>
      <Icon size={20} color={color} strokeWidth={2.2} />
      <ThemedText
        type="small"
        themeColor="textSecondary"
        numberOfLines={1}
        style={styles.label}>
        {label}
      </ThemedText>
      <Text
        style={[styles.amount, { color }]}
        numberOfLines={1}
        ellipsizeMode="tail">
        {sign ? `${sign}${formatINR(Math.abs(amount))}` : formatINR(amount)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  column: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.half,
    minWidth: 0,
  },
  label: {
    textAlign: 'center',
    flexShrink: 1,
    minWidth: 0,
  },
  amount: {
    fontSize: 18,
    fontFamily: 'Inter_600SemiBold',
    flexShrink: 1,
    minWidth: 0,
    textAlign: 'center',
  },
});
