/**
 * Branded feedback system — replaces native `Alert`/`window.confirm` popups
 * with design-system bottom sheets and toasts (no platform popups).
 *
 * Mount `<FeedbackProvider>` once inside `ThemeProvider`, then call the global
 * `feedback` API from anywhere:
 *
 *   feedback.confirm({ title, message, danger, confirmLabel, onConfirm })
 *   feedback.alert({ title, message, tone })
 *   feedback.sheet({ title, options: [{ label, icon, danger, onPress }] })
 *   feedback.toast({ message, tone })
 *
 * The API is a no-op until the provider mounts at startup, so it is safe to
 * import and call in any screen.
 */
import type { LucideIcon } from 'lucide-react-native';
import { AlertCircle, AlertTriangle, CheckCircle2, HelpCircle, Info } from 'lucide-react-native';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LargeButton } from '@/components/large-button';
import { AnimationDuration, InterFonts, MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Tone = 'default' | 'success' | 'danger' | 'info';

export type SheetOption = {
  label: string;
  icon?: LucideIcon;
  danger?: boolean;
  onPress: () => void;
};

export type ConfirmOptions = {
  title: string;
  message?: string;
  icon?: LucideIcon;
  tone?: Tone;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm?: () => void;
};

export type AlertOptions = {
  title: string;
  message?: string;
  icon?: LucideIcon;
  tone?: Tone;
  confirmLabel?: string;
};

export type SheetOptions = {
  title: string;
  message?: string;
  options: SheetOption[];
  cancelLabel?: string;
};

export type ToastOptions = { message: string; tone?: 'success' | 'error' | 'info' };

type DialogState =
  | { kind: 'confirm'; opts: ConfirmOptions }
  | { kind: 'alert'; opts: AlertOptions }
  | { kind: 'sheet'; opts: SheetOptions };

type ToastItem = { id: number; opts: ToastOptions };

type FeedbackApi = {
  confirm: (opts: ConfirmOptions) => void;
  alert: (opts: AlertOptions) => void;
  sheet: (opts: SheetOptions) => void;
  toast: (opts: ToastOptions) => void;
};

let api: FeedbackApi | null = null;

/** Global imperative API. No-ops until `<FeedbackProvider>` mounts. */
export const feedback: FeedbackApi = {
  confirm: (opts) => api?.confirm(opts),
  alert: (opts) => api?.alert(opts),
  sheet: (opts) => api?.sheet(opts),
  toast: (opts) => api?.toast(opts),
};

/** Resolves a tone to a solid color using the active theme. */
function toneColor(theme: ReturnType<typeof useTheme>, tone: Tone): string {
  switch (tone) {
    case 'success':
      return theme.income;
    case 'danger':
      return theme.expense;
    case 'info':
      return theme.info;
    default:
      return theme.primary;
  }
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastId = useRef(0);

  useEffect(() => {
    api = {
      confirm: (opts) => setDialog({ kind: 'confirm', opts }),
      alert: (opts) => setDialog({ kind: 'alert', opts }),
      sheet: (opts) => setDialog({ kind: 'sheet', opts }),
      toast: (opts) => {
        toastId.current += 1;
        const id = toastId.current;
        setToasts((prev) => [...prev, { id, opts }]);
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 3000);
      },
    };
    return () => {
      api = null;
    };
  }, []);

  return (
    <>
      {children}
      {dialog ? (
        <FeedbackDialog dialog={dialog} onClose={() => setDialog(null)} />
      ) : null}
      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        {toasts.map((t) => (
          <FeedbackToast key={t.id} opts={t.opts} />
        ))}
      </View>
    </>
  );
}

