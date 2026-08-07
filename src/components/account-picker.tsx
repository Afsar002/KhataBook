/** Row of chips to pick which account (Cash / Bank / Wallet) an entry belongs to. */
import { Banknote, Landmark, Wallet, type LucideIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Chip } from '@/components/chip';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Account, AccountType } from '@/types';

const ACCOUNT_ICONS: Record<AccountType, LucideIcon> = {
  cash: Banknote,
  bank: Landmark,
  wallet: Wallet,
};

type AccountPickerProps = {
  accounts: Account[];
  selectedId: number | null;
  onSelect: (id: number) => void;
};

export function AccountPicker({ accounts, selectedId, onSelect }: AccountPickerProps) {
  const theme = useTheme();

  if (accounts.length === 0) {
    return null;
  }

  return (
    <View style={styles.row}>
      {accounts.map((account) => {
        const selected = account.id === selectedId;
        const Icon = ACCOUNT_ICONS[account.type];
        return (
          <Chip
            key={account.id}
            label={account.name}
            selected={selected}
            onPress={() => onSelect(account.id)}
            icon={<Icon size={18} color={selected ? '#FFFFFF' : theme.text} />}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
