/** Search text input used to filter lists. */
import { Search } from 'lucide-react-native';
import { StyleSheet, TextInput, View } from 'react-native';

import { InterFonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type SearchInputProps = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  /** Focus the input on mount (used by the global search screen). */
  autoFocus?: boolean;
};

export function SearchInput({
  value,
  onChangeText,
  placeholder = 'Search…',
  autoFocus = false,
}: SearchInputProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.row,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
      ]}>
      <Search size={18} color={theme.textSecondary} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        accessibilityLabel="Search"
        autoCorrect={false}
        autoFocus={autoFocus}
        style={[styles.input, { color: theme.text }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Radius.input,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    minHeight: 48,
  },
  input: {
    flex: 1,
    fontFamily: InterFonts.medium,
    fontSize: 16,
    paddingVertical: Spacing.two,
  },
});
