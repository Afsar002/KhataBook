/**
 * A wrap of selectable category icons, used by the category form to pick a
 * custom icon. The set mirrors the names `CategoryIcon` knows how to render.
 */
import { Pressable, StyleSheet, View } from 'react-native';

import { CategoryIcon } from '@/components/category-icon';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { impact } from '@/utils/haptics';

/** Every icon a category can use (all renderable by `CategoryIcon`). */
export const CATEGORY_ICONS: string[] = [
  'briefcase',
  'store',
  'circle-plus',
  'circle-minus',
  'utensils',
  'car',
  'home',
  'shopping-bag',
  'heart-pulse',
  'tag',
];

type IconPickerProps = {
  value: string;
  onChange: (icon: string) => void;
};

export function IconPicker({ value, onChange }: IconPickerProps) {
  const theme = useTheme();

  return (
    <View style={styles.wrap}>
      {CATEGORY_ICONS.map((name) => {
        const selected = name === value;
        return (
          <Pressable
            key={name}
            onPress={() => {
              if (!selected) {
                impact('light');
                onChange(name);
              }
            }}
            accessibilityRole="button"
            accessibilityLabel={`Icon ${name}`}
            accessibilityState={{ selected }}
            style={[
              styles.icon,
              {
                backgroundColor: selected ? theme.primary : theme.backgroundElement,
                borderColor: selected ? theme.primary : theme.border,
              },
            ]}>
            <CategoryIcon name={name} size={22} color={selected ? '#FFFFFF' : theme.text} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: Radius.chip,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
