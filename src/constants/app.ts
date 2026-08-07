/**
 * Single source of truth for the app version, injected from `app.json`
 * `expo.version` at build time. The fallback keeps the value readable in test
 * environments where expo-constants is mocked.
 */
import Constants from 'expo-constants';

export const APP_VERSION: string = Constants.expoConfig?.version ?? '1.12.0';
