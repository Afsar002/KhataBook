/**
 * Custom on-screen calculator keypad.
 * 5-row grid: C M+ M- ⌫ / 7 8 9 ÷ / 4 5 6 × / 1 2 3 - / 0 . = +
 * Uses Card + ThemedText, 16px border radius, 8px grid spacing.
 * Operators (+ - × ÷ =) use primary theme color.
 */
import { Delete } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { InterFonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type CalculatorKeypadProps = {
  /** Called when a key is pressed. Key values: '0'-'9', '.', '+', '-', '×', '÷', '=', 'C', 'M+', 'M-', 'backspace' */
  onKeyPress: (key: string) => void;
  /** Disable all keys */
  disabled?: boolean;
};

const KEY_ROWS: string[][] = [
  ['C', 'M+', 'M-', 'backspace'],
  ['7', '8', '9', '÷'],
  ['4', '5', '6', '×'],
  ['1', '2', '3', '-'],
  ['0', '.', '=', '+'],
];

const OPERATOR_KEYS = new Set(['+', '-', '×', '÷', '=']);
const ACTION_KEYS = new Set(['C', 'M+', 'M-', 'backspace']);

export function CalculatorKeypad({ onKeyPress, disabled = false }: CalculatorKeypadProps) {
  const theme = useTheme();

  const handlePress = (key: string) => {
    if (!disabled) {
      onKeyPress(key);
    }
  };

  const renderKey = (key: string, rowIndex: number, colIndex: number) => {
    const isOperator = OPERATOR_KEYS.has(key);
    const isAction = ACTION_KEYS.has(key);
    const isZero = key === '0';

    let content: React.ReactNode;
    if (key === 'backspace') {
      content = <Delete size={22} color={isAction ? theme.text : theme.primary} />;
    } else {
      content = (
        <ThemedText
          type={isOperator || isAction ? 'default' : 'title'}
          style={[
            styles.keyText,
            { color: isOperator ? theme.primary : isAction ? theme.textSecondary : theme.text },
            { fontFamily: isOperator || isAction ? InterFonts.semibold : InterFonts.bold },
          ]}
        >
          {key}
        </ThemedText>
      );
    }

    return (
      <Pressable
        key={`${rowIndex}-${colIndex}`}
        onPress={() => handlePress(key)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={key === 'backspace' ? 'Backspace' : key === '×' ? 'Multiply' : key === '÷' ? 'Divide' : key}
        style={({ pressed }) => [
          styles.key,
          isZero && styles.keyZero,
          (pressed || disabled) && styles.keyPressed,
          { backgroundColor: disabled ? theme.backgroundElement : theme.card },
        ]}
        hitSlop={4}
      >
        <View style={styles.keyContent}>{content}</View>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      {KEY_ROWS.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {row.map((key, colIndex) => renderKey(key, rowIndex, colIndex))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.two,
  },
  key: {
    flex: 1,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyZero: {
    flex: 2,
  },
  keyContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyPressed: {
    opacity: 0.6,
  },
  keyText: {
    fontSize: 24,
    lineHeight: 32,
  },
});