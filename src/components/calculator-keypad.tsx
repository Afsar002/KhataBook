/**
 * Custom on-screen calculator keypad.
 * 5-row grid with tall + (spans 2 rows on right) and wide = (spans 2 cols on bottom):
 * C × ÷ ⌫
 * 7 8 9 -
 * 4 5 6 +
 * 1 2 3 +
 * 0 . = =
 * Single + button spans 2 rows vertically on right; single = button spans 2 columns horizontally on bottom.
 * 0 is 1.5x wide, . is 0.5x wide
 * Last row is 1.2x height
 *
 * Layout math (no container `gap` anywhere — all spacing is per-item):
 * - HALF_GAP (H) is applied as:
 *   • container padding = H (outer gaps become 2H after the item's own margin)
 *   • key marginHorizontal = H (gaps between keys = 2H)
 *   • row paddingVertical = H (gaps between rows = 2H)
 * - topSection (flex 4) holds Row1 (1), Row2 (1), bottomTwoRows (2) → each row is
 *   exactly 1/4 of topSection. No gap means no flex-space loss, so Row3/Row4 are
 *   mathematically identical in height to Row1/Row2.
 * - bottomTwoRows splits horizontally leftGrid (flex 3) + plusCol (flex 1).
 *   plusCol is a marginless wrapper so the split is exactly 3/4 : 1/4; the + sits
 *   inside with its own margins, making its visible width equal a regular key's.
 */
