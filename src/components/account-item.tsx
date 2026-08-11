/** A single account row (name, type, running balance). */
import { Banknote, Landmark, Wallet, type LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { InterFonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { AccountBalance, AccountType } from '@/types';
import { formatINR } from '@/utils/format';
import { impact } from '@/utils/haptics';

const ACCOUNT_ICONS: Record<AccountType, LucideIcon> = {
  cash: Banknote,
  bank: Landmark,
  wallet: Wallet,
};

const ACCOUNT_LABELS: Record<AccountType, string> = {
  cash: 'Cash',
  bank: 'Bank',
  wallet: 'Wallet',
};

type AccountItemProps = {
  item: AccountBalance;
  onPress: () => void;
};

export function AccountItem({ item, onPress }: AccountItemProps) {
  const theme = useTheme();
  const Icon = ACCOUNT_ICONS[item.type];

  return (
    <Pressable
      onPress={() => {
        impact('light');
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, balance ${formatINR(item.balance)}`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={[styles.icon, { backgroundColor: theme.backgroundElement }]}>
        <Icon size={22} color={theme.text} />
      </View>
      <View style={styles.middle}>
        <ThemedText style={styles.name} numberOfLines={1}>
          {item.name}
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.sub} numberOfLines={1}>
          {ACCOUNT_LABELS[item.type]}
        </ThemedText>
      </View>
      <ThemedText
        style={[styles.amount, { color: item.balance < 0 ? theme.expense : theme.text }]}>
        {formatINR(item.balance)}
      </ThemedText>
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
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  middle: {
    flex: 1,
  },
  name: {
    fontFamily: InterFonts.semibold,
    fontSize: 17,
  },
  sub: {
    fontFamily: InterFonts.regular,
    fontSize: 13,
    marginTop: 1,
  },
  amount: {
    fontFamily: InterFonts.semibold,
    fontSize: 18,
  },
});
