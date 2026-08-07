/**
 * App lock gate — covers the whole app with the phone's own lock screen.
 *
 * When the app-lock preference is on, this renders an opaque overlay over the
 * navigation stack and prompts with the device biometric / passcode. It is an
 * INLINE overlay (the stack stays mounted underneath), never a `<Redirect>` —
 * a redirect from a root-layout gate remounts the tree in an infinite loop.
 * Re-locks whenever the app goes to the background.
 */
import { Lock } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, AppState, Modal, Platform, StyleSheet, View } from 'react-native';

import { LargeButton } from '@/components/large-button';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { authenticateWithDevice } from '@/services/app-lock/auth';
import { getAppLockEnabled, setAppLockEnabled } from '@/services/app-lock/prefs';

export function AppLockGate({ children }: { children: ReactNode }) {
  const theme = useTheme();

  const [loaded, setLoaded] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [locked, setLocked] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);

  // Refs mirror `locked` so AppState callbacks never go stale.
  const lockedRef = useRef(false);
  const promptOnce = useRef(false);

  // Load the preference once on mount.
  useEffect(() => {
    let mounted = true;
    void getAppLockEnabled().then((value) => {
      if (!mounted) {
        return;
      }
      setLoaded(true);
      setEnabled(value);
      if (value) {
        lockedRef.current = true;
        setLocked(true);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const runUnlock = useCallback(async () => {
    if (unlocking) {
      return;
    }
    setUnlocking(true);
    setNeedsSetup(false);
    try {
      const ok = await authenticateWithDevice('Unlock DailyKhata', 'Cancel');
      if (ok) {
        lockedRef.current = false;
        promptOnce.current = false; // allow auto-prompt on the next lock
        setLocked(false);
      }
    } catch {
      // No usable phone lock — the user must disable the app lock from here.
      setNeedsSetup(true);
    } finally {
      setUnlocking(false);
    }
  }, [unlocking]);

  // Prompt automatically the first time the gate becomes locked.
  useEffect(() => {
    if (!loaded || !enabled || !locked || promptOnce.current) {
      return;
    }
    promptOnce.current = true;
    void runUnlock();
  }, [loaded, enabled, locked, runUnlock]);

  // Re-lock whenever the app leaves the foreground.
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background' && !lockedRef.current) {
        lockedRef.current = true;
        setLocked(true);
      }
    });
    return () => sub.remove();
  }, [enabled]);

  const disableLock = () => {
    lockedRef.current = false;
    setEnabled(false);
    setLocked(false);
    void setAppLockEnabled(false);
  };

  // Web has no device lock API, and the toggle is hidden there, so the flag is
  // never set on web — render straight through.
  if (Platform.OS === 'web') {
    return <>{children}</>;
  }

  if (!loaded) {
    return <View style={styles.loading} />;
  }

  return (
    <View style={styles.root}>
      {children}
      {/* Rendered as a native Modal so it covers every stack screen and
          native modal above the gate. Android back must not dismiss it. */}
      <Modal
        visible={enabled && locked}
        animationType="none"
        onRequestClose={() => {
          // Intentionally empty — the lock can only be dismissed by auth.
        }}>
        <View style={[styles.lockScreen, { backgroundColor: theme.background }]}>
          <View style={styles.lockContent}>
            <View style={[styles.lockIconWrap, { backgroundColor: theme.backgroundElement }]}>
              <Lock size={40} color={theme.primary} />
            </View>
            <ThemedText type="title">DailyKhata</ThemedText>
            <View style={styles.hintRow}>
              {unlocking ? <ActivityIndicator size="small" color={theme.primary} /> : null}
              <ThemedText type="small" themeColor="textSecondary" style={styles.lockHint}>
                {needsSetup
                  ? 'Set up a fingerprint, face or phone passcode to use the app lock.'
                  : unlocking
                    ? 'Checking your phone lock…'
                    : 'Use your fingerprint, face or phone passcode to continue.'}
              </ThemedText>
            </View>

            <LargeButton
              title={needsSetup ? 'Try Again' : 'Unlock'}
              variant="primary"
              icon={Lock}
              onPress={runUnlock}
              height={56}
              disabled={unlocking}
              style={styles.unlockButton}
            />

            {needsSetup ? (
              <LargeButton
                title="Disable App Lock"
                variant="outline"
                onPress={disableLock}
                height={48}
                style={styles.disableButton}
              />
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  loading: {
    flex: 1,
  },
  lockScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  lockContent: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignItems: 'center',
    gap: Spacing.three,
  },
  lockIconWrap: {
    width: 88,
    height: 88,
    borderRadius: Radius.card * 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 20,
  },
  lockHint: {
    textAlign: 'center',
  },
  unlockButton: {
    marginTop: Spacing.two,
    width: '100%',
  },
  disableButton: {
    width: '100%',
  },
});