import { Delete } from 'lucide-react-native';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { InterFonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type CalculatorKeypadProps = {
  /** Called when a key is pressed. Key values: '0'-'9', '.', '+', '-', '×', '÷', '=', 'C', 'backspace' */
  onKeyPress: (key: string) => void;
  /** Disable all keys */
  disabled?: boolean;
};

/** Half of the 20%-scaled spacing token — the atom used for every margin/padding. */
const HALF_GAP = Math.round((Spacing.two * 1.2) / 2);

export function CalculatorKeypad({ onKeyPress, disabled = false }: CalculatorKeypadProps) {
  const theme = useTheme();

  const handlePress = (key: string) => {
    if (!disabled) {
      onKeyPress(key);
    }
  };

  const renderKey = (key: string, isOperator: boolean, isAction: boolean, isWide = false, isZero = false, isDot = false) => {
    let content: React.ReactNode;
    if (key === 'backspace') {
      content = <Delete size={22} color={isAction ? theme.text : theme.primary} />;
    } else {
      content = (
        <ThemedText
          type={isOperator || isAction ? 'default' : 'title'}
          style={{
            fontSize: 24,
            lineHeight: 32,
            fontFamily: (isOperator || isAction) ? InterFonts.semibold : InterFonts.bold,
            color: isOperator ? theme.primary : isAction ? theme.textSecondary : theme.text,
          } as const}
        >
          {key}
        </ThemedText>
      );
    }

    const baseStyles = [styles.key] as const;
    const conditionalStyles = [
      isZero ? styles.keyZero : null,
      isDot ? styles.keyDot : null,
      isWide ? styles.keyWideEquals : null,
    ].filter((s): s is ViewStyle => s !== null);

    return (
      <Pressable
        key={key}
        onPress={() => handlePress(key)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={key === 'backspace' ? 'Backspace' : key === '×' ? 'Multiply' : key === '÷' ? 'Divide' : key}
        style={({ pressed }) => [
          ...baseStyles,
          ...conditionalStyles,
          (pressed || disabled) ? styles.keyPressed : null,
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
      {/* Top 4 rows */}
      <View style={styles.topSection}>
        {/* Row 1: C × ÷ ⌫ */}
        <View style={styles.row}>
          {renderKey('C', false, true)}
          {renderKey('×', true, false)}
          {renderKey('÷', true, false)}
          {renderKey('backspace', false, true)}
        </View>
        {/* Row 2: 7 8 9 - */}
        <View style={styles.row}>
          {renderKey('7', false, false)}
          {renderKey('8', false, false)}
          {renderKey('9', false, false)}
          {renderKey('-', true, false)}
        </View>
        {/* Rows 3-4: left grid (2 rows × 3 cols) + right column (tall +) */}
        <View style={styles.bottomTwoRows}>
          {/* Left grid: 2 rows × 3 columns — same row style as Rows 1-2 */}
          <View style={styles.leftGrid}>
            {/* Row 3: 4 5 6 */}
            <View style={styles.row}>
              {renderKey('4', false, false)}
              {renderKey('5', false, false)}
              {renderKey('6', false, false)}
            </View>
            {/* Row 4: 1 2 3 */}
            <View style={styles.row}>
              {renderKey('1', false, false)}
              {renderKey('2', false, false)}
              {renderKey('3', false, false)}
            </View>
          </View>
          {/* Right column wrapper (marginless flex 1 = exactly 1/4 width) */}
          <View style={styles.plusCol}>
            {/* Tall + spans both rows */}
            <Pressable
              onPress={() => handlePress('+')}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel="Add"
              style={[
                styles.tallPlus,
                { backgroundColor: disabled ? theme.backgroundElement : theme.card },
              ]}
              hitSlop={4}
            >
              <View style={styles.keyContent}>
                <ThemedText
                  type="default"
                  style={{
                    fontSize: 24,
                    lineHeight: 32,
                    fontFamily: InterFonts.semibold,
                    color: theme.primary,
                  } as const}
                >
                  +
                </ThemedText>
              </View>
            </Pressable>
          </View>
        </View>
      </View>

      {/* Last row: 0 . = (0=1.5x, .=0.5x, = fills rest) - 1.2x height */}
      <View style={styles.lastRow}>
        {renderKey('0', false, false, false, true)}
        {renderKey('.', false, false, false, false, true)}
        {renderKey('=', true, false, true)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create<{
  container: ViewStyle;
  topSection: ViewStyle;
  bottomTwoRows: ViewStyle;
  leftGrid: ViewStyle;
  plusCol: ViewStyle;
  row: ViewStyle;
  lastRow: ViewStyle;
  key: ViewStyle;
  keyZero: ViewStyle;
  keyDot: ViewStyle;
  keyWideEquals: ViewStyle;
  keyContent: ViewStyle;
  keyPressed: ViewStyle;
  tallPlus: ViewStyle;
}>({
  // Outer padding = HALF_GAP. Combined with each item's own margin, the visible
  // gap at the keypad edges equals the gap between keys (2 × HALF_GAP).
  container: {
    flex: 1,
    paddingHorizontal: HALF_GAP,
    paddingTop: HALF_GAP,
    paddingBottom: HALF_GAP,
  },
  // 4 rows worth of height. Children Row1 (1), Row2 (1), bottomTwoRows (2) share
  // it with NO gap, so every row is exactly equal height.
  topSection: {
    flex: 4,
  },
  // 2 rows tall (flex 2 of the 4 in topSection). Splits horizontally 3:1.
  bottomTwoRows: {
    flex: 2,
    flexDirection: 'row',
  },
  // 3 of 4 columns.
  leftGrid: {
    flex: 3,
  },
  // 1 of 4 columns — marginless wrapper so the split is exactly 3/4 : 1/4.
  plusCol: {
    flex: 1,
  },
  // Each row: flex 1 = exactly equal height. Vertical spacing via paddingVertical.
  row: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: HALF_GAP,
  },
  // Last row is 1.2x height of a regular row.
  lastRow: {
    flex: 1.2,
    flexDirection: 'row',
    paddingVertical: HALF_GAP,
  },
  // Keys get only horizontal margins (HALF_GAP). Gap between keys = 2 × HALF_GAP.
  // Vertical inset is provided by the row's paddingVertical.
  key: {
    flex: 1,
    // Increase border radius by 20%
    borderRadius: Math.round(16 * 1.2),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    marginHorizontal: HALF_GAP,
  },
  keyZero: {
    flex: 1.5, // 0 is 1.5x wide
    marginHorizontal: HALF_GAP,
  },
  keyDot: {
    flex: 0.5, // . is 0.5x wide
    marginHorizontal: HALF_GAP,
  },
  keyWideEquals: {
    flex: 2, // = spans ~2 columns worth
    marginHorizontal: HALF_GAP,
  },
  keyContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyPressed: {
    opacity: 0.6,
  },
  // Tall + : fills plusCol (flex 1 = full 2-row height), inset by paddingVertical
  // so its visible height equals the two rows' keys, and marginHorizontal so its
  // visible width equals a regular key.
  tallPlus: {
    flex: 1,
    borderRadius: Math.round(16 * 1.2),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    marginHorizontal: HALF_GAP,
    paddingVertical: HALF_GAP,
  },
});