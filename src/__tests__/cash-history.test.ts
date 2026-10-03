/**
 * Cash history helpers: signed balance effect + edit routing.
 * Pure functions — no DB needed.
 */
import { TRANSFER_ID_OFFSET } from '@/db/transaction-repo';
import { editRouteForCashEntry } from '@/db/cash-book-repo';
import { cashHistoryEffect } from '@/hooks/use-cash-history';
import type { CashBookEntry } from '@/types';

function entry(overrides: Partial<CashBookEntry>): CashBookEntry {
  return {
    id: 1,
    date: '2026-08-05',
    time: '10:00',
    type: 'income',
    amount: 100,
    note: '',
    category: null,
    account: null,
    runningBalance: 0,
    ...overrides,
  };
}

describe('cashHistoryEffect', () => {
  it('signs income/transfer_in positive, expense/transfer_out negative', () => {
    expect(cashHistoryEffect(entry({ type: 'income', amount: 100 }))).toBe(100);
    expect(cashHistoryEffect(entry({ type: 'transfer_in', amount: 50 }))).toBe(50);
    expect(cashHistoryEffect(entry({ type: 'expense', amount: 30 }))).toBe(-30);
    expect(cashHistoryEffect(entry({ type: 'transfer_out', amount: 20 }))).toBe(-20);
  });

  it('treats internal moves and opening rows as net-zero', () => {
    expect(cashHistoryEffect(entry({ type: 'transfer_internal', amount: 500 }))).toBe(0);
    expect(cashHistoryEffect(entry({ type: 'opening', amount: 1000 }))).toBe(0);
  });
});

describe('editRouteForCashEntry', () => {
  it('routes income/expense to their forms', () => {
    expect(editRouteForCashEntry(entry({ id: 5, type: 'income' }))).toEqual({
      pathname: '/income',
      params: { editId: '5' },
    });
    expect(editRouteForCashEntry(entry({ id: 7, type: 'expense' }))).toEqual({
      pathname: '/expense',
      params: { editId: '7' },
    });
  });

  it('routes history transfer rows via transferId, day rows via raw id', () => {
    expect(
      editRouteForCashEntry(
        entry({ id: TRANSFER_ID_OFFSET + 3, transferId: 3, type: 'transfer_out' })
      )
    ).toEqual({ pathname: '/transfer', params: { editId: '3' } });
    expect(editRouteForCashEntry(entry({ id: 9, type: 'transfer_in' }))).toEqual({
      pathname: '/transfer',
      params: { editId: '9' },
    });
    expect(
      editRouteForCashEntry(
        entry({ id: TRANSFER_ID_OFFSET + 4, transferId: 4, type: 'transfer_internal' })
      )
    ).toEqual({ pathname: '/transfer', params: { editId: '4' } });
  });

  it('returns null for opening rows (immutable)', () => {
    expect(editRouteForCashEntry(entry({ type: 'opening' }))).toBeNull();
  });
});
