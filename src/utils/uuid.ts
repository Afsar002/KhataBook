/**
 * UUID v4 generator.
 *
 * Uses `crypto.getRandomValues`, polyfilled on React Native by
 * `react-native-get-random-values` (also required by Supabase). Generation is
 * fully local — no network and no native module of its own.
 */
import 'react-native-get-random-values';

interface Rng {
  getRandomValues: (array: Uint8Array) => Uint8Array;
}

/** Returns a random RFC-4122 version 4 UUID string. */
export function uuid(): string {
  const rng = (globalThis as { crypto?: Rng }).crypto;
  if (!rng) {
    throw new Error('crypto.getRandomValues is unavailable; import react-native-get-random-values first.');
  }
  const bytes = new Uint8Array(16);
  rng.getRandomValues(bytes);
  // Version 4 + variant 10.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
