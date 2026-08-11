/**
 * Unit tests for the account-balance overdraft projection helpers.
 *
 * These power the "balance will go negative" confirmation in the transaction
 * and transfer forms, so the math is locked down here (plain expenses,
 * transfers, and the edit-mode revert correction).
 */
import type { AccountBalance } from '@/types';
import {
  accountProjectedBalance,
  accountWouldOverdraft,
  buildOverdraftMessage,
} from '@/utils/account-balance';

function makeBalance(id: number, name: string, balance: number): AccountBalance {
  return { id, name, type: 'cash', openingBalance: 0, sortOrder: id, balance };
}

const balances: AccountBalance[] = [
  makeBalance(1, 'Cash', 1000),
  makeBalance(2, 'Bank', 2500),
];

describe('accountProjectedBalance', () => {
  it('subtracts an outflow (expense / transfer out)', () => {
    expect(accountProjectedBalance(balances, 1, 'out', 400)).toBe(600);
  });

  it('adds an inflow (income / transfer in)', () => {
    expect(accountProjectedBalance(balances, 2, 'in', 500)).toBe(3000);
  });

  it('can project below zero', () => {
    expect(accountProjectedBalance(balances, 1, 'out', 1500)).toBe(-500);
  });

  it('returns null when the account is not in the loaded balances', () => {
    expect(accountProjectedBalance(balances, 99, 'out', 10)).toBeNull();
  });

  describe('edit mode (revert the old entry first)', () => {
    it('adds back an old outflow before applying a new outflow', () => {
      // Current balance already includes the old ₹800 expense; replacing it
      // with ₹900 should project 1000 + 800 - 900 = 900.
      expect(accountProjectedBalance(balances, 1, 'out', 900, { flow: 'out', amount: 800 })).toBe(900);
    });

    it('adds back an old inflow before applying a smaller inflow', () => {
      // A ₹2000 income was on Cash (balance 1000); reducing it to ₹1500
      // should project 1000 - 2000 + 1500 = 500.
      expect(accountProjectedBalance(balances, 1, 'in', 1500, { flow: 'in', amount: 2000 })).toBe(500);
    });

    it('reverts across flow directions correctly', () => {
      // Old income ₹2000 on Cash, now editing it to an outflow-equivalent
      // guard is not used, but the math must still be sane: 1000 - 2000 - 100.
      expect(accountProjectedBalance(balances, 1, 'out', 100, { flow: 'in', amount: 2000 })).toBe(-1100);
    });
  });
});

describe('accountWouldOverdraft', () => {
  it('is true when the projection goes below zero', () => {
    expect(accountWouldOverdraft(balances, 1, 'out', 1500)).toBe(true);
  });

  it('is false when the account breaks even', () => {
    expect(accountWouldOverdraft(balances, 1, 'out', 1000)).toBe(false);
  });

  it('is false when there is money to spare', () => {
    expect(accountWouldOverdraft(balances, 1, 'in', 50)).toBe(false);
  });

  it('is false when the account is unknown (stale/loading balances)', () => {
    expect(accountWouldOverdraft(balances, 99, 'out', 10)).toBe(false);
  });

  it('accounts for the reverted old entry in edit mode', () => {
    // Bank has 2500, already including an old ₹3000 expense being reduced to
    // ₹2600: 2500 + 3000 - 2600 = 2900 → no overdraft.
    expect(accountWouldOverdraft(balances, 2, 'out', 2600, { flow: 'out', amount: 3000 })).toBe(false);
    // But reducing an old ₹100 income edit to nothing-overdraft scenario:
    expect(accountWouldOverdraft(balances, 1, 'out', 1500, { flow: 'out', amount: 0 })).toBe(true);
  });
});

describe('buildOverdraftMessage', () => {
  it('writes a clear, plain-language message', () => {
    const message = buildOverdraftMessage('Cash', 1500, 'out', 1000, -500);
    expect(message).toContain('expense of ₹1,500');
    expect(message).toContain('Cash balance (₹1,000)');
    expect(message).toContain('Balance will become -₹500');
  });

  it('uses income wording for inflow edits', () => {
    const message = buildOverdraftMessage('Bank', 1500, 'in', 1000, -500);
    expect(message).toContain('income of ₹1,500');
  });
});
