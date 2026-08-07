/**
 * Production console gate.
 *
 * Dev builds keep full console output. Production builds silence the noisy
 * `log`/`warn` levels (startup noise, background-task chatter, sync retries)
 * while keeping `console.error`, which every catch block relies on for real
 * diagnostics.
 *
 * Import this module FIRST in the root layout so the gate is armed before any
 * other module can log.
 */
if (!__DEV__) {
  const silent = (): void => {};
  console.log = silent;
  console.warn = silent;
}
