/**
 * Account-balance projection helpers for the overdraft confirmation.
 *
 * The Home screen shows each account's running balance (Cash / Total Bank /
 * Total). Before recording an entry that would push an account below zero we
 * ask the user to confirm — this module is the single source of truth for that
 * projection and the confirm message, so the transaction and transfer forms
 * behave identically.
 */

import type { AccountBalance } from '@/types';
import { formatINR } from '@/utils/format';

/** Whether the recorded entry adds money to ('in') or removes money from ('out') an account. */
export type LedgerFlow = 'in' | 'out';

/** An existing entry on the same account that an edit will replace. */
export type Revert = { flow: LedgerFlow; amount: number };

/**
 * Projected balance of `accountId` after recording `flow` of `amount`,
 * optionally first reverting an existing entry on the same account (edit mode).
 *
 * Edit-mode math: the current balance already includes the old entry, so add
 * it back before applying the new one. Returns `null` when the account isn't
 * in the loaded balances — callers treat that as "no guard" rather than
 * blocking on stale data.
 */
export function accountProjectedBalance(
  balances: AccountBalance[],
  accountId: number,
  flow: LedgerFlow,
  amount: number,
  revert: Revert | null = null
): number | null {
  const account = balances.find((b) => b.id === accountId);
  if (!account) {
    return null;
  }
  let projected = account.balance;
  if (revert) {
    projected += revert.flow === 'out' ? revert.amount : -revert.amount;
  }
  projected += flow === 'in' ? amount : -amount;
  return projected;
}

/** True when recording the entry would push the account balance below zero. */
export function accountWouldOverdraft(
  balances: AccountBalance[],
  accountId: number,
  flow: LedgerFlow,
  amount: number,
  revert: Revert | null = null
): boolean {
  const projected = accountProjectedBalance(balances, accountId, flow, amount, revert);
  return projected !== null && projected < 0;
}

/**
 * Plain-language confirmation message, e.g.
 * "This expense of ₹1,500 is more than the Cash balance (₹1,000).\nBalance will become −₹500."
 */
export function buildOverdraftMessage(
  accountName: string,
  amount: number,
  flow: LedgerFlow,
  current: number,
  projected: number
): string {
  const action = flow === 'out' ? 'expense' : 'income';
  const amountText = formatINR(amount);
  const currentText = formatINR(current);
  const projectedText = formatINR(projected);
  return `This ${action} of ${amountText} is more than the ${accountName} balance (${currentText}).\nBalance will become ${projectedText}.`;
}
