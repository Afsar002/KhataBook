/**
 * Supabase configuration.
 *
 * Credentials come from Expo public environment variables (`EXPO_PUBLIC_*`),
 * copied from `.env.example` into a local `.env` — never hardcoded. The anon
 * key is safe to ship in the client bundle; row-level security is what keeps
 * data private.
 */

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const supabaseConfig = { url, anonKey };

/**
 * True when a Supabase project has been configured. When false the app runs
 * fully offline exactly as before (no auth gate, no sync), so a missing
 * `.env` never breaks the ledger.
 */
export function isSyncConfigured(): boolean {
  return url.length > 0 && anonKey.length > 0;
}

// ---------------------------------------------------------------------------
// Google Sign-In
//
// Client IDs from the Google Cloud Console. Only the web client ID is
// required; the Android / iOS / Expo client IDs let the matching platform
// open the OAuth consent screen in its own context. See
// docs/13-supabase-setup.md for the one-time setup.
// ---------------------------------------------------------------------------

const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
const googleAndroidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? '';
const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';

export const googleConfig = {
  webClientId: googleWebClientId,
  androidClientId: googleAndroidClientId,
  iosClientId: googleIosClientId,
};

/** True when a Google OAuth web client ID has been configured. */
export function isGoogleConfigured(): boolean {
  return googleWebClientId.length > 0;
}
