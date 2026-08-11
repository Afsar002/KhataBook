/**
 * Sign-in screen — phone OTP (two steps) or email + password, chosen with a
 * segment control.
 *
 * Phone: step 1 collects the number and requests an SMS code; step 2 verifies
 * it. Email: a single form signs in or creates an account. The session is
 * persisted automatically, so the user stays signed in across restarts. The
 * auth gate in `_layout` redirects here whenever the app is configured for
 * cloud sync but signed out.
 */
import { useRouter } from 'expo-router';
import { ArrowLeft, Cloud, Globe, Mail, ShieldCheck, Smartphone } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { feedback } from '@/components/feedback';
import { LargeButton } from '@/components/large-button';
import { Screen } from '@/components/screen';
import { Segment } from '@/components/segment';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useGoogleSignIn } from '@/hooks/use-google-sign-in';
import { useTheme } from '@/hooks/use-theme';
import { isGoogleConfigured } from '@/services/supabase/config';

/** Fixed country prefix for the phone number (Indian khata users). */
const COUNTRY_CODE = '+91';

/**
 * "Continue with Google" — rendered only when a Google web client ID is
 * configured (see `isGoogleConfigured`), because the underlying auth-session
 * request needs one and would otherwise throw at render time.
 */
function GoogleSignInButton() {
  const router = useRouter();
  const theme = useTheme();
  const { busy, error, promptGoogleSignIn } = useGoogleSignIn(() => router.replace('/'));

  return (
    <>
      <View style={styles.orRow}>
        <View style={[styles.orLine, { backgroundColor: theme.border }]} />
        <ThemedText type="small" themeColor="textSecondary">
          or
        </ThemedText>
        <View style={[styles.orLine, { backgroundColor: theme.border }]} />
      </View>
      <LargeButton
        title="Continue with Google"
        subtitle="Sign in with your Google account"
        icon={Globe}
        onPress={promptGoogleSignIn}
        variant="outline"
        disabled={busy}
      />
      {busy ? <ActivityIndicator size="small" color={theme.primary} /> : null}
      {error ? (
        <ThemedText type="small" themeColor="danger">
          {error}
        </ThemedText>
      ) : null}
    </>
  );
}

