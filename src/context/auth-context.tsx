/**
 * Authentication context.
 *
 * Restores the persisted session on boot, mirrors the auth service's session
 * into React state, and exposes the sign-in/out actions the UI calls. The
 * context is a thin adapter over the provider-agnostic AuthService, so adding
 * Google Sign-In later only touches the service, not the screens.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import {
  getCurrentEmail,
  getCurrentPhone,
  onAuthStateChange,
  requestPhoneOtp,
  resetPassword as sendResetEmail,
  restoreSession,
  signInWithEmail,
  signOut as authSignOut,
  signUpWithEmail,
  updatePassword as setNewPassword,
  verifyPhoneOtp,
  type AuthResult,
} from '@/services/supabase/auth';
import { isSyncConfigured } from '@/services/supabase/config';
import { onAuthChanged } from '@/services/sync/sync-engine';
import { getSupabaseClient } from '@/services/supabase/client';
import { unregisterRecurringTask } from '@/services/recurring/scheduler';

export type AuthStatus = 'loading' | 'signedIn' | 'signedOut' | 'unconfigured';

interface AuthContextValue {
  /** Whether we're still restoring a session on boot. */
  status: AuthStatus;
  /** The signed-in phone number (E.164), or null. */
  phone: string | null;
  /** The signed-in email, or null. */
  email: string | null;
  /** A human label for the signed-in account (email or phone). */
  account: string;
  /** Requests an OTP, sent to the phone via SMS. */
  requestOtp: (phone: string) => Promise<AuthResult>;
  /** Verifies the SMS code and signs in, persisting the session. */
  verifyOtp: (phone: string, token: string) => Promise<AuthResult>;
  /** Signs in with email + password (fallback sign-in method). */
  signInEmail: (email: string, password: string) => Promise<AuthResult>;
  /** Creates an email + password account, then signs in. */
  signUpEmail: (email: string, password: string) => Promise<AuthResult>;
  /** Emails a password-reset link (opens the reset-password screen). */
  resetPassword: (email: string) => Promise<AuthResult>;
  /** Sets a new password for the signed-in (password-recovery) session. */
  updatePassword: (password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [phone, setPhone] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    // The module listener fires immediately with the current (still null)
    // session; ignore those calls until the persisted session is restored so
    // boot never flashes the signed-out state (and the auth redirect).
    let restored = false;

    if (!isSyncConfigured()) {
      setStatus('unconfigured');
      return;
    }

    const unsubscribe = onAuthStateChange((session) => {
      if (!mounted || !restored) {
        return;
      }
      setPhone(getCurrentPhone());
      setEmail(getCurrentEmail());
      setStatus(session ? 'signedIn' : 'signedOut');
      // Sign-in triggers an initial pull (automatic restore on this device);
      // sign-out pauses sync.
      void onAuthChanged(getSupabaseClient);
    });

    // Boot: restore the persisted session, then tell the sync engine.
    void restoreSession().then((session) => {
      if (!mounted) {
        return;
      }
      restored = true;
      setPhone(getCurrentPhone());
      setEmail(getCurrentEmail());
      setStatus(session ? 'signedIn' : 'signedOut');
      void onAuthChanged(getSupabaseClient);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const requestOtp = useCallback((value: string) => requestPhoneOtp(value), []);
  const verifyOtp = useCallback((value: string, token: string) => verifyPhoneOtp(value, token), []);
  const signInEmail = useCallback((value: string, password: string) => signInWithEmail(value, password), []);
  const signUpEmail = useCallback((value: string, password: string) => signUpWithEmail(value, password), []);
  const resetPassword = useCallback((value: string) => sendResetEmail(value), []);
  const updatePassword = useCallback((value: string) => setNewPassword(value), []);
  const signOut = useCallback(async () => {
    await authSignOut();
    void unregisterRecurringTask();
  }, []);

  const account = email ?? phone ?? 'Signed in';

  const value = useMemo(
    () => ({
      status,
      phone,
      email,
      account,
      requestOtp,
      verifyOtp,
      signInEmail,
      signUpEmail,
      resetPassword,
      updatePassword,
      signOut,
    }),
    [
      status,
      phone,
      email,
      account,
      requestOtp,
      verifyOtp,
      signInEmail,
      signUpEmail,
      resetPassword,
      updatePassword,
      signOut,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
