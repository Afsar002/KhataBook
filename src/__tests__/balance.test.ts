/**
 * Unit tests for the shared balance calculation system.
 *
 * Verifies that all screens (Khata list, Customer Details, Reports, PDF, Excel)
 * produce identical totals from the same data source.
 */

import { calculateKhataSummary, isPartyReceivable, partyBalanceLabel, partyBalanceColor, entryIncreasesBalance, actionForDirection, calculateRunningBalance } from '@/utils/balance';
import type { PartyBalance } from '@/types';

describe('Balance Calculation System', () => {
  describe('calculateKhataSummary', () => {
    it('should calculate correct summary with mixed positive and negative balances', () => {
      const parties: PartyBalance[] = [
        { id: 1, name: 'Customer A', type: 'customer', phone: '', openingBalance: 0, balance: 30000 },
        { id: 2, name: 'Customer B', type: 'customer', phone: '', openingBalance: 0, balance: -50000 },
        { id: 3, name: 'Supplier A', type: 'supplier', phone: '', openingBalance: 0, balance: 80000 },
        { id: 4, name: 'Supplier B', type: 'supplier', phone: '', openingBalance: 0, balance: -20000 },
        { id: 5, name: 'Settled Customer', type: 'customer', phone: '', openingBalance: 0, balance: 0 },
      ];

      const result = calculateKhataSummary(parties);

      // Customer A: +30,000 → receivable
      // Customer B: -50,000 → payable (absolute value)
      // Supplier A: +80,000 → payable
      // Supplier B: -20,000 → receivable (absolute value)
      // Settled: 0 → no effect

      expect(result.receivable).toBe(30000 + 20000); // 50,000
      expect(result.payable).toBe(50000 + 80000); // 130,000
      expect(result.net).toBe(50000 - 130000); // -80,000
    });

    it('should handle all positive balances', () => {
      const parties: PartyBalance[] = [
        { id: 1, name: 'Customer A', type: 'customer', phone: '', openingBalance: 0, balance: 10000 },
        { id: 2, name: 'Supplier A', type: 'supplier', phone: '', openingBalance: 0, balance: 5000 },
      ];

      const result = calculateKhataSummary(parties);

      expect(result.receivable).toBe(10000);
      expect(result.payable).toBe(5000);
      expect(result.net).toBe(5000);
    });

    it('should handle all negative balances', () => {
      const parties: PartyBalance[] = [
        { id: 1, name: 'Customer A', type: 'customer', phone: '', openingBalance: 0, balance: -10000 },
        { id: 2, name: 'Supplier A', type: 'supplier', phone: '', openingBalance: 0, balance: -5000 },
      ];

      const result = calculateKhataSummary(parties);

      // Customer A: -10,000 → we owe them → payable
      // Supplier A: -5,000 → they owe us → receivable
      expect(result.receivable).toBe(5000);
      expect(result.payable).toBe(10000);
      expect(result.net).toBe(-5000);
    });

    it('should handle all zero balances', () => {
      const parties: PartyBalance[] = [
        { id: 1, name: 'Customer A', type: 'customer', phone: '', openingBalance: 0, balance: 0 },
        { id: 2, name: 'Supplier A', type: 'supplier', phone: '', openingBalance: 0, balance: 0 },
      ];

      const result = calculateKhataSummary(parties);

      expect(result.receivable).toBe(0);
      expect(result.payable).toBe(0);
      expect(result.net).toBe(0);
    });

    it('should handle empty array', () => {
      const result = calculateKhataSummary([]);

      expect(result.receivable).toBe(0);
      expect(result.payable).toBe(0);
      expect(result.net).toBe(0);
    });

    it('should match the example from the bug report', () => {
      // Example: adaasc (customer, +30,000), Anarul (customer, +50,000), check (customer, -30,000)
      const parties: PartyBalance[] = [
        { id: 1, name: 'adaasc', type: 'customer', phone: '', openingBalance: 0, balance: 30000 },
        { id: 2, name: 'Anarul', type: 'customer', phone: '', openingBalance: 0, balance: 50000 },
        { id: 3, name: 'check', type: 'customer', phone: '', openingBalance: 0, balance: -30000 },
      ];

      const result = calculateKhataSummary(parties);

      // adaasc: +30,000 → receivable
      // Anarul: +50,000 → receivable
      // check: -30,000 → payable (we owe them)
      
      expect(result.receivable).toBe(80000); // 30,000 + 50,000
      expect(result.payable).toBe(30000); // 30,000
      expect(result.net).toBe(50000); // 80,000 - 30,000
    });
  });

  describe('isPartyReceivable', () => {
    it('should return true for settled parties', () => {
      expect(isPartyReceivable('customer', 0)).toBe(true);
      expect(isPartyReceivable('supplier', 0)).toBe(true);
    });

    it('should return true for positive customer balances', () => {
      expect(isPartyReceivable('customer', 1000)).toBe(true);
      expect(isPartyReceivable('customer', 50000)).toBe(true);
    });

    it('should return false for negative customer balances', () => {
      expect(isPartyReceivable('customer', -1000)).toBe(false);
      expect(isPartyReceivable('customer', -50000)).toBe(false);
    });

    it('should return false for positive supplier balances', () => {
      expect(isPartyReceivable('supplier', 1000)).toBe(false);
      expect(isPartyReceivable('supplier', 50000)).toBe(false);
    });

    it('should return true for negative supplier balances', () => {
      expect(isPartyReceivable('supplier', -1000)).toBe(true);
      expect(isPartyReceivable('supplier', -50000)).toBe(true);
    });
  });

  describe('partyBalanceLabel', () => {
    it('should return "Settled" for zero balance', () => {
      expect(partyBalanceLabel('customer', 0)).toBe('Settled');
      expect(partyBalanceLabel('supplier', 0)).toBe('Settled');
    });

    it('should return "You\'ll receive" for receivable balances', () => {
      expect(partyBalanceLabel('customer', 1000)).toBe("You'll receive ₹1,000");
      expect(partyBalanceLabel('supplier', -5000)).toBe("You'll receive ₹5,000");
    });

    it('should return "You\'ll pay" for payable balances', () => {
      expect(partyBalanceLabel('customer', -1000)).toBe("You'll pay ₹1,000");
      expect(partyBalanceLabel('supplier', 5000)).toBe("You'll pay ₹5,000");
    });
  });

  describe('partyBalanceColor', () => {
    it('should return textSecondary for zero balance', () => {
      const theme = { income: 'green', expense: 'red', textSecondary: 'gray' };
      expect(partyBalanceColor('customer', 0, theme)).toBe('gray');
      expect(partyBalanceColor('supplier', 0, theme)).toBe('gray');
    });

    it('should return income color for receivable balances', () => {
      const theme = { income: 'green', expense: 'red', textSecondary: 'gray' };
      expect(partyBalanceColor('customer', 1000, theme)).toBe('green');
      expect(partyBalanceColor('supplier', -5000, theme)).toBe('green');
    });

    it('should return expense color for payable balances', () => {
      const theme = { income: 'green', expense: 'red', textSecondary: 'gray' };
      expect(partyBalanceColor('customer', -1000, theme)).toBe('red');
      expect(partyBalanceColor('supplier', 5000, theme)).toBe('red');
    });
  });

  describe('entryIncreasesBalance', () => {
    it('should return true for customer "out" transactions', () => {
      expect(entryIncreasesBalance('customer', 'out')).toBe(true);
    });

    it('should return false for customer "in" transactions', () => {
      expect(entryIncreasesBalance('customer', 'in')).toBe(false);
    });

    it('should return false for supplier "out" transactions', () => {
      expect(entryIncreasesBalance('supplier', 'out')).toBe(false);
    });

    it('should return true for supplier "in" transactions', () => {
      expect(entryIncreasesBalance('supplier', 'in')).toBe(true);
    });
  });

  describe('actionForDirection', () => {
    it('should map customer "out" to "give"', () => {
      expect(actionForDirection('customer', 'out')).toBe('give');
    });

    it('should map customer "in" to "receive"', () => {
      expect(actionForDirection('customer', 'in')).toBe('receive');
    });

    it('should map supplier "in" to "take"', () => {
      expect(actionForDirection('supplier', 'in')).toBe('take');
    });

    it('should map supplier "out" to "pay"', () => {
      expect(actionForDirection('supplier', 'out')).toBe('pay');
    });
  });

  describe('calculateRunningBalance', () => {
    it('should calculate correct running balance for customer', () => {
      const transactions = [
        { direction: 'out' as const, amount: 1000 },
        { direction: 'in' as const, amount: 500 },
        { direction: 'out' as const, amount: 2000 },
      ];

      const result = calculateRunningBalance('customer', transactions, 0);

      // Customer: out increases, in decreases
      // 0 + 1000 = 1000
      // 1000 - 500 = 500
      // 500 + 2000 = 2500
      expect(result).toEqual([1000, 500, 2500]);
    });

    it('should calculate correct running balance for supplier', () => {
      const transactions = [
        { direction: 'in' as const, amount: 1000 },
        { direction: 'out' as const, amount: 500 },
        { direction: 'in' as const, amount: 2000 },
      ];

      const result = calculateRunningBalance('supplier', transactions, 0);

      // Supplier: in increases, out decreases
      // 0 + 1000 = 1000
      // 1000 - 500 = 500
      // 500 + 2000 = 2500
      expect(result).toEqual([1000, 500, 2500]);
    });

    it('should handle opening balance', () => {
      const transactions = [
        { direction: 'out' as const, amount: 1000 },
      ];

      const result = calculateRunningBalance('customer', transactions, 5000);

      // 5000 + 1000 = 6000
      expect(result).toEqual([6000]);
    });

    it('should handle empty transactions', () => {
      const result = calculateRunningBalance('customer', [], 1000);
      expect(result).toEqual([]);
    });
  });

  describe('Cross-screen consistency', () => {
    it('should produce identical totals from the same party list', () => {
      // This test verifies that calculateKhataSummary produces the same result
      // regardless of which screen calls it (Khata list, Reports, PDF, Excel)
      
      const testParties: PartyBalance[] = [
        { id: 1, name: 'Customer 1', type: 'customer', phone: '123', openingBalance: 0, balance: 15000 },
        { id: 2, name: 'Customer 2', type: 'customer', phone: '456', openingBalance: 0, balance: -8000 },
        { id: 3, name: 'Customer 3', type: 'customer', phone: '789', openingBalance: 0, balance: 0 },
        { id: 4, name: 'Supplier 1', type: 'supplier', phone: '321', openingBalance: 0, balance: 25000 },
        { id: 5, name: 'Supplier 2', type: 'supplier', phone: '654', openingBalance: 0, balance: -12000 },
      ];

      // Simulate multiple screens calling the same function
      const khataScreenSummary = calculateKhataSummary(testParties);
      const reportsScreenSummary = calculateKhataSummary(testParties);
      const pdfExportSummary = calculateKhataSummary(testParties);
      const excelExportSummary = calculateKhataSummary(testParties);

      // All should produce identical results
      expect(khataScreenSummary).toEqual(reportsScreenSummary);
      expect(khataScreenSummary).toEqual(pdfExportSummary);
      expect(khataScreenSummary).toEqual(excelExportSummary);

      // Verify the actual values
      expect(khataScreenSummary.receivable).toBe(15000 + 12000); // 27,000
      expect(khataScreenSummary.payable).toBe(8000 + 25000); // 33,000
      expect(khataScreenSummary.net).toBe(-6000); // -6,000
    });

    it('should ensure party row labels match summary calculations', () => {
      // Verify that the label shown on each party row is consistent with
      // how that party's balance contributes to the summary
      
      const customerPositive: PartyBalance = { id: 1, name: 'Cust', type: 'customer', phone: '', openingBalance: 0, balance: 1000 };
      const customerNegative: PartyBalance = { id: 2, name: 'Cust2', type: 'customer', phone: '', openingBalance: 0, balance: -1000 };
      const supplierPositive: PartyBalance = { id: 3, name: 'Supp', type: 'supplier', phone: '', openingBalance: 0, balance: 1000 };
      const supplierNegative: PartyBalance = { id: 4, name: 'Supp2', type: 'supplier', phone: '', openingBalance: 0, balance: -1000 };

      const summary = calculateKhataSummary([customerPositive, customerNegative, supplierPositive, supplierNegative]);

      // Customer +1000: label "You'll receive", contributes to receivable
      expect(partyBalanceLabel('customer', 1000)).toBe("You'll receive ₹1,000");
      expect(isPartyReceivable('customer', 1000)).toBe(true);

      // Customer -1000: label "You'll pay", contributes to payable
      expect(partyBalanceLabel('customer', -1000)).toBe("You'll pay ₹1,000");
      expect(isPartyReceivable('customer', -1000)).toBe(false);

      // Supplier +1000: label "You'll pay", contributes to payable
      expect(partyBalanceLabel('supplier', 1000)).toBe("You'll pay ₹1,000");
      expect(isPartyReceivable('supplier', 1000)).toBe(false);

      // Supplier -1000: label "You'll receive", contributes to receivable
      expect(partyBalanceLabel('supplier', -1000)).toBe("You'll receive ₹1,000");
      expect(isPartyReceivable('supplier', -1000)).toBe(true);

      // Summary should match
      expect(summary.receivable).toBe(2000); // customer +1000 + supplier -1000
      expect(summary.payable).toBe(2000); // customer -1000 + supplier +1000
      expect(summary.net).toBe(0);
    });
  });
});