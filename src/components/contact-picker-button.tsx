/**
 * "Pick from contacts" button — opens the native contact picker and hands the
 * chosen name + phone back to the party form.
 *
 * Uses `Contact.presentPicker()` (the system UI): on Android it needs no broad
 * contacts permission, on iOS it prompts once. Guarded so a denial or an
 * unavailable platform just leaves the form untouched.
 */
import { Contact, ContactField } from 'expo-contacts';
import { UserRound } from 'lucide-react-native';
import { useState } from 'react';

import { feedback } from '@/components/feedback';
import { LargeButton } from '@/components/large-button';

type ContactPickerButtonProps = {
  onPicked: (name: string, phone: string) => void;
};

export function ContactPickerButton({ onPicked }: ContactPickerButtonProps) {
  const [picking, setPicking] = useState(false);

  const pick = async () => {
    if (picking) {
      return;
    }
    setPicking(true);
    try {
      const contact = await Contact.presentPicker();
      if (!contact) {
        return; // cancelled
      }
      const details = await contact.getDetails([
        ContactField.FULL_NAME,
        ContactField.GIVEN_NAME,
        ContactField.FAMILY_NAME,
        ContactField.PHONES,
      ]);
      // `fullName` can be null on Android — compose it from the name parts.
      const fullName = details?.fullName?.trim() ?? '';
      const composedName = [details?.givenName, details?.familyName]
        .filter(Boolean)
        .join(' ')
        .trim();
      const name = fullName || composedName;
      const phone = details?.phones?.[0]?.number ?? '';
      if (name || phone) {
        // Keep digits (and a leading +) so the phone field stays clean.
        onPicked(name, phone.replace(/[^+\d]/g, ''));
      } else {
        feedback.toast({
          message: 'Selected contact has no name or phone number',
          tone: 'info',
        });
      }
    } catch (err) {
      console.warn('[ContactPickerButton] picker failed', err);
      feedback.toast({
        message: 'Could not pick contact — permission denied or unavailable',
        tone: 'error',
      });
    } finally {
      setPicking(false);
    }
  };

  return (
    <LargeButton
      title="Pick from contacts"
      variant="outline"
      icon={UserRound}
      onPress={pick}
      disabled={picking}
    />
  );
}
