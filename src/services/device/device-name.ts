/**
 * Per-device name ("Shop counter", "Home phone") used for "Last Sync from".
 *
 * Device-local (AsyncStorage): the name identifies THIS device, so it must
 * never sync as a setting (every device would then share one name). Instead
 * the sync engine stamps it into the synced `last_sync_from` setting after a
 * successful push, so other devices see which device last edited.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const DEVICE_NAME_KEY = 'dailykhata:device-name';

export async function getDeviceName(): Promise<string> {
  return (await AsyncStorage.getItem(DEVICE_NAME_KEY)) ?? '';
}

export async function setDeviceName(name: string): Promise<void> {
  const trimmed = name.trim();
  if (trimmed) {
    await AsyncStorage.setItem(DEVICE_NAME_KEY, trimmed);
  } else {
    await AsyncStorage.removeItem(DEVICE_NAME_KEY);
  }
}
