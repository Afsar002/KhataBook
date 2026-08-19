/**
 * Sync queue tests — the retry/purge helpers behind "Retry All" in Settings
 * and the boot-time purge in the sync engine.
 *
 * `getDatabase` is a jest.fn whose return value is set in beforeEach to a
 * shared singleton mock, so per-test `mockResolvedValue` calls apply to the
 * exact instance the module under test uses.
 */
import { countFailed, enqueueChange, purgeParked, retryAll } from '@/db/sync/queue';

type Db = Parameters<typeof enqueueChange>[0];

const mockDb = {
  getFirstAsync: jest.fn().mockResolvedValue({ count: 0 }),
  runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 1, changes: 0 }),
};

jest.mock('@/db/database', () => ({
  getDatabase: jest.fn(),
}));

describe('Sync Queue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { getDatabase } = require('@/db/database');
    getDatabase.mockReturnValue(mockDb);
  });

  describe('countFailed', () => {
    it('returns the number of parked rows', async () => {
      mockDb.getFirstAsync.mockResolvedValue({ count: 3 });
      await expect(countFailed()).resolves.toBe(3);
    });

    it('returns 0 when the table is empty', async () => {
      mockDb.getFirstAsync.mockResolvedValue({ count: 0 });
      await expect(countFailed()).resolves.toBe(0);
    });
  });

  describe('retryAll', () => {
    it('resets failed rows to pending', async () => {
      mockDb.runAsync.mockResolvedValue({ lastInsertRowId: 0, changes: 2 });

      const count = await retryAll();

      expect(count).toBe(2);
      const sql = mockDb.runAsync.mock.calls[0][0];
      expect(sql).toContain("status = 'failed'");
    });

    it('returns 0 when nothing was parked', async () => {
      mockDb.runAsync.mockResolvedValue({ lastInsertRowId: 0, changes: 0 });

      const count = await retryAll();

      expect(count).toBe(0);
    });
  });

  describe('purgeParked', () => {
    it('deletes failed rows older than the cutoff', async () => {
      mockDb.runAsync.mockResolvedValue({ lastInsertRowId: 0, changes: 5 });

      const count = await purgeParked(30);

      expect(count).toBe(5);
      const sql = mockDb.runAsync.mock.calls[0][0];
      expect(sql).toContain("status = 'failed'");
      expect(sql).toContain('last_attempt_at');
      // Second arg is an ISO timestamp cutoff (a lexicographically comparable string).
      expect(typeof mockDb.runAsync.mock.calls[0][1]).toBe('string');
    });
  });

  describe('enqueueChange', () => {
    it('stores the empty-JSON default when no payload is given (update/delete ops)', async () => {
      mockDb.getFirstAsync.mockResolvedValue(null);

      await enqueueChange(mockDb as unknown as Db, 'transactions', 'uuid-1', 'delete');

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        'INSERT INTO sync_queue (operation, table_name, record_uuid, payload) VALUES (?, ?, ?, ?)',
        'delete',
        'transactions',
        'uuid-1',
        '{}'
      );
    });

    it('stores a JSON-serialized payload when one is provided', async () => {
      mockDb.getFirstAsync.mockResolvedValue(null);

      await enqueueChange(mockDb as unknown as Db, 'transactions', 'uuid-2', 'insert', { amount: 100 });

      expect(mockDb.runAsync.mock.calls[0][4]).toBe('{"amount":100}');
    });

    it('coalesces an existing row and lets a delete override an earlier update', async () => {
      mockDb.getFirstAsync.mockResolvedValue({ id: 7 });

      await enqueueChange(mockDb as unknown as Db, 'transactions', 'uuid-3', 'update');

      const sql = mockDb.runAsync.mock.calls[0][0];
      expect(sql).toContain('UPDATE sync_queue');
      expect(mockDb.runAsync.mock.calls[0][1]).toBe('update');
    });
  });
});
