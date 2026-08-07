/** Party (khata) helpers: balance labels and action metadata. */
import { HandCoins, Send, ShoppingCart, Wallet, type LucideIcon } from 'lucide-react-native';

import type { PartyAction, PartyDirection, PartyType } from '@/types';
import { formatINR } from '@/utils/format';

export const PARTY_ACTIONS: Record<
  PartyAction,
  { title: string; hint: string; direction: PartyDirection; icon: LucideIcon }
> = {
  give: { title: 'Give Money', hint: 'Money given on credit', direction: 'out', icon: Send },
  receive: { title: 'Receive Money', hint: 'Repayment received', direction: 'in', icon: HandCoins },
  take: { title: 'Took on Credit', hint: 'Goods taken on credit', direction: 'in', icon: ShoppingCart },
  pay: { title: 'Paid Money', hint: 'Payment made to supplier', direction: 'out', icon: Wallet },
};

/** Whether a party balance is money we expect to receive (vs. money we owe). */
export function isPartyReceivable(type: PartyType, balance: number): boolean {
  if (balance === 0) {
    return true;
  }
  const youOwe = balance > 0 ? type === 'supplier' : type === 'customer';
  return !youOwe;
}

/** Plain-language label for a party balance, e.g. "You'll receive ₹1,200". */
export function partyBalanceLabel(type: PartyType, balance: number): string {
  if (balance === 0) {
    return 'Settled';
  }
  const amount = formatINR(Math.abs(balance));
  return isPartyReceivable(type, balance) ? `You'll receive ${amount}` : `You'll pay ${amount}`;
}

/** Does a single khata entry increase the party balance? */
export function entryIncreasesBalance(type: PartyType, direction: PartyDirection): boolean {
  return (type === 'customer' && direction === 'out') || (type === 'supplier' && direction === 'in');
}

/** Maps a (party type, direction) pair back to its UI action. */
export function actionForDirection(
  type: PartyType,
  direction: PartyDirection
): PartyAction {
  if (type === 'customer') {
    return direction === 'out' ? 'give' : 'receive';
  }
  return direction === 'in' ? 'take' : 'pay';
}
