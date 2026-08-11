/**
 * Export Options — DailyKhata-styled bottom sheet shown before generating or
 * sharing a PDF.
 *
 * The option list is data-driven: pass an array of `ExportOptionSpec` and the
 * sheet renders one checkbox row per option. Adding a future option (Include
 * Notes, Include Phone Number, Date Range, Theme, Business Details…) is just
 * another entry in the array — no redesign needed.
 *
 *   <ExportOptionsSheet
 *     visible={open}
 *     options={[
 *       { key: 'entryDetails', label: 'Include Transaction Descriptions', hint: 'Show what each entry was for' },
 *       { key: 'notes', label: 'Include Notes', hint: 'Extra notes under each entry' },
 *     ]}
 *     selected={includeOptions}
 *     onToggle={(key) => setIncludeOptions((prev) => ({ ...prev, [key]: !prev[key] }))}
 *     onCancel={close}
 *     onConfirm={generate}
 *   />
 *
 * Mirrors the `feedback` bottom-sheet look (handle, card background, 200ms
 * spring-in) but owns checkbox state instead of firing one-shot actions.
 */
import { Check, FileCheck2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LargeButton } from '@/components/large-button';
import { ThemedText } from '@/components/themed-text';
import { AnimationDuration, InterFonts, MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ExportOptionKey = string;

export type ExportOptionSpec<K extends ExportOptionKey = string> = {
  key: K;
  label: string;
  hint?: string;
};

type ExportOptionsSheetProps<K extends ExportOptionKey = string> = {
  visible: boolean;
  /** Sheet title; defaults to "Export Options". */
  title?: string;
  /** The checkbox rows to render, in order. */
  options: ExportOptionSpec<K>[];
  /** Map of option key → checked state. */
  selected: Record<K, boolean>;
  onToggle: (key: K) => void;
  onCancel: () => void;
  onConfirm: () => void;
  /** Confirm button label; defaults to "Generate PDF". */
  confirmLabel?: string;
};

export function ExportOptionsSheet<K extends ExportOptionKey = string>({
  visible,
  title = 'Export Options',
  options,
  selected,
  onToggle,
  onCancel,
  onConfirm,
  confirmLabel = 'Generate PDF',
}: ExportOptionsSheetProps<K>) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [translateY] = useState(() => new Animated.Value(640));
  const [backdrop] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(backdrop, { toValue: 1, duration: AnimationDuration, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: AnimationDuration, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, backdrop, translateY]);

  if (!visible) return null;

  const dismiss = (after?: () => void) => {
    Animated.parallel([
      Animated.timing(backdrop, { toValue: 0, duration: 160, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 640, duration: 160, useNativeDriver: true }),
    ]).start(() => after?.());
  };

  return (
    <Modal transparent visible statusBarTranslucent onRequestClose={() => dismiss(onCancel)}>
      <Animated.View style={[styles.backdrop, { backgroundColor: theme.overlay, opacity: backdrop }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => dismiss(onCancel)} accessibilityLabel="Close" />
        <Animated.View style={[styles.sheet, { backgroundColor: theme.card, transform: [{ translateY }] }]}>
          <View style={[styles.handle, { backgroundColor: theme.border }]} />
          <ThemedText style={styles.title}>{title}</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.subtitle}>
            Choose what appears in the PDF.
          </ThemedText>

          <View style={styles.options}>
            {options.map((option) => {
              const on = !!selected[option.key];
              return (
                <Pressable
                  key={option.key}
                  onPress={() => onToggle(option.key)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  style={({ pressed }) => [
                    styles.optionRow,
                    { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                    pressed && styles.pressed,
                  ]}>
                  <View
                    style={[
                      styles.checkbox,
                      { borderColor: theme.border },
                      on && { backgroundColor: theme.primary, borderColor: theme.primary },
                    ]}>
                    {on ? <Check size={16} color={theme.background} strokeWidth={3} /> : null}
                  </View>
                  <View style={styles.optionText}>
                    <ThemedText style={styles.optionLabel}>{option.label}</ThemedText>
                    {option.hint ? (
                      <ThemedText themeColor="textSecondary" style={styles.optionHint}>
                        {option.hint}
                      </ThemedText>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* PDF quality note */}
          <View style={[styles.qualityNote, { backgroundColor: theme.backgroundElement }]}>
            <FileCheck2 size={14} color={theme.primary} />
            <ThemedText themeColor="textSecondary" style={styles.qualityText}>
              A4 printable · clean & professional · WhatsApp & print ready · no clipping or overlaps
            </ThemedText>
          </View>

          <View style={styles.actions}>
            <LargeButton title={confirmLabel} variant="primary" height={MinTouchTarget} onPress={() => dismiss(onConfirm)} />
            <LargeButton title="Cancel" variant="outline" height={MinTouchTarget} onPress={() => dismiss(onCancel)} />
          </View>
          <View style={{ height: insets.bottom }} />
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: Radius.button,
    borderTopRightRadius: Radius.button,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    gap: Spacing.two,
    width: '100%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: Radius.chip,
    marginBottom: Spacing.one,
  },
  title: {
    fontFamily: InterFonts.bold,
    fontSize: 20,
    lineHeight: 26,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: InterFonts.regular,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  options: {
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.input,
    borderWidth: 1,
  },
  pressed: {
    opacity: 0.85,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: {
    flex: 1,
  },
  optionLabel: {
    fontFamily: InterFonts.semibold,
    fontSize: 15,
    lineHeight: 20,
  },
  optionHint: {
    fontFamily: InterFonts.regular,
    fontSize: 12.5,
    lineHeight: 17,
    marginTop: Spacing.half,
  },
  qualityNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Radius.input,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
  },
  qualityText: {
    fontFamily: InterFonts.regular,
    fontSize: 12,
    lineHeight: 16,
    flex: 1,
  },
  actions: {
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
});
