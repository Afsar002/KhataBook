/**
 * OnboardingScreen (the 5-step first-run tutorial).
 *
 * Covers the pieces the gate test cannot reach: the actual slide UI renders,
 * swiping/Next/Back move through the pages, and BOTH exit paths — "Get Started"
 * and "Skip" — mark the tutorial complete, call `onDone`, and navigate home.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Dimensions, ScrollView } from 'react-native';

import OnboardingScreen from '@/app/onboarding';
import { router } from 'expo-router';
import { setOnboardingComplete } from '@/services/onboarding/prefs';

jest.mock('@/hooks/use-theme', () => ({
  useTheme: () => ({
    background: '#FFFFFF',
    textSecondary: '#6B7280',
    text: '#111827',
    primary: '#16A34A',
    border: '#E3E7E4',
  }),
}));

jest.mock('expo-router', () => ({
  router: { replace: jest.fn() },
}));

jest.mock('@/services/onboarding/prefs', () => ({
  setOnboardingComplete: jest.fn().mockResolvedValue(undefined),
  getOnboardingComplete: jest.fn().mockResolvedValue(true),
}));

jest.mock('@/utils/haptics', () => ({
  impact: jest.fn(),
  notify: jest.fn(),
  selection: jest.fn(),
}));

// ScrollView.prototype.scrollTo hits the native layer; stub it so Next/Back
// presses (which call goTo → scrollRef.scrollTo) don't throw under the test
// renderer. Page state still only changes via momentumScrollEnd, matching real
// swipe behavior.
jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => {});

const WIDTH = Dimensions.get('window').width;

function swipeTo(page: number) {
  const scroll = screen.UNSAFE_getByType(ScrollView);
  fireEvent(scroll, 'momentumScrollEnd', {
    nativeEvent: { contentOffset: { x: WIDTH * page, y: 0 } },
  });
}

describe('OnboardingScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders all five slides with the page counter and starts on step 1', () => {
    render(<OnboardingScreen />);

    expect(screen.getByText('Welcome to DailyKhata')).toBeTruthy();
    expect(screen.getByText('Record money in & out')).toBeTruthy();
    expect(screen.getByText('Track credit out')).toBeTruthy();
    expect(screen.getByText('Reconcile your cash')).toBeTruthy();
    expect(screen.getByText('Optional cloud sync')).toBeTruthy();

    expect(screen.getByText('1 of 5')).toBeTruthy();
    expect(screen.getByText('Next')).toBeTruthy();
    // No way back on the first step; the finishing CTA only appears on the last.
    expect(screen.queryByText('Back')).toBeNull();
    expect(screen.queryByText('Get Started')).toBeNull();
  });

  it('advances and returns through the steps with Next / Back', () => {
    render(<OnboardingScreen />);

    fireEvent.press(screen.getByText('Next'));
    swipeTo(1);
    expect(screen.getByText('2 of 5')).toBeTruthy();
    expect(screen.getByText('Back')).toBeTruthy();

    fireEvent.press(screen.getByText('Back'));
    swipeTo(0);
    expect(screen.getByText('1 of 5')).toBeTruthy();
    expect(screen.queryByText('Back')).toBeNull();
  });

  it('shows Get Started on the last step', () => {
    render(<OnboardingScreen />);
    swipeTo(4);
    expect(screen.getByText('Get Started')).toBeTruthy();
    expect(screen.queryByText('Next')).toBeNull();
  });

  it('marks complete, calls onDone and navigates home on Get Started', async () => {
    const onDone = jest.fn();
    render(<OnboardingScreen onDone={onDone} />);
    swipeTo(4);

    fireEvent.press(screen.getByText('Get Started'));

    await waitFor(() => expect(setOnboardingComplete).toHaveBeenCalled());
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(router.replace).toHaveBeenCalledWith('/');
  });

  it('marks complete, calls onDone and navigates home on Skip', async () => {
    const onDone = jest.fn();
    render(<OnboardingScreen onDone={onDone} />);

    fireEvent.press(screen.getByLabelText('Skip tutorial'));

    await waitFor(() => expect(setOnboardingComplete).toHaveBeenCalled());
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(router.replace).toHaveBeenCalledWith('/');
  });
});
