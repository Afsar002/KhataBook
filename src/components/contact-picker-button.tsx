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
        ContactField.PHONES,
      ]);
      const name = details?.fullName?.trim() ?? '';
      const phone = details?.phones?.[0]?.number ?? '';
      if (name || phone) {
        // Keep digits (and a leading +) so the phone field stays clean.
        onPicked(name, phone.replace(/[^+\d]/g, ''));
      }
    } catch {
      // Permission denied or picker unavailable — leave the form as-is.
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
