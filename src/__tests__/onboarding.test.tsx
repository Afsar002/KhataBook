/**
 * Onboarding flag: device-local, defaults to "not complete", marks complete.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  getOnboardingComplete,
  setOnboardingComplete,
} from '@/services/onboarding/prefs';

describe('onboarding prefs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('is not complete for a brand-new install', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);

    expect(await getOnboardingComplete()).toBe(false);
    expect(AsyncStorage.getItem).toHaveBeenCalledWith(
      'dailykhata:onboarding:complete'
    );
  });

  it('marks the tutorial complete', async () => {
    await setOnboardingComplete();

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'dailykhata:onboarding:complete',
      'true'
    );
  });

  it('reports complete when the flag is set', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('true');

    expect(await getOnboardingComplete()).toBe(true);
  });
});
