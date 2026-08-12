/**
 * Calculator input with custom on-screen keypad.
 * Mock input (Pressable) — native keyboard NEVER appears.
 * Shows expression + live evaluated result + blinking cursor.
 * Integrates with CalculatorKeypad via onKeyPress.
 * Passes computed value to parent via onChangeAmount.
 */
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { InterFonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { evaluateExpression, formatResult } from '@/utils/calculator';
import { CalculatorKeypad } from '@/components/calculator-keypad';

type CalculatorInputProps = {
  /** Initial expression string */
  initialValue?: string;
  /** Called when a key is pressed (for keypad integration) */
  onKeyPress?: (key: string) => void;
  /** Called when = is pressed and expression is evaluated */
  onChangeAmount?: (value: number) => void;
  /** Placeholder when empty */
  placeholder?: string;
  /** Accessibility label */
  accessibilityLabel?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Show the keypad (default: true) */
  showKeypad?: boolean;
};

export function CalculatorInput({
  initialValue = '',
  onKeyPress,
  onChangeAmount,
  placeholder = 'Enter amount',
  accessibilityLabel = 'Calculator amount input',
  disabled = false,
  showKeypad = true,
}: CalculatorInputProps) {
  const theme = useTheme();
  const [expression, setExpression] = useState(initialValue);
  const [showCursor, setShowCursor] = useState(true);
  const cursorTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Blinking cursor
  useEffect(() => {
    cursorTimerRef.current = setInterval(() => {
      setShowCursor((prev) => !prev);
    }, 530);
    return () => {
      if (cursorTimerRef.current) clearInterval(cursorTimerRef.current);
    };
  }, []);

  // Live evaluation
  const liveResult = evaluateExpression(expression);
  const hasValidResult = isFinite(liveResult) && !isNaN(liveResult);

  const handleKeyPress = (key: string) => {
    let newExpression = expression;

    switch (key) {
      case 'C':
        newExpression = '';
        break;
      case 'M+':
      case 'M-':
        // Memory keys - could be extended later
        break;
      case 'backspace':
        newExpression = expression.slice(0, -1);
        break;
      case '=':
        if (hasValidResult) {
          const formatted = formatResult(liveResult);
          setExpression(formatted);
          onChangeAmount?.(liveResult);
        }
        break;
      default:
        // Numbers, operators, decimal
        if (disabled) return;
        // Prevent multiple operators in a row
        const lastChar = expression.slice(-1);
        const isOperator = ['+', '-', '×', '÷'].includes(key);
        if (isOperator && (expression === '' || ['+', '-', '×', '÷'].includes(lastChar))) {
          // Replace last operator if user types another
          if (['+', '-', '×', '÷'].includes(lastChar)) {
            newExpression = expression.slice(0, -1) + key;
          }
          // Don't allow operator as first char (except minus for negative)
          else if (key !== '-') {
            return;
          }
        }
        // Prevent multiple decimals in a number
        if (key === '.') {
          const lastNumberMatch = expression.match(/([0-9]*)$/);
          if (lastNumberMatch && lastNumberMatch[1].includes('.')) {
            return;
          }
        }
        newExpression = expression + key;
        break;
    }

    setExpression(newExpression);
    onKeyPress?.(key);
  };

  const handleFocus = () => {
    if (!disabled) {
      setShowCursor(true);
      if (cursorTimerRef.current) clearInterval(cursorTimerRef.current);
      cursorTimerRef.current = setInterval(() => {
        setShowCursor((prev) => !prev);
      }, 530);
    }
  };

  const displayExpression = expression || placeholder;

  return (
    <View style={styles.wrap} accessibilityLabel={accessibilityLabel}>
      <Card style={[styles.inputCard, { backgroundColor: theme.card }]} pad={false}>
        <Pressable
          onPress={handleFocus}
          disabled={disabled}
          accessibilityRole="none"
          accessibilityLabel={accessibilityLabel}
          style={({ pressed }) => [
            styles.inputArea,
            pressed && { opacity: 0.8 },
            disabled && { opacity: 0.5 },
          ]}
          hitSlop={8}
        >
          <View style={styles.expressionRow}>
            <ThemedText
              type="title"
              style={[
                styles.expressionText,
                { color: expression ? theme.text : theme.textSecondary },
                { fontFamily: InterFonts.bold },
              ]}
              numberOfLines={1}
            >
              {displayExpression}
              {expression && showCursor && <ThemedText style={styles.cursor} themeColor="primary">|</ThemedText>}
            </ThemedText>
          </View>

          {hasValidResult && expression && (
            <ThemedText
              type="small"
              themeColor="textSecondary"
              style={styles.resultText}
              numberOfLines={1}
            >
              = {formatResult(liveResult)}
            </ThemedText>
          )}

          {!hasValidResult && expression && (
            <ThemedText type="small" themeColor="expense" style={styles.resultText} numberOfLines={1}>
              Invalid expression
            </ThemedText>
          )}
        </Pressable>
      </Card>

      {showKeypad && (
        <CalculatorKeypad onKeyPress={handleKeyPress} disabled={disabled} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.three,
    width: '100%',
  },
  inputCard: {
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  inputArea: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    minHeight: 90,
    justifyContent: 'center',
  },
  expressionRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.one,
  },
  expressionText: {
    fontSize: 36,
    lineHeight: 44,
    flex: 1,
  },
  cursor: {
    fontSize: 36,
    lineHeight: 44,
    fontFamily: InterFonts.bold,
  },
  resultText: {
    marginTop: Spacing.one,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: InterFonts.medium,
  },
});