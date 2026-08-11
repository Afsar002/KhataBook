/**
 * One-line text that auto-shrinks to fit its container — never ellipsizes.
 *
 * The scale is computed from the measured container width and a generous
 * per-character estimate, so it behaves identically on iOS, Android and web
 * (RN Web has no `adjustsFontSizeToFit`). `adjustsFontSizeToFit` is kept on as
 * an iOS safety net, and `maxFontSizeMultiplier` stops a large system font
 * scale from blowing the number out of its container.
 */
import { useState } from 'react';
import { StyleSheet, Text, View, type TextProps } from 'react-native';

type FitTextProps = Omit<TextProps, 'children'> & {
  /** Maximum font size — used whenever the text fits at full size. */
  fontSize: number;
  /** Smallest the font may shrink to. Defaults to ~55% of `fontSize` (floor 12). */
  minFontSize?: number;
  children: string;
};

/** Estimated average glyph width (Inter digits + ₹ , - +) as a fraction of em. */
const CHAR_WIDTH_FACTOR = 0.62;
/** Ceiling on device font scaling so these numbers always fit their container. */
const MAX_FONT_SCALE = 1.3;

export function FitText({ fontSize, minFontSize, children, style, ...rest }: FitTextProps) {
  const [availableWidth, setAvailableWidth] = useState(0);

  const minSize = Math.max(minFontSize ?? Math.round(fontSize * 0.55), 12);

  let fittedSize = fontSize;
  if (availableWidth > 0) {
    const estimated = children.length * fontSize * CHAR_WIDTH_FACTOR;
    if (estimated > availableWidth) {
      const scaled = availableWidth / (children.length * CHAR_WIDTH_FACTOR);
      fittedSize = Math.max(minSize, Math.floor(scaled));
    }
  }

  return (
    <View
      onLayout={(event) => {
        const width = event.nativeEvent.layout.width;
        setAvailableWidth((prev) => (Math.abs(prev - width) < 1 ? prev : width));
      }}
      style={styles.wrapper}>
      <Text
        numberOfLines={1}
        ellipsizeMode="clip"
        adjustsFontSizeToFit
        minimumFontScale={minSize / fontSize}
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        style={[style, { fontSize: fittedSize }]}
        {...rest}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignSelf: 'stretch',
  },
});
