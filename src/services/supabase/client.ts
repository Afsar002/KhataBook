/**
 * Single Supabase client for the whole app.
 *
 * Importing this module also installs the React Native polyfills Supabase
 * needs (`URL`/`URLSearchParams` + `crypto.getRandomValues`), so they are
 * guaranteed to load before the client is constructed. The auth session is
 * persisted to AsyncStorage, which keeps the user signed in across restarts.
 *
 * Single-profile mode: one user, one account, one cloud session.
 */
import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { isSyncConfigured, supabaseConfig } from './config';

let client: SupabaseClient | null | undefined;

/**
 * Lazy app-wide Supabase client, or null when cloud sync is not configured.
 *
 * Importing this module still installs the React Native polyfills Supabase
 * needs (`URL`/`URLSearchParams` + `crypto.getRandomValues`), but the client
 * itself is only constructed on first use — so tests and modules that import
 * this file without a configured backend never create a network client.
 * Single-profile mode: one user, one account, one cloud session.
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (client === undefined) {
    client = isSyncConfigured()
      ? createClient(supabaseConfig.url, supabaseConfig.anonKey, {
          auth: {
            storage: AsyncStorage,
            autoRefreshToken: true,
            persistSession: true,
            // Native apps authenticate via OTP, not a URL redirect, so never
            // try to parse a session out of the navigation URL.
            detectSessionInUrl: false,
          },
        })
      : null;
  }
  return client;
}