export default function AuthScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { requestOtp, verifyOtp, signInEmail, signUpEmail, resetPassword } = useAuth();

  const [method, setMethod] = useState<'phone' | 'email'>('phone');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [otp, setOtp] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  const phone = COUNTRY_CODE + phoneDigits.trim();

  const goPhone = () => {
    if (phoneDigits.trim().length !== 10) {
      setError('Enter your 10-digit mobile number.');
      return;
    }
    setError(null);
    setBusy(true);
    void requestOtp(phone).then((result) => {
      setBusy(false);
      if (result.ok) {
        setStep('otp');
      } else {
        setError(result.error ?? 'Could not send the code. Try again.');
      }
    });
  };

  const goVerify = () => {
    if (otp.trim().length < 4) {
      setError('Enter the code you received by SMS.');
      return;
    }
    setError(null);
    setBusy(true);
    void verifyOtp(phone, otp.trim()).then((result) => {
      setBusy(false);
      if (!result.ok) {
        setError(result.error ?? 'That code did not work. Try again.');
        return;
      }
      // Leave the auth route; the gate in _layout now shows the app.
      router.replace('/');
    });
  };

  const resend = () => {
    setError(null);
    setBusy(true);
    void requestOtp(phone).then((result) => {
      setBusy(false);
      if (!result.ok) {
        setError(result.error ?? 'Could not resend the code. Try again.');
      } else {
        feedback.toast({ message: `A new code has been sent to ${phone}.`, tone: 'success' });
      }
    });
  };

  const changeNumber = () => {
    setStep('phone');
    setOtp('');
    setError(null);
  };

  const changeMethod = (next: 'phone' | 'email') => {
    setMethod(next);
    setStep('phone');
    setError(null);
  };

  const goEmailSignIn = () => {
    if (!email.trim() || password.length < 6) {
      setError('Enter your email and a password of at least 6 characters.');
      return;
    }
    setError(null);
    setBusy(true);
    void signInEmail(email.trim(), password).then((result) => {
      setBusy(false);
      if (!result.ok) {
        setError(result.error ?? 'Could not sign in. Try again.');
        return;
      }
      router.replace('/');
    });
  };

  const goEmailSignUp = () => {
    if (!email.trim() || password.length < 6) {
      setError('Enter your email and a password of at least 6 characters.');
      return;
    }
    setError(null);
    setBusy(true);
    void signUpEmail(email.trim(), password).then((result) => {
      setBusy(false);
      if (!result.ok) {
        setError(result.error ?? 'Could not create the account. Try again.');
        return;
      }
      router.replace('/');
    });
  };

  const goForgotPassword = () => {
    if (!email.trim()) {
      setError('Enter your email first so we can send the reset link.');
      return;
    }
    setError(null);
    setResetSent(true);
    void resetPassword(email.trim()).then((result) => {
      if (!result.ok) {
        setResetSent(false);
        setError(result.error ?? 'Could not send the reset link. Try again.');
      }
    });
  };

  return (
    <Screen>
      <View style={styles.hero}>
        <View style={[styles.heroIcon, { backgroundColor: theme.incomeSoft }]}>
          <Cloud size={34} color={theme.primary} />
        </View>
        <ThemedText type="subtitle">DailyKhata</ThemedText>
        <ThemedText type="default" themeColor="textSecondary" style={styles.heroText}>
          Sign in to back up your entries and open them on any device.
        </ThemedText>
      </View>

      <Segment
        options={[
          { key: 'phone', label: 'Phone' },
          { key: 'email', label: 'Email' },
        ]}
        value={method}
        onChange={(key) => changeMethod(key as 'phone' | 'email')}
      />

      {method === 'email' ? (
        <Card style={styles.card}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            Email & password
          </ThemedText>
          <TextField
            label="Email"
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            value={email}
            onChangeText={setEmail}
            autoFocus
            accessibilityLabel="Email"
          />
          <TextField
            label="Password"
            placeholder="At least 6 characters"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            accessibilityLabel="Password"
          />
          <Pressable onPress={goForgotPassword} accessibilityRole="button" style={styles.forgotRow}>
            <ThemedText type="small" themeColor="textSecondary">
              <ThemedText type="smallBold" style={{ color: theme.primary }}>
                Forgot password?
              </ThemedText>
            </ThemedText>
          </Pressable>
          {resetSent ? (
            <ThemedText type="small" themeColor="income">
              Reset link sent! Check your inbox and open it to choose a new password.
            </ThemedText>
          ) : null}
          {error ? (
            <ThemedText type="small" themeColor="danger">
              {error}
            </ThemedText>
          ) : null}
          <LargeButton
            title="Sign In"
            subtitle="With email & password"
            icon={Mail}
            onPress={goEmailSignIn}
            disabled={busy}
          />
          {busy ? (
            <ActivityIndicator size="small" color={theme.primary} />
          ) : null}
          <Pressable onPress={goEmailSignUp} accessibilityRole="button" style={styles.resendRow}>
            <ThemedText type="small" themeColor="textSecondary">
              New to DailyKhata?{' '}
              <ThemedText type="smallBold" style={{ color: theme.primary }}>
                Create an account
              </ThemedText>
            </ThemedText>
          </Pressable>
        </Card>
      ) : step === 'phone' ? (
        <Card style={styles.card}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            Your phone number
          </ThemedText>
          <View style={styles.phoneRow}>
            <View style={[styles.prefix, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <ThemedText type="default">{COUNTRY_CODE}</ThemedText>
            </View>
            <View style={styles.phoneField}>
              <TextField
                placeholder="98765 43210"
                keyboardType="number-pad"
                maxLength={10}
                value={phoneDigits}
                onChangeText={(text) => setPhoneDigits(text.replace(/[^\d]/g, ''))}
                autoFocus
                accessibilityLabel="Phone number"
              />
            </View>
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            We will send you a one-time code by SMS to verify this number.
          </ThemedText>
          {error ? (
            <ThemedText type="small" themeColor="danger">
              {error}
            </ThemedText>
          ) : null}
          <LargeButton
            title="Send OTP"
            subtitle="Verify by SMS"
            icon={Smartphone}
            onPress={goPhone}
            disabled={busy}
          />
          {busy ? (
            <ActivityIndicator size="small" color={theme.primary} />
          ) : null}
        </Card>
      ) : (
        <Card style={styles.card}>
          <Pressable onPress={changeNumber} accessibilityRole="button" style={styles.backRow}>
            <ArrowLeft size={18} color={theme.text} />
            <ThemedText type="small" themeColor="textSecondary">
              {phone}
            </ThemedText>
          </Pressable>
          <ThemedText type="smallBold" themeColor="textSecondary">
            Enter the code
          </ThemedText>
          <TextField
            placeholder="6-digit code"
            keyboardType="number-pad"
            maxLength={6}
            value={otp}
            onChangeText={(text) => setOtp(text.replace(/[^\d]/g, ''))}
            autoFocus
            accessibilityLabel="Verification code"
          />
          {error ? (
            <ThemedText type="small" themeColor="danger">
              {error}
            </ThemedText>
          ) : null}
          <LargeButton
            title="Verify & Sign In"
            subtitle="Start cloud sync"
            icon={ShieldCheck}
            onPress={goVerify}
            disabled={busy}
          />
          {busy ? (
            <ActivityIndicator size="small" color={theme.primary} />
          ) : null}
          <Pressable onPress={resend} accessibilityRole="button" style={styles.resendRow}>
            <ThemedText type="small" themeColor="textSecondary">
              Didn’t get it?{' '}
              <ThemedText type="smallBold" style={{ color: theme.primary }}>
                Resend code
              </ThemedText>
            </ThemedText>
          </Pressable>
        </Card>
      )}

      {isGoogleConfigured() ? <GoogleSignInButton /> : null}

      <ThemedText type="small" themeColor="textSecondary" style={styles.footnote}>
        Your data stays private. Sync is encrypted in transit and only you can
        access your entries.
      </ThemedText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.three,
  },
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  heroText: {
    textAlign: 'center',
    lineHeight: 20,
  },
  card: {
    gap: Spacing.three,
  },
  phoneRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'center',
  },
  prefix: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  phoneField: {
    flex: 1,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    alignSelf: 'flex-start',
    paddingVertical: Spacing.one,
  },
  resendRow: {
    alignItems: 'center',
    paddingVertical: Spacing.one,
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginVertical: Spacing.one,
  },
  orLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  forgotRow: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.one,
  },
  footnote: {
    textAlign: 'center',
    lineHeight: 18,
  },
});
