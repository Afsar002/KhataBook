/** A single customer / supplier row with its balance. */
import { memo } from 'react';
import { Store, UserRound } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { InterFonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { PartyBalance } from '@/types';
import { formatINR } from '@/utils/format';
import { isPartyReceivable, partyBalanceLabel } from '@/utils/balance';
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
        <ThemedText style={styles.name} numberOfLines={1}>
          {item.name}
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.sub} numberOfLines={1}>
          {partyBalanceLabel(item.type, item.balance)}
        </ThemedText>
      </View>
      <ThemedText
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        style={[styles.amount, { color: amountColor }]}>
        {formatINR(Math.abs(item.balance))}
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
    fontSize: 14,
    marginTop: 1,
  },
  amount: {
    fontFamily: InterFonts.semibold,
    fontSize: 18,
    // Right-aligned and shrinkable so a large balance truncates/shrinks instead
    // of bleeding past the row's right edge.
    textAlign: 'right',
    flexShrink: 1,
  },
});

export const PartyItem = memo(PartyItemRow);
