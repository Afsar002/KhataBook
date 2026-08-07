/**
 * ErrorBoundary tests.
 *
 * Uses the jest-expo preset's real react-native environment (no hand-rolled
 * react-native mock — that broke the preset and caused the DevMenu error).
 * The theme hook is mocked so ErrorFallback renders without a theme provider.
 */
import { ErrorBoundary } from '@/components/error-boundary';
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Alert, Text } from 'react-native';

jest.mock('@/hooks/use-theme', () => ({
  useTheme: () => ({
    background: '#FFFFFF',
    text: '#111827',
    textSecondary: '#8E8E93',
    primary: '#00AA55',
    danger: '#FF3B30',
  }),
}));

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // React logs caught errors even when a boundary handles them.
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const ThrowError = ({ shouldThrow }: { shouldThrow: boolean }) => {
    if (shouldThrow) {
      throw new Error('Test error');
    }
    return <Text>Child content</Text>;
  };

  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Child content')).toBeTruthy();
  });

  it('shows a custom fallback when provided', () => {
    render(
      <ErrorBoundary fallback={<Text>Custom fallback</Text>}>
        <ThrowError shouldThrow />
      </ErrorBoundary>
    );
    expect(screen.getByText('Custom fallback')).toBeTruthy();
  });

  it('shows the default error UI when no fallback is provided', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow />
      </ErrorBoundary>
    );
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(screen.getByText('The app encountered an unexpected error. Your data is safe.')).toBeTruthy();
  });

  it('shows the error message in development mode', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow />
      </ErrorBoundary>
    );
    expect(screen.getByText('Test error')).toBeTruthy();
  });

  it('recovers when "Try Again" resets the boundary and the child stops throwing', () => {
    let shouldThrow = true;
    const Flaky = () => {
      if (shouldThrow) {
        throw new Error('flaky');
      }
      return <Text>Recovered</Text>;
    };

    render(
      <ErrorBoundary>
        <Flaky />
      </ErrorBoundary>
    );
    expect(screen.getByText('Something went wrong')).toBeTruthy();

    shouldThrow = false;
    fireEvent.press(screen.getByText('Try Again'));
    expect(screen.getByText('Recovered')).toBeTruthy();
  });

  it('shows error details when "Report Error" is pressed', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowError shouldThrow />
      </ErrorBoundary>
    );
    fireEvent.press(screen.getByText('Report Error'));

    expect(alertSpy).toHaveBeenCalledWith(
      'Error Details',
      expect.stringContaining('Test error'),
      expect.anything()
    );
  });

  it('getDerivedStateFromError captures the error', () => {
    const state = ErrorBoundary.getDerivedStateFromError(new Error('Static error'));
    expect(state.hasError).toBe(true);
    expect(state.error).toBeInstanceOf(Error);
    expect(state.error?.message).toBe('Static error');
  });
});
