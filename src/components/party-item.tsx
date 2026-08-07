/** A single customer / supplier row with its balance. */
import { memo } from 'react';
import { Store, UserRound } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { InterFonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { PartyBalance } from '@/types';
import { formatINR } from '@/utils/format';
import { isPartyReceivable, partyBalanceLabel } from '@/utils/party';
import { impact } from '@/utils/haptics';

type PartyItemProps = {
  item: PartyBalance;
  onPress: (item: PartyBalance) => void;
};

function PartyItemRow({ item, onPress }: PartyItemProps) {
  const theme = useTheme();
  const Icon = item.type === 'customer' ? UserRound : Store;

  const receivable = isPartyReceivable(item.type, item.balance);
  const amountColor =
    item.balance === 0 ? theme.textSecondary : receivable ? theme.income : theme.expense;

  return (
    <Pressable
      onPress={() => {
        impact('light');
        onPress(item);
      }}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${partyBalanceLabel(item.type, item.balance)}`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={[styles.icon, { backgroundColor: theme.backgroundElement }]}>
        <Icon size={22} color={theme.text} />
      </View>
      <View style={styles.middle}>
        <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={[styles.sub, { color: theme.textSecondary }]} numberOfLines={1}>
          {partyBalanceLabel(item.type, item.balance)}
        </Text>
      </View>
      <Text style={[styles.amount, { color: amountColor }]}>
        {formatINR(Math.abs(item.balance))}
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
    fontSize: 14,
    marginTop: 1,
  },
  amount: {
    fontFamily: InterFonts.semibold,
    fontSize: 18,
  },
});

export const PartyItem = memo(PartyItemRow);
