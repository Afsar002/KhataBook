import '@/utils/log'; // console gate — must run before any other module logs

import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import {
  DarkTheme,
  DefaultTheme,
  Redirect,
  Stack,
  ThemeProvider as NavigationThemeProvider,
  usePathname,
} from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { AppLockGate } from '@/components/app-lock-gate';
import { ErrorBoundary } from '@/components/error-boundary';
import { FeedbackProvider } from '@/components/feedback';
import { OnboardingGate } from '@/components/onboarding-gate';
import { SyncStatusBanner } from '@/components/sync-status-banner';
import { Colors } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/context/auth-context';
import { ProfileProvider } from '@/context/profile-context';
import { SyncProvider } from '@/context/sync-context';
import { ThemeProvider, useAppTheme } from '@/context/theme-context';
import { initDatabase } from '@/db/database';
import { registerRecurringTask } from '@/services/recurring/scheduler';
import { initNotifications, UpdateWatcher } from '@/services/notifications';

SplashScreen.preventAutoHideAsync();

/**
 * Shows the sign-in screen when cloud sync is configured but no one is signed
 * in. When sync is not configured (no `.env`), the app runs fully offline and
 * this gate renders nothing.
 */
function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const { scheme } = useAppTheme();
  const pathname = usePathname();
  const background = Colors[scheme].background;

  if (status === 'loading') {
    return (
      <View style={[styles.authLoading, { backgroundColor: background }]}>
        <ActivityIndicator size="large" color={Colors[scheme].primary} />
      </View>
    );
  }
  // Same pathname guard as OnboardingGate: without it, once signed out this
  // gate re-fires `<Redirect href="/auth" />` even while already on /auth,
  // remounting the layout in a loop instead of showing the sign-in screen.
  if (status === 'signedOut' && pathname !== '/auth') {
    return <Redirect href="/auth" />;
  }
  return <>{children}</>;
}

// Module-level init state so it survives remounts. A ref-based guard resets on
// every fresh mount, so if the tree remounts (e.g. a redirect or a provider
// throwing during render) initDatabase() would re-run in an infinite loop —
// the repeated "[Database] Initialization complete" logs. Hoisting the state
// here makes initialization idempotent across remounts.
type DbInitState = 'idle' | 'running' | 'ready' | 'error';
let dbInitState: DbInitState = 'idle';
let dbInitError: string | null = null;
let hasRegisteredRecurring = false;

