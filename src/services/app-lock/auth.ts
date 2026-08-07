/**
 * Thin wrapper around `expo-local-authentication` for the app lock.
 *
 * Authentication uses the phone's own credentials: biometrics (fingerprint /
 * face) with a fallback to the device PIN, pattern or passcode. It is not
 * supported on web, where the app lock is disabled entirely.
 */
import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

/** Whether this device has a usable lock (biometrics or a device credential). */
export async function hasDeviceCredentials(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return false;
  }
  // Use getEnrolledLevelAsync for SDK 57+ - it properly detects all credential types
  // including device credentials (PIN, pattern, password) not just biometrics
  try {
    const enrolledLevel = await LocalAuthentication.getEnrolledLevelAsync();
    return enrolledLevel !== LocalAuthentication.SecurityLevel.NONE;
  } catch {
    // Fallback for older SDK versions or unexpected errors
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    return hasHardware && isEnrolled;
  }
}

/**
 * Prompts the user with the phone's lock screen. Resolves `true` when the
 * biometric / passcode check succeeds.
 */
export async function authenticateWithDevice(
  promptMessage: string,
  cancelLabel: string
): Promise<boolean> {
  if (Platform.OS === 'web') {
    return false;
  }
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage,
    cancelLabel,
    disableDeviceFallback: false,
  });
  return result.success;
}
