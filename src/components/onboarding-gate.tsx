/**
 * Shows the first-run tutorial once, then never again.
 *
 * Reads the device-local flag from AsyncStorage (not the synced settings
 * table). While the flag is loading nothing is rendered, so there is no flash
 * of the app before the tutorial appears.
 *
 * The tutorial is rendered INLINE rather than via `<Redirect href="/onboarding" />`.
 * A redirect would deadlock here: the gate sits in the root layout, so the
 * redirect re-fires even after the app has already landed on `/onboarding`,
 * remounting the gate in an infinite loop and leaving the screen black. And on
 * the way out, the gate would still hold the stale "incomplete" state, so
 * finishing the tutorial would bounce straight back to it. Rendering the
 * screen in place and flipping the flag through an `onDone` callback keeps the
 * whole flow inside this component, with no navigation to race against.
 */
import { useEffect, useState, type ReactNode } from 'react';

import OnboardingScreen from '@/app/onboarding';
import { getOnboardingComplete } from '@/services/onboarding/prefs';

export function OnboardingGate({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [complete, setComplete] = useState(true);

  useEffect(() => {
    let mounted = true;
    getOnboardingComplete()
      .then((done) => {
        if (mounted) {
          setComplete(done);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('[OnboardingGate] error:', err);
        // Fail open: if the AsyncStorage read fails, treat onboarding as
        // complete so the app never gets stuck on a white screen.
        if (mounted) {
          setComplete(true);
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return null;
  }
  if (!complete) {
    return <OnboardingScreen onDone={() => setComplete(true)} />;
  }
  return <>{children}</>;
}
