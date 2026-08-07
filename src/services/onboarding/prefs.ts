/**
 * Device-local first-run tutorial flag.
 *
 * Stored in AsyncStorage, NOT the SQLite `settings` table — whether the user
 * has seen the onboarding tutorial is per-device, and syncing it to the cloud
 * would make the guide disappear on a brand-new phone that actually needs it.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_COMPLETE_KEY = 'dailykhata:onboarding:complete';

/** Whether the first-run tutorial has been finished on this device. */
export async function getOnboardingComplete(): Promise<boolean> {
  return (await AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY)) === 'true';
}

/** Marks the tutorial as done so it is not shown again. */
export async function setOnboardingComplete(): Promise<void> {
  await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true');
}
