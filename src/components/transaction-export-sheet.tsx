/**
 * Transaction Export Sheet — DailyKhata-styled bottom sheet shown on the History
 * page for quick-range PDF export (Today / Yesterday / This Week / This Month /
 * This Year / Custom date range).
 *
 * Mirrors the `ExportOptionsSheet` look (handle, card background, 200ms
 * spring-in) but owns preset chips + custom From/To fields + a primary "Generate
 * PDF" button with a busy state.
 *
 *   <TransactionExportSheet
 *     visible={open}
 *     onCancel={close}
 *     onGenerate={async (from, to) => { ... }}
 *   />
 */
import { CalendarRange, FileDown, Loader2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LargeButton } from '@/components/large-button';
import { AnimationDuration, InterFonts, MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { rangePresets, type RangePresetKey } from '@/utils/date-range';
import { feedback } from '@/components/feedback';
import { ThemedText } from '@/components/themed-text';

type TransactionExportSheetProps = {
  visible: boolean;
  onCancel: () => void;
  /** Called when the user taps Generate. Receives inclusive `YYYY-MM-DD` bounds. */
  onGenerate: (from: string | undefined, to: string | undefined) => Promise<void>;
};

export function TransactionExportSheet({
  visible,
  onCancel,
  onGenerate,
}: TransactionExportSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [translateY] = useState(() => new Animated.Value(640));
  const [backdrop] = useState(() => new Animated.Value(0));
  const [busy, setBusy] = useState(false);

  const presets = rangePresets();
  const [activePreset, setActivePreset] = useState<RangePresetKey | 'custom' | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

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

  const applyPreset = (key: RangePresetKey) => {
    const preset = presets.find((p) => p.key === key);
    if (preset) {
      setFrom(preset.from);
      setTo(preset.to);
      setActivePreset(key);
    }
  };

  const handleCustomChange = (field: 'from' | 'to', value: string) => {
    // Basic ISO date validation (YYYY-MM-DD)
    const ok = /^\d{4}-\d{2}-\d{2}$/.test(value) || value === '';
    if (!ok) return;
    if (field === 'from') setFrom(value);
    else setTo(value);
    setActivePreset('custom');
  };

  const validate = (): string[] | null => {
    const errors: string[] = [];
    if (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) errors.push('From must be YYYY-MM-DD.');
    if (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) errors.push('To must be YYYY-MM-DD.');
    if (from && to && from > to) errors.push('From must be on or before To.');
    return errors.length ? errors : null;
  };

  const handleGenerate = async () => {
    const errors = validate();
    if (errors) {
      feedback.alert({ title: 'Check the range', message: errors.join('\n'), tone: 'danger' });
      return;
    }
    if (!from && !to) {
      feedback.toast({ message: 'Pick a date range or a quick preset.', tone: 'info' });
      return;
    }

    setBusy(true);
    try {
      await onGenerate(from || undefined, to || undefined);
      dismiss(onCancel);
    } catch (error) {
      feedback.toast({
        message: error instanceof Error ? error.message : String(error),
        tone: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal transparent visible statusBarTranslucent onRequestClose={() => dismiss(onCancel)}>
      <Animated.View style={[styles.backdrop, { backgroundColor: theme.overlay, opacity: backdrop }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => dismiss(onCancel)} accessibilityLabel="Close" />
        <Animated.View style={[styles.sheet, { backgroundColor: theme.card, transform: [{ translateY }] }]}>
          <View style={[styles.handle, { backgroundColor: theme.border }]} />
          <View style={styles.titleRow}>
            <ThemedText style={styles.title}>Export Transactions</ThemedText>
          </View>
          <ThemedText themeColor="textSecondary" style={styles.subtitle}>
            Choose a quick range or enter custom dates, then generate a PDF.
          </ThemedText>

          {/* Preset chips */}
          <View style={styles.presets}>
            {presets.map((preset) => (
              <Pressable
                key={preset.key}
                onPress={() => applyPreset(preset.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: activePreset === preset.key }}
                style={({ pressed }) => [
                  styles.presetChip,
                  { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                  activePreset === preset.key && { backgroundColor: theme.primary + '20', borderColor: theme.primary },
                  pressed && styles.pressed,
                ]}>
                <ThemedText
                  style={[
                    styles.presetLabel,
                    { color: activePreset === preset.key ? theme.primary : theme.text },
                  ]}>
                  {preset.label}
                </ThemedText>
              </Pressable>
            ))}
          </View>

          {/* Custom date fields */}
          <View style={styles.customRow}>
            <View style={styles.customField}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                From
              </ThemedText>
              <TextInput
                placeholder="YYYY-MM-DD"
                value={from}
                onChangeText={(v) => handleCustomChange('from', v)}
                autoCapitalize="none"
                autoCorrect={false}
                style={[
                  styles.customInput,
                  { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border },
                ]}
              />
            </View>
            <View style={styles.customField}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                To
              </ThemedText>
              <TextInput
                placeholder="YYYY-MM-DD"
                value={to}
                onChangeText={(v) => handleCustomChange('to', v)}
                autoCapitalize="none"
                autoCorrect={false}
                style={[
                  styles.customInput,
                  { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border },
                ]}
              />
            </View>
          </View>

          {/* Hint */}
          <View style={[styles.hint, { backgroundColor: theme.backgroundElement }]}>
            <CalendarRange size={14} color={theme.textSecondary} />
            <ThemedText type="small" themeColor="textSecondary">
              Leave both blank to include all entries.
            </ThemedText>
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <LargeButton
              title={busy ? 'Generating…' : 'Generate PDF'}
              icon={busy ? Loader2 : FileDown}
              variant="primary"
              height={MinTouchTarget}
              onPress={handleGenerate}
              disabled={busy}
            />
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.one,
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
    marginBottom: Spacing.one,
  },
  presets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  presetChip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Radius.chip,
    borderWidth: 1,
  },
  pressed: {
    opacity: 0.85,
  },
  presetLabel: {
    fontFamily: InterFonts.semibold,
    fontSize: 13,
  },
  customRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  customField: {
    flex: 1,
    gap: Spacing.one,
  },
  customInput: {
    fontFamily: InterFonts.medium,
    fontSize: 16,
    borderWidth: 1,
    borderRadius: Radius.input,
    paddingHorizontal: Spacing.three,
    minHeight: 48,
  },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderRadius: Radius.input,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    marginTop: Spacing.one,
  },
  actions: {
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
});