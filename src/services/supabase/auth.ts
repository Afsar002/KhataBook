/**
 * Authentication service — phone OTP.
 *
 * The public API is provider-agnostic (`requestPhoneOtp`, `verifyPhoneOtp`,
 * `signOut`, session listeners), so adding Google / other OAuth providers
 * later is just a new method here — callers don't change.
 *
 * All functions are safe to call when cloud sync is not configured: they
 * return a friendly error instead of throwing, and the UI shows the offline
 * "not configured" state.
 */
import type { Session } from '@supabase/supabase-js';

import { getSupabaseClient } from './client';

/** The app-wide client (null when cloud sync is not configured). */
const supabase = getSupabaseClient();

/** Latest session, cached so repos can read the user id synchronously. */
let currentSession: Session | null = null;
let listeners: ((session: Session | null) => void)[] = [];

export interface AuthResult {
  ok: boolean;
  error?: string;
}

function setSession(session: Session | null): void {
  currentSession = session;
  for (const listener of listeners) {
    listener(session);
  }
}

/** The signed-in user's uuid, or null when signed out / not configured. */
export function getCurrentUserId(): string | null {
  return currentSession?.user.id ?? null;
}

/** The signed-in phone number (E.164), or null. */
export function getCurrentPhone(): string | null {
  return currentSession?.user.phone ?? null;
}

/** The signed-in email, or null (phone/Google users have none). */
export function getCurrentEmail(): string | null {
  return currentSession?.user.email ?? null;
}

/** A human label for the signed-in account (email or phone). */
export function getCurrentAccountLabel(): string {
  return getCurrentEmail() ?? getCurrentPhone() ?? 'Signed in';
}

export function getCurrentSession(): Session | null {
  return currentSession;
}

/**
 * Subscribes to session changes. The listener is called immediately with the
 * current session so the UI never misses a state transition.
 */
export function onAuthStateChange(listener: (session: Session | null) => void): () => void {
  listeners.push(listener);
  listener(currentSession);
  return () => {
    listeners = listeners.filter((entry) => entry !== listener);
  };
}

/** Restores a persisted session on app boot and keeps it fresh. */
export async function restoreSession(): Promise<Session | null> {
  if (!supabase) {
    return null;
  }
  const { data } = await supabase.auth.getSession();
  setSession(data.session);
  supabase.auth.onAuthStateChange((_event, session) => setSession(session));
  return data.session;
}

/** Requests a one-time code, sent to the phone via SMS. */
export async function requestPhoneOtp(phone: string): Promise<AuthResult> {
  if (!supabase) {
    return { ok: false, error: 'Cloud sync is not configured yet.' };
  }
  const { error } = await supabase.auth.signInWithOtp({ phone });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Verifies the SMS code and signs the user in, persisting the session. */
export async function verifyPhoneOtp(phone: string, token: string): Promise<AuthResult> {
  if (!supabase) {
    return { ok: false, error: 'Cloud sync is not configured yet.' };
  }
  const { data, error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
  if (error || !data.session) {
    return { ok: false, error: error?.message ?? 'Verification failed. Try again.' };
  }
  setSession(data.session);
  return { ok: true };
}

/**
 * Exchanges a Google ID token (obtained by the UI via expo-auth-session) for a
 * Supabase session. The provider-agnostic surface means callers never touch
 * Supabase types directly — adding another OAuth provider is just one more
 * method like this.
 */
export async function signInWithGoogle(idToken: string): Promise<AuthResult> {
  if (!supabase) {
    return { ok: false, error: 'Cloud sync is not configured yet.' };
  }
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
  });
  if (error || !data.session) {
    return { ok: false, error: error?.message ?? 'Google sign-in failed. Try again.' };
  }
  setSession(data.session);
  return { ok: true };
}

/**
 * Signs in with an email + password (Supabase Email provider). The UI keeps
 * this as a fallback for people who don't want SMS or Google.
 */
export async function signInWithEmail(email: string, password: string): Promise<AuthResult> {
  if (!supabase) {
    return { ok: false, error: 'Cloud sync is not configured yet.' };
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    return { ok: false, error: error?.message ?? 'Could not sign in. Check your email and password.' };
  }
  setSession(data.session);
  return { ok: true };
}

/**
 * Creates a new email + password account and signs in. When email
 * confirmation is enabled in the Supabase dashboard, no session is returned —
 * the user confirms their email, then signs in.
 */
export async function signUpWithEmail(email: string, password: string): Promise<AuthResult> {
  if (!supabase) {
    return { ok: false, error: 'Cloud sync is not configured yet.' };
  }
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data.session) {
    return {
      ok: false,
      error: 'Check your email and tap the confirmation link, then sign in.',
    };
  }
  setSession(data.session);
  return { ok: true };
}

/**
 * Sends a password-reset email. Supabase emails a link that re-opens the app
 * via the `dailykhata://reset-password` scheme; the recovery tokens in that
 * URL's fragment are exchanged for a session on the reset-password screen,
 * which then calls `updatePassword`.
 */
export async function resetPassword(email: string): Promise<AuthResult> {
  if (!supabase) {
    return { ok: false, error: 'Cloud sync is not configured yet.' };
  }
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: 'dailykhata://reset-password',
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Sets a new password for the signed-in (password-recovery) session. */
export async function updatePassword(newPassword: string): Promise<AuthResult> {
  if (!supabase) {
    return { ok: false, error: 'Cloud sync is not configured yet.' };
  }
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Signs the current user out and clears the persisted session. */
export async function signOut(): Promise<void> {
  if (supabase) {
    await supabase.auth.signOut();
  }
  setSession(null);
}
