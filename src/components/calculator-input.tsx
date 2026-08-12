/**
 * Calculator input with custom on-screen keypad.
 * Mock input (Pressable) — native keyboard NEVER appears.
 * Shows expression + live evaluated result + blinking cursor.
 * Integrates with CalculatorKeypad via onKeyPress.
 * Passes computed value to parent via onChangeAmount.
 * Keypad appears as a full-width bottom sheet covering 40% of the screen
 * height (like a native keyboard). It shows when the amount input is tapped
 * and dismisses when "=" is pressed or the user taps outside the keypad.
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CalculatorKeypad } from '@/components/calculator-keypad';
import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { AnimationDuration, InterFonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { evaluateExpression, formatResult } from '@/utils/calculator';

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
};

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
/** Keypad covers 40% of the screen height. */
const KEYPAD_HEIGHT_RATIO = 0.4;

export function CalculatorInput({
  initialValue = '',
  onKeyPress,
  onChangeAmount,
  placeholder = 'Enter amount',
  accessibilityLabel = 'Calculator amount input',
  disabled = false,
}: CalculatorInputProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [expression, setExpression] = useState(initialValue);
  const [showCursor, setShowCursor] = useState(true);
  const [isFocused, setIsFocused] = useState(false);
  const cursorTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [keypadAnim] = useState(() => new Animated.Value(SCREEN_HEIGHT));
  const keypadVisibleRef = useRef(false);

  const keypadHeight = Math.round(SCREEN_HEIGHT * KEYPAD_HEIGHT_RATIO);

  // Blinking cursor
  useEffect(() => {
    cursorTimerRef.current = setInterval(() => {
      setShowCursor((prev) => !prev);
    }, 530);
    return () => {
      if (cursorTimerRef.current) clearInterval(cursorTimerRef.current);
    };
  }, []);

  // Animate keypad in/out
  const showKeypad = () => {
    if (keypadVisibleRef.current) return;
    keypadVisibleRef.current = true;
    setIsFocused(true);
    Animated.timing(keypadAnim, {
      toValue: 0,
      duration: AnimationDuration,
      useNativeDriver: true,
    }).start();
  };

  const hideKeypad = () => {
    if (!keypadVisibleRef.current) return;
    keypadVisibleRef.current = false;
    Animated.timing(keypadAnim, {
      toValue: SCREEN_HEIGHT,
      duration: AnimationDuration,
      useNativeDriver: true,
    }).start(() => {
      setIsFocused(false);
    });
  };

  const handleFocus = () => {
    if (!disabled) {
      setShowCursor(true);
      if (cursorTimerRef.current) clearInterval(cursorTimerRef.current);
      cursorTimerRef.current = setInterval(() => {
        setShowCursor((prev) => !prev);
      }, 530);
      showKeypad();
    }
  };

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
        hideKeypad();
        return;
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

      {/* Full-width keypad modal — covers 40% of the screen height, dismisses
          on "=" or when tapping outside the keypad. */}
      <Modal
        visible={isFocused}
        transparent
        statusBarTranslucent
        animationType="none"
        onRequestClose={hideKeypad}
      >
        <View style={styles.modalRoot}>
          {/* Backdrop — tap outside the keypad to dismiss */}
          <Pressable
            style={styles.backdrop}
            onPress={hideKeypad}
            accessibilityLabel="Close keypad"
            hitSlop={{ top: 0, left: 0, right: 0, bottom: 0 }}
          />
          {/* Keypad sheet — full width, 40% of screen height */}
          <Animated.View
            style={[
              styles.keypadSheet,
              {
                height: keypadHeight,
                backgroundColor: theme.background,
                transform: [{ translateY: keypadAnim }],
              },
            ]}
          >
            <View style={[styles.keypadHandle, { backgroundColor: theme.border }]} />
            <CalculatorKeypad onKeyPress={handleKeyPress} disabled={disabled} />
            <View style={{ height: insets.bottom }} />
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
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
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent', // Important: allows touch to pass through to keypad
  },
  keypadSheet: {
    width: '100%',
    borderTopLeftRadius: Radius.button,
    borderTopRightRadius: Radius.button,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
    elevation: 10,
    overflow: 'hidden',
  },
  keypadHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: Radius.chip,
    marginTop: Spacing.two,
    marginBottom: Spacing.one,
  },
});