function DatabaseReadyGate({ children }: { children: ReactNode }) {
  const [dbReady, setDbReady] = useState(dbInitState === 'ready');
  const [error, setError] = useState<string | null>(dbInitError);

  useEffect(() => {
    // Already resolved in a previous mount — reflect the stored result.
    if (dbInitState === 'ready' || dbInitState === 'error') {
      setDbReady(dbInitState === 'ready');
      setError(dbInitError);
      return;
    }
    // Another mount is already initializing; wait for it to finish.
    if (dbInitState === 'running') {
      return;
    }
    dbInitState = 'running';

    let mounted = true;
    console.log('[Database] Starting database initialization...');

    initDatabase()
      .then(() => {
        if (!mounted) {
          return;
        }
        dbInitState = 'ready';
        console.log('[Database] ✅ Initialization complete');
        setDbReady(true);
        // Register recurring transaction background task after DB is ready.
        // Only register once (module-level flag survives remounts).
        if (!hasRegisteredRecurring) {
          hasRegisteredRecurring = true;
          void registerRecurringTask();
        }
        // Local notifications: foreground handler, Android channel, sync-outcome
        // subscription and the recurring reminder re-arm. No-ops on web.
        void initNotifications();
      })
      .catch((err) => {
        if (!mounted) {
          return;
        }
        const errorMessage = err instanceof Error ? err.message : String(err);
        dbInitState = 'error';
        dbInitError = errorMessage;
        console.error('[Database] ❌ Initialization failed:', errorMessage);
        // Do NOT proceed with a half-built schema — every query would throw
        // "no such table". Show the error so the user can restart or report
        // it, instead of cascading into uncaught promise rejections.
        setError(errorMessage);
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (error) {
    return (
      <View style={styles.dbError}>
        <Text style={styles.dbErrorTitle}>Database setup failed</Text>
        <Text style={styles.dbErrorMessage}>{error}</Text>
        <Text style={styles.dbErrorHint}>
          Restart the app. If the problem persists, use “Clear all data” from a fresh install.
        </Text>
      </View>
    );
  }

  if (!dbReady) {
    // Plain Text (not ThemedText): ThemeProvider mounts only after the DB is
    // ready, so the theme context is unavailable while this screen is shown.
    return (
      <View style={styles.dbLoading}>
        <ActivityIndicator size="large" color={Colors.light.primary} />
        <Text style={styles.dbLoadingText}>Initializing database…</Text>
        <Text style={styles.dbLoadingSubtext}>Setting up tables and applying schema migrations</Text>
      </View>
    );
  }

  return <>{children}</>;
}

/** Navigation stack with theme-aware colors. */
function NavigationStack() {
  const { scheme } = useAppTheme();
  const palette = Colors[scheme];
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;

  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: palette.primary,
      background: palette.background,
      card: palette.card,
      text: palette.text,
      border: palette.border,
    },
  };

  return (
    <NavigationThemeProvider value={navTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="auth" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="search" />
        <Stack.Screen name="cashbook" />
        <Stack.Screen name="history-report" />
        <Stack.Screen name="history-day/[date]" />
        <Stack.Screen name="categories" />
        <Stack.Screen name="export" />
        <Stack.Screen name="recurring" />
        <Stack.Screen name="reset-password" />
        <Stack.Screen
          name="expense"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="income"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen name="party/[id]" />
        <Stack.Screen
          name="party/new"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="party/entry"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="party/edit"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen name="accounts" />
        <Stack.Screen name="account/[id]" />
        <Stack.Screen
          name="account/new"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="transfer"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="party/pick"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
      </Stack>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  // The database must be initialized BEFORE any provider mounts: ThemeProvider,
  // ProfileProvider, AuthProvider and SyncProvider all query SQLite in their
  // mount effects, and AuthProvider→onAuthChanged() triggers a sync pull that
  // writes to `parties`/`party_transactions`. Wrapping them in
  // DatabaseReadyGate guarantees the schema exists first, otherwise the first
  // boot races and throws "no such table: parties".
  // ErrorBoundary is the OUTERMOST wrapper so any render error in the
  // providers below is caught here. If it were nested deeper, a provider
  // throwing during render would unmount the whole tree and remount it,
  // re-running initDatabase() in an infinite loop (the repeated
  // "[Database] Initialization complete" logs). Its fallback is
  // theme-independent because it sits above ThemeProvider.
  return (
    <ErrorBoundary>
      <DatabaseReadyGate>
        <ThemeProvider>
          <FeedbackProvider>
            <UpdateWatcher />
            <ProfileProvider>
              <AuthProvider>
                <SyncProvider>
                  <AuthGate>
                    <OnboardingGate>
                      <AppLockGate>
                        <SyncStatusBanner />
                        <NavigationStack />
                      </AppLockGate>
                    </OnboardingGate>
                  </AuthGate>
                </SyncProvider>
              </AuthProvider>
            </ProfileProvider>
          </FeedbackProvider>
        </ThemeProvider>
      </DatabaseReadyGate>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  authLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dbLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  dbLoadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#1A1A1A',
  },
  dbLoadingSubtext: {
    marginTop: 8,
    fontSize: 14,
    color: '#6B7280',
  },
  dbError: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    padding: 32,
  },
  dbErrorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#B91C1C',
    marginBottom: 12,
  },
  dbErrorMessage: {
    fontSize: 14,
    color: '#374151',
    textAlign: 'center',
    marginBottom: 16,
  },
  dbErrorHint: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
  },
});