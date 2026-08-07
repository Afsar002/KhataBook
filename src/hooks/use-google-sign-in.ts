/**
 * Google Sign-In for the auth screen.
 *
 * Owns the OAuth prompt (`expo-auth-session`) and hands the returned Google ID
 * token to the provider-agnostic `AuthService.signInWithGoogle`. The split is
 * deliberate: the browser prompt + deep-link step is inherently UI-bound, while
 * the token exchange stays a plain, testable service method.
 *
 * Mount this only when a Google web client ID is configured — `expo-auth-session`
 * throws at render time when it has no client ID for the current platform.
 */
import * as Google from 'expo-auth-session/providers/google';
import { useCallback, useEffect, useRef, useState } from 'react';

import { signInWithGoogle } from '@/services/supabase/auth';
import { googleConfig } from '@/services/supabase/config';

export interface GoogleSignInState {
  busy: boolean;
  error: string | null;
  promptGoogleSignIn: () => void;
}

export function useGoogleSignIn(onSignedIn?: () => void): GoogleSignInState {
  const [request, response, promptAsync] = Google.useAuthRequest({
    // The web client ID doubles as the generic client ID, so the returned ID
    // token's `aud` matches the Google Web client ID configured in Supabase
    // (which is what GoTrue validates) on every platform.
    clientId: googleConfig.webClientId || undefined,
    webClientId: googleConfig.webClientId || undefined,
    androidClientId: googleConfig.androidClientId || undefined,
    iosClientId: googleConfig.iosClientId || undefined,
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep the callback in a ref so a changing identity never re-triggers the
  // token exchange below (which must run exactly once per OAuth response).
  const onSignedInRef = useRef(onSignedIn);
  useEffect(() => {
    onSignedInRef.current = onSignedIn;
  });

  useEffect(() => {
    if (!response) {
      return;
    }
    if (response.type === 'error') {
      setError(response.error?.message ?? 'Google sign-in failed.');
      return;
    }
    if (response.type === 'cancel') {
      setError(null);
      return;
    }
    if (response.type !== 'success') {
      return;
    }
    // Native (code exchange) exposes the token on `authentication`; web and
    // the Expo proxy put it in the redirect params.
    const params = response.params as { id_token?: string } | undefined;
    const idToken = params?.id_token ?? response.authentication?.idToken;
    if (!idToken) {
      setError('Google did not return a sign-in token.');
      return;
    }
    setBusy(true);
    setError(null);
    void signInWithGoogle(idToken).then((result) => {
      setBusy(false);
      if (result.ok) {
        onSignedInRef.current?.();
      } else {
        setError(result.error ?? 'Google sign-in failed.');
      }
    });
  }, [response]);

  const promptGoogleSignIn = useCallback(() => {
    if (!request) {
      setError('Google sign-in is not ready. Try again.');
      return;
    }
    setError(null);
    void promptAsync();
  }, [request, promptAsync]);

  return { busy, error, promptGoogleSignIn };
}
