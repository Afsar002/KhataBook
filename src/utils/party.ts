/** Party (khata) helpers: balance labels and action metadata. */
import { HandCoins, Send, ShoppingCart, Wallet, type LucideIcon } from 'lucide-react-native';

import type { PartyAction, PartyDirection, PartyType } from '@/types';
import {
  isPartyReceivable as isReceivable,
  partyBalanceLabel as getBalanceLabel,
} from '@/utils/balance';

export const PARTY_ACTIONS: Record<
  PartyAction,
  { title: string; hint: string; direction: PartyDirection; icon: LucideIcon }
> = {
  give: { title: 'Money Out', hint: 'Money out on credit', direction: 'out', icon: Send },
  receive: { title: 'Money In', hint: 'Repayment in', direction: 'in', icon: HandCoins },
  take: { title: 'Took on Credit', hint: 'Goods taken on credit', direction: 'in', icon: ShoppingCart },
  pay: { title: 'Paid Money', hint: 'Payment made to supplier', direction: 'out', icon: Wallet },
};

/** Whether a party balance is money we expect to receive (vs. money we owe). */
export function isPartyReceivable(type: PartyType, balance: number): boolean {
  return isReceivable(type, balance);
}

/** Plain-language label for a party balance, e.g. "You'll receive ₹1,200". */
export function partyBalanceLabel(type: PartyType, balance: number): string {
  return getBalanceLabel(type, balance);
}

/** Does a single khata entry increase the party balance? */
export { entryIncreasesBalance } from '@/utils/balance';

/** Maps a (party type, direction) pair back to its UI action. */
export { actionForDirection } from '@/utils/balance';
