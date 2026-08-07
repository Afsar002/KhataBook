/**
 * Global search repo tests.
 *
 * Verifies the three entity searches run the right SQLite LIKE queries and
 * short-circuit on a blank query. `getDatabase` returns a shared mock so
 * per-test `mockResolvedValue` calls reach the exact instance under test.
 */
import { searchAccounts } from '@/db/account-repo';
import { ACCOUNT_BASE, PARTY_BASE, setFtsEnabledForTests } from '@/db/search-index';
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

  describe('FTS5 path (index enabled)', () => {
    beforeEach(() => {
      setFtsEnabledForTests(true);
    });
    afterAll(() => {
      setFtsEnabledForTests(false);
    });

    it('searchLedger queries the index then loads the matching feed rows', async () => {
      // FTS rowids come back namespaced (transfer band); the repo shifts the
      // transfer rowid back to the real id before loading the feed rows.
      mockDb.getAllAsync
        .mockResolvedValueOnce([
          { rowid: 3, kind: 'tx' },
          { rowid: 10000001, kind: 'transfer' },
        ])
        .mockResolvedValueOnce([
          { id: 3, kind: 'income', amount: 10, date: '2026-08-01' },
          { id: 10000001, kind: 'transfer', amount: 5, date: '2026-08-02' },
        ]);

      const out = await searchLedger('canteen');

      // One FTS query + one combined feed-load (UNION ALL), not one per kind.
      expect(mockDb.getAllAsync).toHaveBeenCalledTimes(2);
      const [ftsSql, ftsParam] = mockDb.getAllAsync.mock.calls[0];
      expect(ftsSql).toContain('ledger_fts MATCH ?');
      expect(ftsSql).toContain("kind IN ('tx', 'transfer')");
      expect(ftsParam).toBe('"canteen"');
      const combinedSql = mockDb.getAllAsync.mock.calls[1][0];
      expect(combinedSql).toContain('FROM transactions t');
      expect(combinedSql).toContain('FROM transfers tr');
      expect(out).toHaveLength(2);
    });

    it('searchLedger falls back to LIKE when no token is ≥3 chars', async () => {
      mockDb.getAllAsync.mockResolvedValue([]);

      await searchLedger('ch');

      expect(mockDb.getAllAsync).toHaveBeenCalledTimes(1);
      expect(mockDb.getAllAsync.mock.calls[0][0]).toContain('LIKE ? ESCAPE');
    });

    it('searchParties queries the party index and loads matches by id', async () => {
      mockDb.getAllAsync
        .mockResolvedValueOnce([{ rowid: 5 + PARTY_BASE }])
        .mockResolvedValueOnce([
          { id: 5, name: 'Ramesh', type: 'customer', phone: '', openingBalance: 0, balance: 0 },
        ]);

      const out = await searchParties('ram');

      expect(mockDb.getAllAsync).toHaveBeenCalledTimes(2);
      expect(mockDb.getAllAsync.mock.calls[0][0]).toContain("kind = 'party'");
      expect(mockDb.getAllAsync.mock.calls[0][1]).toBe('"ram"');
      expect(out).toHaveLength(1);
    });

    it('searchAccounts queries the account index and loads matches by id', async () => {
      mockDb.getAllAsync
        .mockResolvedValueOnce([{ rowid: 2 + ACCOUNT_BASE }])
        .mockResolvedValueOnce([
          { id: 2, name: 'SBI', type: 'bank', sortOrder: 1, openingBalance: 0, balance: 0 },
        ]);

      const out = await searchAccounts('sbi');

      expect(mockDb.getAllAsync).toHaveBeenCalledTimes(2);
      expect(mockDb.getAllAsync.mock.calls[0][0]).toContain("kind = 'account'");
      expect(out).toHaveLength(1);
    });
  });
});
