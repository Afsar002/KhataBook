/**
 * Edit-mode repo paths: `getX` + `updateX` for transactions, transfers and
 * khata entries, including input validation and the sync 'update' enqueue.
 */
import { editRouteForLedgerRow, getTransaction, updateTransaction } from '@/db/transaction-repo';
import { getTransfer, updateTransfer } from '@/db/transfer-repo';
import { getPartyTransaction, updatePartyTransaction } from '@/db/party-repo';
import type { LedgerRow } from '@/types';

const mockDb = {
  getAllAsync: jest.fn().mockResolvedValue([]),
  getFirstAsync: jest.fn(),
  runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 1, changes: 1 }),
  withTransactionAsync: jest.fn((cb: () => Promise<unknown> | unknown) => Promise.resolve(cb())),
};

jest.mock('@/db/database', () => ({
  getDatabase: jest.fn(),
  nowIso: jest.fn(() => '2026-02-01T00:00:00.000Z'),
}));

jest.mock('@/db/sync/queue-repo', () => ({
  enqueueChange: jest.fn(),
}));

jest.mock('@/services/supabase/auth', () => ({
  getCurrentUserId: jest.fn().mockReturnValue('user-id'),
}));

describe('Edit/delete entry repos — get + update', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { getDatabase } = require('@/db/database');
    getDatabase.mockReturnValue(mockDb);
  });

  describe('ledger → edit route mapping', () => {
    it('keeps income/expense ids as-is', () => {
      expect(editRouteForLedgerRow({ id: 5, kind: 'income', entryKind: 'normal' } as LedgerRow)).toEqual({
        pathname: '/income',
        params: { editId: '5' },
      });
      expect(editRouteForLedgerRow({ id: 7, kind: 'expense', entryKind: 'normal' } as LedgerRow)).toEqual({
        pathname: '/expense',
        params: { editId: '7' },
      });
    });

    it('strips the transfer id offset before routing (edit + delete hit the real row)', () => {
      expect(editRouteForLedgerRow({ id: 10000003, kind: 'transfer', entryKind: 'normal' } as LedgerRow)).toEqual({
        pathname: '/transfer',
        params: { editId: '3' },
      });
    });

    it('returns null for Opening Balance entries — they are immutable', () => {
      expect(editRouteForLedgerRow({ id: 5, kind: 'income', entryKind: 'opening' } as LedgerRow)).toBeNull();
    });
  });

  describe('transactions', () => {
    it('getTransaction selects the row with joined account + category aliases', async () => {
      mockDb.getFirstAsync.mockResolvedValue({
        id: 7,
        type: 'expense',
        amount: 120,
        accountId: 1,
        categoryId: 2,
        note: 'chai',
        date: '2026-02-03',
        createdAt: '2026-02-03T00:00:00.000Z',
      });

      const row = await getTransaction(7);

      expect(row?.amount).toBe(120);
      const sql = mockDb.getFirstAsync.mock.calls[0][0];
      expect(sql).toContain('FROM transactions t');
      expect(sql).toContain('t.account_id AS accountId');
    });

    it('updateTransaction rewrites the row and enqueues an update', async () => {
      mockDb.getFirstAsync.mockResolvedValue({ uuid: 'tx-uuid', kind: 'normal' });

      await updateTransaction(7, {
        type: 'expense',
        amount: 150,
        accountId: 1,
        categoryId: 2,
        note: 'edited',
        date: '2026-02-03',
      });

      const update = mockDb.runAsync.mock.calls[0];
      expect(update[0]).toContain('UPDATE transactions SET updated_at');
      expect(update[1]).toBe('2026-02-01T00:00:00.000Z'); // nowIso
      expect(update[2]).toBe('expense');
      expect(update[3]).toBe(150);
      expect(update[6]).toBe('edited');
      expect(update[8]).toBe('normal'); // kind (v8 column)
      expect(update[9]).toBe(7); // WHERE id
      const { enqueueChange } = require('@/db/sync/queue-repo');
      expect(enqueueChange).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          table: 'transactions',
          operation: 'update',
          recordUuid: 'tx-uuid',
        })
      );
    });

    it('updateTransaction rejects a non-positive amount', async () => {
      await expect(
        updateTransaction(7, {
          type: 'income',
          amount: 0,
          accountId: 1,
          categoryId: 1,
          note: '',
          date: '2026-02-03',
        })
      ).rejects.toThrow('Amount must be greater than zero.');
      expect(mockDb.runAsync).not.toHaveBeenCalled();
    });
  });

  describe('transfers', () => {
    it('getTransfer selects the row with both account names', async () => {
      mockDb.getFirstAsync.mockResolvedValue({
        id: 3,
        fromAccountId: 1,
        toAccountId: 2,
        amount: 500,
        note: 'savings',
        date: '2026-02-02',
        createdAt: '2026-02-02T00:00:00.000Z',
      });

      const row = await getTransfer(3);

      expect(row?.fromAccountId).toBe(1);
      expect(row?.toAccountId).toBe(2);
      const sql = mockDb.getFirstAsync.mock.calls[0][0];
      expect(sql).toContain('FROM transfers tr');
      expect(sql).toContain('fa.name AS fromAccountName');
    });

    it('updateTransfer rewrites the row and enqueues an update', async () => {
      mockDb.getFirstAsync.mockResolvedValue({ uuid: 'tr-uuid' });

      await updateTransfer(3, {
        fromAccountId: 1,
        toAccountId: 2,
        amount: 700,
        note: 're-edited',
        date: '2026-02-02',
      });

      const update = mockDb.runAsync.mock.calls[0];
      expect(update[0]).toContain('UPDATE transfers SET updated_at');
      expect(update[1]).toBe('2026-02-01T00:00:00.000Z');
      expect(update[2]).toBe(1);
      expect(update[4]).toBe(700);
      expect(update[7]).toBe(3); // WHERE id
      const { enqueueChange } = require('@/db/sync/queue-repo');
      expect(enqueueChange).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          table: 'transfers',
          operation: 'update',
          recordUuid: 'tr-uuid',
        })
      );
    });

    it('updateTransfer rejects same-account moves and non-positive amounts', async () => {
      await expect(
        updateTransfer(3, {
          fromAccountId: 1,
          toAccountId: 1,
          amount: 100,
          note: '',
          date: '2026-02-02',
        })
      ).rejects.toThrow('From and To accounts must be different.');

      await expect(
        updateTransfer(3, {
          fromAccountId: 1,
          toAccountId: 2,
          amount: -5,
          note: '',
          date: '2026-02-02',
        })
      ).rejects.toThrow('Amount must be greater than zero.');
      expect(mockDb.runAsync).not.toHaveBeenCalled();
    });
  });

  describe('khata entries', () => {
    it('getPartyTransaction selects the row with aliased columns', async () => {
      mockDb.getFirstAsync.mockResolvedValue({
        id: 4,
        partyId: 2,
        direction: 'out',
        amount: 900,
        note: 'stock',
        date: '2026-02-04',
        createdAt: '2026-02-04T00:00:00.000Z',
      });

      const row = await getPartyTransaction(4);

      expect(row?.direction).toBe('out');
      expect(row?.amount).toBe(900);
      const sql = mockDb.getFirstAsync.mock.calls[0][0];
      expect(sql).toContain('party_id AS partyId');
      expect(sql).toContain('FROM party_transactions');
    });

    it('updatePartyTransaction rewrites the row and enqueues an update', async () => {
      mockDb.getFirstAsync.mockResolvedValue({ uuid: 'pt-uuid', kind: 'normal' });

      await updatePartyTransaction(4, {
        partyId: 2,
        direction: 'in',
        amount: 300,
        note: 'paid back',
        date: '2026-02-04',
      });

      const update = mockDb.runAsync.mock.calls[0];
      expect(update[0]).toContain('UPDATE party_transactions SET updated_at');
      expect(update[1]).toBe('2026-02-01T00:00:00.000Z');
      expect(update[2]).toBe(2);
      expect(update[3]).toBe('in');
      expect(update[4]).toBe(300);
      expect(update[7]).toBe('normal'); // kind (v8 column)
      expect(update[8]).toBe(4); // WHERE id
      const { enqueueChange } = require('@/db/sync/queue-repo');
      expect(enqueueChange).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          table: 'party_transactions',
          operation: 'update',
          recordUuid: 'pt-uuid',
        })
      );
    });

    it('updatePartyTransaction rejects a non-positive amount', async () => {
      await expect(
        updatePartyTransaction(4, {
          partyId: 2,
          direction: 'out',
          amount: 0,
          note: '',
          date: '2026-02-04',
        })
      ).rejects.toThrow('Amount must be greater than zero.');
      expect(mockDb.runAsync).not.toHaveBeenCalled();
    });
  });
});
