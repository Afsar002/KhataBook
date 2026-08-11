/** Labeled text input, optionally with a trailing icon inside the field. */
import type { ReactNode } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { InterFonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type TextFieldProps = TextInputProps & {
  label?: string;
  /** Trailing element pinned to the input's right edge (e.g. an attachment icon). */
  rightIcon?: ReactNode;
};

export function TextField({ label, rightIcon, style, ...rest }: TextFieldProps) {
  const theme = useTheme();

  return (
    <View style={styles.wrap}>
      {label ? (
        <ThemedText type="smallBold" themeColor="textSecondary">
          {label}
        </ThemedText>
      ) : null}
      <View style={styles.inputWrap}>
        <TextInput
          placeholderTextColor={theme.textSecondary}
          style={[
            styles.input,
            rightIcon ? styles.inputWithIcon : null,
            {
              color: theme.text,
              backgroundColor: theme.backgroundElement,
              borderColor: theme.border,
            },
            style,
          ]}
          {...rest}
        />
        {rightIcon ? <View style={styles.rightIcon}>{rightIcon}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.two,
  },
  inputWrap: {
    position: 'relative',
  },
  input: {
    fontFamily: InterFonts.medium,
    fontSize: 16,
    borderWidth: 1,
    borderRadius: Radius.input,
    paddingHorizontal: Spacing.three,
    minHeight: 48,
  },
  // Extra right padding so typed text never runs under the trailing icon.
  inputWithIcon: {
    paddingRight: Spacing.six,
  },
  rightIcon: {
    position: 'absolute',
    right: Spacing.two,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
});
