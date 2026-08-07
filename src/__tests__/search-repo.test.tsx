/**
 * Global search repo tests.
 *
 * Verifies the three entity searches run the right SQLite LIKE queries and
 * short-circuit on a blank query. `getDatabase` returns a shared mock so
 * per-test `mockResolvedValue` calls reach the exact instance under test.
 */
import { searchAccounts } from '@/db/account-repo';
import { searchParties } from '@/db/party-repo';
import { searchLedger } from '@/db/transaction-repo';

const mockDb = {
  getAllAsync: jest.fn().mockResolvedValue([]),
  getFirstAsync: jest.fn(),
  runAsync: jest.fn(),
};

jest.mock('@/db/database', () => ({
  getDatabase: jest.fn(),
}));

jest.mock('@/db/sync/queue-repo', () => ({
  enqueueChange: jest.fn(),
}));

jest.mock('@/services/supabase/auth', () => ({
  getCurrentUserId: jest.fn().mockReturnValue('user-id'),
}));

describe('Global search repos', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { getDatabase } = require('@/db/database');
    getDatabase.mockReturnValue(mockDb);
  });

  describe('searchLedger', () => {
    it('returns [] without querying when the query is blank', async () => {
      await expect(searchLedger('   ')).resolves.toEqual([]);
      expect(mockDb.getAllAsync).not.toHaveBeenCalled();
    });

    it('searches note/category/account text with LIKE params', async () => {
      mockDb.getAllAsync.mockResolvedValue([{ id: 1, kind: 'income', amount: 10 }]);

      await searchLedger('chai');

      expect(mockDb.getAllAsync).toHaveBeenCalledTimes(1);
      const [sql, ...params] = mockDb.getAllAsync.mock.calls[0];
      expect(sql).toContain('LIKE ? ESCAPE');
      expect(sql).toContain('ORDER BY feed.date DESC');
      // One LIKE per text column, no amount clause for a non-numeric query.
      expect(params).toHaveLength(5);
      expect(params[0]).toBe('%chai%');
    });

    it('adds an amount clause for numeric queries', async () => {
      await searchLedger('1500');

      const [sql, ...params] = mockDb.getAllAsync.mock.calls[0];
      expect(sql).toContain('CAST(feed.amount AS TEXT) LIKE ?');
      expect(params).toHaveLength(6);
      expect(params[5]).toBe('%1500%');
    });

    it('escapes LIKE wildcards in the query', async () => {
      await searchLedger('50%');

      const [, ...params] = mockDb.getAllAsync.mock.calls[0];
      expect(params[0]).toBe('%50\\%%');
    });
  });

  describe('searchParties', () => {
    it('returns [] without querying when the query is blank', async () => {
      await expect(searchParties('')).resolves.toEqual([]);
      expect(mockDb.getAllAsync).not.toHaveBeenCalled();
    });

    it('queries name and phone with LIKE', async () => {
      await searchParties('ram');

      const [sql, ...params] = mockDb.getAllAsync.mock.calls[0];
      expect(sql).toContain('p.name LIKE ? ESCAPE');
      expect(sql).toContain('p.phone LIKE ? ESCAPE');
      expect(params).toEqual(['%ram%', '%ram%']);
    });
  });

  describe('searchAccounts', () => {
    it('returns [] without querying when the query is blank', async () => {
      await expect(searchAccounts(' ')).resolves.toEqual([]);
      expect(mockDb.getAllAsync).not.toHaveBeenCalled();
    });

    it('queries account names with LIKE', async () => {
      await searchAccounts('SBI');

      const [sql, ...params] = mockDb.getAllAsync.mock.calls[0];
      expect(sql).toContain('a.name LIKE ? ESCAPE');
      expect(params).toEqual(['%SBI%']);
    });
  });
});
