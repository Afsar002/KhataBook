/**
 * Reminder message composition. (The WhatsApp/SMS openers just build a URL and
 * hand it to `Linking.openURL`, so they are thin wrappers over the tested
 * message builder.)
 */
import { buildReminderMessage } from '@/utils/remind';

describe('buildReminderMessage', () => {
  it('asks a customer to clear their due balance', () => {
    const message = buildReminderMessage('Ramesh', 'customer', 1200);
    expect(message).toContain('Ramesh');
    expect(message).toContain('₹1,200');
    expect(message).toContain('pending balance');
  });

  it('notes our pending amount to a supplier', () => {
    const message = buildReminderMessage('Sharma Traders', 'supplier', 500);
    expect(message).toContain('Sharma Traders');
    expect(message).toContain('₹500');
    expect(message).toContain('pending amount');
  });

  it('says the khata is settled when balance is zero', () => {
    const message = buildReminderMessage('Ramesh', 'customer', 0);
    expect(message).toContain('settled');
  });

  it('flips the direction when a customer owes us vs we owe them', () => {
    // Customer with negative balance = they overpaid, so we owe them.
    const customerOweThem = buildReminderMessage('Ramesh', 'customer', -800);
    expect(customerOweThem).toContain('₹800');
    expect(customerOweThem).toContain('pending amount');

    const customerOwesUs = buildReminderMessage('Ramesh', 'customer', 800);
    expect(customerOwesUs).toContain('pending balance');
  });
});
