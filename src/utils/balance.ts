/**
 * Shared party balance calculation utilities.
 *
 * Balance sign convention (consistent across the entire app):
 * - Customer: balance = Σ(out) − Σ(in). Positive → they owe you (Receivable).
 * - Supplier: balance = Σ(in) − Σ(out). Positive → you owe them (Payable).
 *
 * This module provides the single source of truth for all balance-related
 * calculations, ensuring Home, Khata, Reports, PDF, and Excel all produce
 * identical totals from the same data.
 */

import type { PartyBalance, PartyType } from '@/types';
import { formatINR } from '@/utils/format';

/**
 * Whether a party balance represents money we expect to receive.
 *
 * balance > 0 + customer → they owe us → receivable
 * balance > 0 + supplier → we owe them → payable
 * balance < 0 + customer → we owe them → payable
 * balance < 0 + supplier → they owe us → receivable
 * balance === 0 → settled
 */
export function isPartyReceivable(type: PartyType, balance: number): boolean {
  if (balance === 0) {
    return true; // Settled parties are technically receivable (no debt)
  }
  const youOwe = balance > 0 ? type === 'supplier' : type === 'customer';
  return !youOwe;
}

/**
 * Plain-language label for a party balance.
 */
export function partyBalanceLabel(type: PartyType, balance: number): string {
  if (balance === 0) {
    return 'Settled';
  }
  const amount = formatINR(Math.abs(balance));
  return isPartyReceivable(type, balance) ? `You'll receive ${amount}` : `You'll pay ${amount}`;
}

/**
 * Color for a party balance based on its sign and type.
 */
export function partyBalanceColor(
  type: PartyType,
  balance: number,
  theme: { income: string; expense: string; textSecondary: string }
): string {
  if (balance === 0) {
    return theme.textSecondary;
  }
  return isPartyReceivable(type, balance) ? theme.income : theme.expense;
}

/**
 * Calculates aggregate khata summary from a list of party balances.
 *
 * This is the SINGLE SOURCE OF TRUTH for summary calculations.
 * All screens (Khata list, Reports, PDF, Excel) must use this function.
 *
 * @param parties - Array of party balances from the database
 * @returns Summary with total receivable, payable, and net balance
 *
 * Example:
 * - Customer with +30,000 → receivable += 30,000
 * - Customer with -50,000 → payable += 50,000 (absolute value)
 * - Supplier with +80,000 → payable += 80,000
 * - Supplier with -20,000 → receivable += 20,000 (absolute value)
 */
export function calculateKhataSummary(parties: PartyBalance[]): {
  receivable: number;
  payable: number;
  net: number;
} {
  let receivable = 0;
  let payable = 0;

  for (const party of parties) {
    if (party.balance > 0) {
      // Positive balance
      if (party.type === 'customer') {
        // Customer owes us
        receivable += party.balance;
      } else {
        // We owe supplier
        payable += party.balance;
      }
    } else if (party.balance < 0) {
      // Negative balance (absolute value)
      const absBalance = Math.abs(party.balance);
      if (party.type === 'customer') {
        // We owe customer
        payable += absBalance;
      } else {
        // Supplier owes us
        receivable += absBalance;
      }
    }
    // balance === 0 → settled, no action needed
  }

  return {
    receivable,
    payable,
    net: receivable - payable,
  };
}

/**
 * Determines if a party balance increases when a transaction is added.
 *
 * Used for:
 * - Running balance calculations in statements
 * - Debit/credit classification in Excel exports
 * - UI indicators in party transaction items
 */
export function entryIncreasesBalance(type: PartyType, direction: 'in' | 'out'): boolean {
  return (type === 'customer' && direction === 'out') || (type === 'supplier' && direction === 'in');
}

/**
 * Maps a (party type, direction) pair to its UI action key.
 */
export function actionForDirection(type: PartyType, direction: 'in' | 'out'): 'give' | 'receive' | 'take' | 'pay' {
  if (type === 'customer') {
    return direction === 'out' ? 'give' : 'receive';
  }
  return direction === 'in' ? 'take' : 'pay';
}

/**
 * Calculates the running balance for a party statement.
 *
 * This ensures the statement running balance matches the actual party balance.
 */
export function calculateRunningBalance(
  partyType: PartyType,
  transactions: { direction: 'in' | 'out'; amount: number }[],
  openingBalance: number = 0
): number[] {
  const balances: number[] = [];
  let running = openingBalance;

  for (const tx of transactions) {
    if (entryIncreasesBalance(partyType, tx.direction)) {
      running += tx.amount;
    } else {
      running -= tx.amount;
    }
    balances.push(running);
  }

  return balances;
}