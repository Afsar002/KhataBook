/** Horizontal row of category chips for income/expense. */
import { ScrollView, StyleSheet } from 'react-native';

import { Chip } from '@/components/chip';
import { CategoryIcon } from '@/components/category-icon';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Category } from '@/types';

type CategoryPickerProps = {
  categories: Category[];
  selectedId: number | null;
  onSelect: (id: number) => void;
};

export function CategoryPicker({ categories, selectedId, onSelect }: CategoryPickerProps) {
  const theme = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      keyboardShouldPersistTaps="handled">
      {categories.map((category) => {
        const selected = category.id === selectedId;
        return (
          <Chip
            key={category.id}
            label={category.name}
            selected={selected}
            onPress={() => onSelect(category.id)}
            icon={
              <CategoryIcon
                name={category.icon}
                size={18}
                color={selected ? '#FFFFFF' : theme.text}
              />
            }
          />
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: Spacing.two,
    paddingVertical: Spacing.half,
  },
});
