/** Large rupee amount input with a live formatted preview. */
import { StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { InterFonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatINR } from '@/utils/format';

type AmountInputProps = {
  value: string;
  onChangeText: (value: string) => void;
};

export function AmountInput({ value, onChangeText }: AmountInputProps) {
  const theme = useTheme();

  const handleChange = (text: string) => {
    onChangeText(text.replace(/[^0-9]/g, ''));
  };

  const preview = value ? formatINR(parseFloat(value)) : 'Enter amount';

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.row,
          { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        ]}>
        <ThemedText themeColor="textSecondary" style={styles.currency}>
          ₹
        </ThemedText>
        <TextInput
          value={value}
          onChangeText={handleChange}
          keyboardType="number-pad"
          placeholder="0"
          placeholderTextColor={theme.textSecondary}
          accessibilityLabel="Amount in rupees"
          maxLength={12}
          style={[styles.input, { color: theme.text }]}
        />
      </View>
      <ThemedText themeColor="textSecondary" style={styles.preview}>
        {preview}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.input,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  currency: {
    fontFamily: InterFonts.semibold,
    fontSize: 28,
    marginRight: Spacing.two,
  },
  input: {
    flex: 1,
    fontFamily: InterFonts.semibold,
    fontSize: 30,
    paddingVertical: Spacing.two,
  },
  preview: {
    fontFamily: InterFonts.regular,
    fontSize: 14,
    textAlign: 'center',
  },
});
