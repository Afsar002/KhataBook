/**
 * OnboardingGate tests.
 *
 * Covers the two things that previously broke the app:
 *  1. The gate must render the tutorial inline (no redirect) when the flag is
 *     false — a redirect here re-mounted the gate in an infinite loop and left
 *     a black screen.
 *  2. Once the tutorial calls `onDone`, the gate must leave it and render the
 *     app. A gate that re-reads the flag only once on mount would keep the
 *     stale "incomplete" state and bounce the user back to the tutorial.
 *
 * The tutorial screen (`@/app/onboarding`) and the prefs service are mocked so
 * no expo-router / native modules are pulled in.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

import { OnboardingGate } from '@/components/onboarding-gate';
import { getOnboardingComplete } from '@/services/onboarding/prefs';

jest.mock('@/services/onboarding/prefs', () => ({
  getOnboardingComplete: jest.fn(),
}));

jest.mock('@/app/onboarding', () => {
  // Mocked tutorial: shows a marker and a "Get Started" button that fires
  // `onDone`, mirroring the real screen's finish flow. Built with
  // createElement (no JSX) because jest.mock factories are hoisted above the
  // imports, so JSX there cannot reference React at transform time.
  const React = require('react');
  const RN = require('react-native');
  const MockOnboarding = ({ onDone }: { onDone?: () => void }) =>
    React.createElement(
      RN.View,
      null,
      React.createElement(RN.Text, null, 'TUTORIAL'),
      React.createElement(
        RN.Pressable,
        { onPress: onDone, testID: 'onboarding-done' },
        React.createElement(RN.Text, null, 'Get Started')
      )
    );
  return { __esModule: true, default: MockOnboarding };
});

const mockedGetOnboardingComplete = getOnboardingComplete as jest.Mock;

describe('OnboardingGate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing while the flag is loading', () => {
    mockedGetOnboardingComplete.mockReturnValue(new Promise(() => {}));
    render(
      <OnboardingGate>
        <Text>APP</Text>
      </OnboardingGate>
    );
    expect(screen.queryByText('TUTORIAL')).toBeNull();
    expect(screen.queryByText('APP')).toBeNull();
  });

  it('renders the tutorial inline when onboarding is incomplete', async () => {
    mockedGetOnboardingComplete.mockResolvedValue(false);
    render(
      <OnboardingGate>
        <Text>APP</Text>
      </OnboardingGate>
    );
    expect(await screen.findByText('TUTORIAL')).toBeTruthy();
    expect(screen.queryByText('APP')).toBeNull();
  });

  it('renders the app directly when onboarding is already complete', async () => {
    mockedGetOnboardingComplete.mockResolvedValue(true);
    render(
      <OnboardingGate>
        <Text>APP</Text>
      </OnboardingGate>
    );
    expect(await screen.findByText('APP')).toBeTruthy();
    expect(screen.queryByText('TUTORIAL')).toBeNull();
  });

  it('leaves the tutorial and shows the app when the tutorial finishes', async () => {
    mockedGetOnboardingComplete.mockResolvedValue(false);
    render(
      <OnboardingGate>
        <Text>APP</Text>
      </OnboardingGate>
    );
    expect(await screen.findByText('TUTORIAL')).toBeTruthy();

    // Simulate the user tapping "Get Started" — the mocked screen calls onDone.
    fireEvent.press(screen.getByTestId('onboarding-done'));

    expect(screen.getByText('APP')).toBeTruthy();
    expect(screen.queryByText('TUTORIAL')).toBeNull();
  });
});
