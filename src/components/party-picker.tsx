/** Row of chips to pick a party (customer/supplier). */
import { Users, Factory, type LucideIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Chip } from '@/components/chip';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { PartyBalance, PartyType } from '@/types';

const PARTY_ICONS: Record<PartyType, LucideIcon> = {
  customer: Users,
  supplier: Factory,
};

type PartyPickerProps = {
  parties: PartyBalance[];
  selectedId: number | null;
  onSelect: (id: number) => void;
};

export function PartyPicker({ parties, selectedId, onSelect }: PartyPickerProps) {
  const theme = useTheme();

  if (parties.length === 0) {
    return null;
  }

  return (
    <View style={styles.row}>
      {parties.map((party) => {
        const selected = party.id === selectedId;
        const Icon = PARTY_ICONS[party.type];
        return (
          <Chip
            key={party.id}
            label={party.name}
            selected={selected}
            onPress={() => onSelect(party.id)}
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