function FeedbackDialog({
  dialog,
  onClose,
}: {
  dialog: DialogState;
  onClose: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [translateY] = useState(() => new Animated.Value(640));
  const [backdrop] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.parallel([
      Animated.timing(backdrop, { toValue: 1, duration: AnimationDuration, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: AnimationDuration, useNativeDriver: true }),
    ]).start();
  }, [backdrop, translateY]);

  const dismiss = (after?: () => void) => {
    Animated.parallel([
      Animated.timing(backdrop, { toValue: 0, duration: 160, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 640, duration: 160, useNativeDriver: true }),
    ]).start(() => {
      onClose();
      after?.();
    });
  };

  if (dialog.kind === 'sheet') {
    return (
      <Modal transparent visible statusBarTranslucent onRequestClose={() => dismiss()}>
        <Animated.View style={[styles.backdrop, { backgroundColor: theme.overlay, opacity: backdrop }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => dismiss()} accessibilityLabel="Close" />
          <Animated.View style={[styles.sheet, { backgroundColor: theme.card, transform: [{ translateY }] }]}>
            <View style={[styles.handle, { backgroundColor: theme.border }]} />
            <Text style={[styles.title, { color: theme.text }]}>{dialog.opts.title}</Text>
            {dialog.opts.message ? (
              <Text style={[styles.message, { color: theme.textSecondary }]}>{dialog.opts.message}</Text>
            ) : null}
            <View style={styles.actions}>
              {dialog.opts.options.map((option, index) => {
                const Icon = option.icon;
                return (
                  <LargeButton
                    key={index}
                    title={option.label}
                    variant={option.danger ? 'danger' : 'primary'}
                    icon={Icon}
                    height={MinTouchTarget}
                    onPress={() => dismiss(option.onPress)}
                  />
                );
              })}
              <LargeButton
                title={dialog.opts.cancelLabel ?? 'Cancel'}
                variant="outline"
                height={MinTouchTarget}
                onPress={() => dismiss()}
              />
            </View>
            <View style={{ height: insets.bottom }} />
          </Animated.View>
        </Animated.View>
      </Modal>
    );
  }

  const opts = dialog.opts as ConfirmOptions;
  const isConfirm = dialog.kind === 'confirm';
  const tone = opts.tone ?? (isConfirm && opts.danger ? 'danger' : 'default');
  const color = toneColor(theme, tone);
  const Icon =
    opts.icon ??
    (tone === 'danger'
      ? AlertTriangle
      : isConfirm
        ? HelpCircle
        : tone === 'success'
          ? CheckCircle2
          : tone === 'info'
            ? Info
            : AlertCircle);

  return (
    <Modal transparent visible statusBarTranslucent onRequestClose={() => dismiss()}>
      <Animated.View style={[styles.backdrop, { backgroundColor: theme.overlay, opacity: backdrop }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => dismiss()} accessibilityLabel="Close" />
        <Animated.View style={[styles.sheet, { backgroundColor: theme.card, transform: [{ translateY }] }]}>
          <View style={[styles.handle, { backgroundColor: theme.border }]} />
          {opts.message ? (
            <View style={[styles.iconWrap, { backgroundColor: `${color}1F` }]}>
              <Icon size={28} color={color} />
            </View>
          ) : null}
          <Text style={[styles.title, { color: theme.text }]}>{opts.title}</Text>
          {opts.message ? (
            <Text style={[styles.message, { color: theme.textSecondary }]}>{opts.message}</Text>
          ) : null}
          <View style={styles.actions}>
            {isConfirm ? (
              <>
                <LargeButton
                  title={opts.confirmLabel ?? 'Confirm'}
                  variant={opts.danger ? 'danger' : 'primary'}
                  height={MinTouchTarget}
                  onPress={() => dismiss(opts.onConfirm)}
                />
                <LargeButton
                  title={opts.cancelLabel ?? 'Cancel'}
                  variant="outline"
                  height={MinTouchTarget}
                  onPress={() => dismiss()}
                />
              </>
            ) : (
              <LargeButton
                title={opts.confirmLabel ?? 'OK'}
                variant="primary"
                height={MinTouchTarget}
                onPress={() => dismiss()}
              />
            )}
          </View>
          <View style={{ height: insets.bottom }} />
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

function FeedbackToast({ opts }: { opts: ToastOptions }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [opacity] = useState(() => new Animated.Value(0));
  const [translateY] = useState(() => new Animated.Value(-24));

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true }),
    ]).start();
  }, [opacity, translateY]);

  const tone = opts.tone ?? 'info';
  const background =
    tone === 'success' ? theme.income : tone === 'error' ? theme.danger : theme.text;
  const foreground = tone === 'info' ? theme.background : '#FFFFFF';
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'error' ? AlertCircle : Info;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.toast,
        { backgroundColor: background, opacity, transform: [{ translateY }] },
        { marginTop: insets.top },
      ]}>
      <Icon size={18} color={foreground} />
      <Text style={[styles.toastText, { color: foreground }]} numberOfLines={3}>
        {opts.message}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    gap: Spacing.three,
    width: '100%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: Radius.chip,
    marginBottom: Spacing.one,
  },
  iconWrap: {
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: Radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.two,
  },
  title: {
    fontFamily: InterFonts.bold,
    fontSize: 20,
    lineHeight: 26,
    textAlign: 'center',
  },
  message: {
    fontFamily: InterFonts.regular,
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
  },
  actions: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    maxWidth: '92%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Radius.chip,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + Spacing.one,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  toastText: {
    fontFamily: InterFonts.semibold,
    fontSize: 14,
    lineHeight: 19,
    flexShrink: 1,
  },
});
