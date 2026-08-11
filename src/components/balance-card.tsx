/** Compact card showing a balance (used for Total, Cash, Bank). */
import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { FitText } from '@/components/fit-text';
import { ThemedText } from '@/components/themed-text';
import { InterFonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatINR } from '@/utils/format';

type BalanceCardProps = {
  label: string;
  amount: number;
  icon: LucideIcon;
  accent?: string;
};

export function BalanceCard({ label, amount, icon: Icon, accent }: BalanceCardProps) {
  const theme = useTheme();
  // Default color is sign-aware: a negative balance is an overdraft (expense
  // red), not money in hand. Pass `accent` to force a fixed color.
  const color = accent ?? (amount < 0 ? theme.expense : theme.primary);

  return (
    <Card style={styles.card}>
      <View style={[styles.icon, { backgroundColor: theme.backgroundElement }]}>
        <Icon size={22} color={color} />
      </View>
      <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
        {label}
      </ThemedText>
      <FitText fontSize={22} style={[styles.amount, { color }]}>
        {formatINR(amount)}
      </FitText>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.one,
    flex: 1,
    minWidth: 0,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
    flexShrink: 0,
  },
  label: {
    flexShrink: 1,
    minWidth: 0,
  },
  amount: {
    fontFamily: InterFonts.bold,
    fontSize: 22,
  },
});
