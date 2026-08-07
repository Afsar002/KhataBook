/**
 * Error boundary to catch React component errors and prevent white-screen crashes.
 * Wraps the entire app tree in _layout.tsx so any unhandled error shows a friendly
 * recovery screen instead of crashing the app.
 */
import { Component, ReactNode } from 'react';
import { Alert, Button, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';

import { Spacing } from '@/constants/theme';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional fallback UI; if not provided, uses default recovery screen. */
  fallback?: ReactNode;
}

interface ErrorFallbackProps {
  error: Error | null;
  onReset: () => void;
  onReport: () => void;
}

/**
 * Functional fallback component that uses the theme hook.
 * This is separated from the class ErrorBoundary so that hooks
 * (useTheme) are called inside a function component, not a class.
 */
function ErrorFallback({ error, onReset, onReport }: ErrorFallbackProps) {
  const isDev = Constants.appOwnership === 'expo';

  // Theme-independent fallback: this boundary sits ABOVE ThemeProvider, so the
  // theme context is unavailable here. Using plain colors avoids a crash loop
  // where the fallback itself throws and remounts the whole tree.
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.icon}>⚠️</Text>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.message}>
          The app encountered an unexpected error. Your data is safe.
        </Text>

        {isDev && error && (
          <View style={styles.devInfo}>
            <Text style={styles.devText}>{error.message}</Text>
            {error.stack && <Text style={styles.stack}>{error.stack}</Text>}
          </View>
        )}

        <View style={styles.buttonRow}>
          <Button title="Try Again" onPress={onReset} color="#2563EB" accessibilityLabel="Try again" />
          <Button title="Report Error" onPress={onReport} color="#6B7280" accessibilityLabel="Report error" />
        </View>

        <Text style={styles.footnote}>If this keeps happening, please restart the app.</Text>
      </View>
    </View>
  );
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.setState({ error, errorInfo });
    // Log to console for debugging
    console.error('ErrorBoundary caught:', error, errorInfo);
    // In production, you could send to a crash reporting service here
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleReport = (): void => {
    const { error } = this.state;
    const message = error?.message ?? 'Unknown error';
    const stack = error?.stack ?? '';
    Alert.alert(
      'Error Details',
      `${message}\n\n${stack}`,
      [
        { text: 'Copy', onPress: () => {/* Clipboard not available without expo-clipboard */} },
        { text: 'OK', style: 'cancel' },
      ]
    );
  };

  render(): ReactNode {
    const { hasError, error } = this.state;
    const { fallback } = this.props;

    if (hasError) {
      if (fallback) {
        return fallback;
      }

      return (
        <ErrorFallback
          error={error}
          onReset={this.handleReset}
          onReport={this.handleReport}
        />
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    backgroundColor: '#FFFFFF',
  },
  content: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    gap: Spacing.three,
  },
  icon: {
    fontSize: 48,
  },
  title: {
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  message: {
    textAlign: 'center',
    lineHeight: 22,
    fontSize: 15,
    color: '#4B5563',
  },
  devInfo: {
    width: '100%',
    padding: Spacing.three,
    borderRadius: 12,
    backgroundColor: '#FFF3F3',
    gap: Spacing.one,
  },
  devText: {
    fontSize: 13,
    color: '#B91C1C',
  },
  stack: {
    fontFamily: 'monospace',
    fontSize: 11,
    lineHeight: 16,
    color: '#6B7280',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    width: '100%',
  },
  footnote: {
    textAlign: 'center',
    marginTop: Spacing.two,
    fontSize: 13,
    color: '#6B7280',
  },
});

/**
 * Hook to access the nearest ErrorBoundary's reset function.
 * Usage: const resetError = useErrorHandler();
 */
export function useErrorHandler(): () => void {
  // This is a placeholder - in a real implementation you'd use context
  // For now, components can call ErrorBoundary's static method via ref
  return () => {};
}