/**
 * Password-recovery screen, opened by the email's "reset password" link via
 * the `dailykhata://reset-password` deep link.
 *
 * The link carries the recovery tokens in the URL fragment
 * (`#access_token=…&refresh_token=…`). Because the Supabase client runs with
 * `detectSessionInUrl: false` (a native app), we parse the fragment ourselves,
 * exchange the tokens for a session, and then let the user set a new password.
 */
import { router } from 'expo-router';
import { KeyRound, ShieldCheck } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { LargeButton } from '@/components/large-button';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { getSupabaseClient } from '@/services/supabase/client';

/** Pulls a key out of an `a=b&c=d` fragment without URLSearchParams. */
function fragmentParam(fragment: string, key: string): string | null {
  for (const part of fragment.split('&')) {
    const eq = part.indexOf('=');
    if (eq === -1) {
      continue;
    }
    if (part.slice(0, eq) === key) {
      return decodeURIComponent(part.slice(eq + 1));
    }
  }
  return null;
}

export default function ResetPasswordScreen() {
  const theme = useTheme();
  const { updatePassword } = useAuth();
  const [checked, setChecked] = useState(false);
  const [badLink, setBadLink] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // On mount, swap the recovery tokens in the deep-link fragment for a session.
  useEffect(() => {
    let mounted = true;

    const scan = (value: string | null) => {
      const supabase = getSupabaseClient();
      const fragment = value?.split('#')[1] ?? '';
      const accessToken = fragmentParam(fragment, 'access_token');
      const refreshToken = fragmentParam(fragment, 'refresh_token');

      const fail = (message: string) => {
        if (!mounted) {
          return;
        }
        setBadLink(message);
        setChecked(true);
      };

      if (!accessToken || !refreshToken) {
        fail('This link is missing a recovery code. Request a new one from the sign-in screen.');
        return;
      }
      if (!supabase) {
        fail('Cloud sync is not configured on this device.');
        return;
      }
      void supabase.auth
        .setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(({ error: sessionError }) => {
          if (!mounted) {
            return;
          }
          if (sessionError) {
            setBadLink('This recovery link is invalid or expired. Request a new one.');
          }
          setChecked(true);
        });
    };

    void Linking.getInitialURL().then(scan);
    const subscription = Linking.addEventListener('url', (event) => scan(event.url));
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  const submit = () => {
    if (password.length < 6) {
      setError('Choose a password of at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('The passwords do not match.');
      return;
    }
    setError(null);
    setBusy(true);
    void updatePassword(password).then((result) => {
      setBusy(false);
      if (!result.ok) {
        setError(result.error ?? 'Could not update the password. Try again.');
        return;
      }
      setDone(true);
    });
  };

  return (
    <Screen>
      <View style={styles.hero}>
        <View style={[styles.heroIcon, { backgroundColor: theme.incomeSoft }]}>
          <KeyRound size={34} color={theme.primary} />
        </View>
        <ThemedText type="subtitle">Reset password</ThemedText>
        <ThemedText type="default" themeColor="textSecondary" style={styles.heroText}>
          Choose a new password for your DailyKhata account.
        </ThemedText>
      </View>

      {badLink ? (
        <Card>
          <ThemedText type="small" themeColor="textSecondary">
            {badLink}
          </ThemedText>
          <LargeButton title="Back to sign-in" onPress={() => router.replace('/auth')} />
        </Card>
      ) : !checked ? (
        <Card>
          <ActivityIndicator size="small" color={theme.primary} accessibilityLabel="Checking recovery link" />
        </Card>
      ) : done ? (
        <Card>
          <View style={styles.doneRow}>
            <ShieldCheck size={22} color={theme.primary} />
            <ThemedText type="default">Password updated ✓</ThemedText>
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            You can now sign in with your new password.
          </ThemedText>
          <LargeButton title="Go to sign-in" onPress={() => router.replace('/auth')} />
        </Card>
      ) : (
        <Card>
          <TextField
            label="New password"
            placeholder="At least 6 characters"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            autoFocus
            accessibilityLabel="New password"
          />
          <TextField
            label="Confirm password"
            placeholder="Repeat the new password"
            secureTextEntry
            value={confirm}
            onChangeText={setConfirm}
            accessibilityLabel="Confirm password"
          />
          {error ? <ThemedText type="small" style={styles.error}>{error}</ThemedText> : null}
          <LargeButton title="Update password" onPress={submit} disabled={busy} />
          {busy ? <ActivityIndicator size="small" color={theme.primary} /> : null}
          <Pressable
            onPress={() => router.replace('/auth')}
            accessibilityRole="button"
            style={styles.backRow}>
            <ThemedText type="small" themeColor="textSecondary">
              Back to sign-in
            </ThemedText>
          </Pressable>
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.four,
  },
  heroIcon: {
    padding: Spacing.three,
    borderRadius: 16,
  },
  heroText: {
    textAlign: 'center',
    lineHeight: 20,
  },
  doneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  error: {
    color: '#EF4444',
  },
  backRow: {
    alignItems: 'center',
    paddingVertical: Spacing.one,
  },
});
