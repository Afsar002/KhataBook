/**
 * Payment reminders — compose a short khata message and open WhatsApp or the
 * SMS app with it pre-filled. The phone number comes from the party's saved
 * contact (or the contacts picker on the add/edit screens).
 */
import { Linking } from 'react-native';

import type { PartyType } from '@/types';
import { formatINR } from '@/utils/format';
import { isPartyReceivable } from '@/utils/party';

/** Builds a short, friendly reminder for the party's current balance. */
export function buildReminderMessage(
  name: string,
  type: PartyType,
  balance: number
): string {
  const amount = formatINR(Math.abs(balance));
  if (balance === 0) {
    return `Hi ${name}, your khata with us is settled. Thank you! - DailyKhata`;
  }
  if (isPartyReceivable(type, balance)) {
    // They owe us.
    return (
      `Namaste ${name}! Gentle reminder that your pending balance of ${amount} ` +
      `is due. Please clear it at your earliest. - DailyKhata`
    );
  }
  // We owe them.
  return (
    `Namaste ${name}! A quick update on our pending amount of ${amount} ` +
    `with you. We will clear it soon. - DailyKhata`
  );
}

/** Digits only (keeps a country code like 91... which wa.me accepts). */
function digits(phone: string): string {
  return phone.replace(/[^0-9]/g, '');
}

/** Opens WhatsApp chat with the message pre-filled. */
export function openWhatsApp(phone: string, message: string): void {
  const number = digits(phone);
  if (!number) {
    return;
  }
  void Linking.openURL(`https://wa.me/${number}?text=${encodeURIComponent(message)}`);
}

/** Opens the SMS app with the message pre-filled. */
export function openSms(phone: string, message: string): void {
  const number = digits(phone);
  if (!number) {
    return;
  }
  void Linking.openURL(`sms:${number}?body=${encodeURIComponent(message)}`);
}
