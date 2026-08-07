/**
 * Sync queue repo tests — the retry/purge helpers behind "Retry All" in
 * Settings and the boot-time purge in the sync engine.
 *
 * `getDatabase` is a jest.fn whose return value is set in beforeEach to a
 * shared singleton mock, so per-test `mockResolvedValue` calls apply to the
 * exact instance the module under test uses.
 */
import { countFailed, enqueueChange, purgeParked, retryAll } from '@/db/sync/queue-repo';

type Db = Parameters<typeof enqueueChange>[0];

const mockDb = {
  getFirstAsync: jest.fn().mockResolvedValue({ count: 0 }),
  runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 1, changes: 0 }),
};

jest.mock('@/db/database', () => ({
  getDatabase: jest.fn(),
}));

jest.mock('@/services/sync/events', () => ({
  emitQueueChange: jest.fn(),
}));

describe('Sync Queue Repo', () => {
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
    it('resets failed rows to pending and emits a queue change', async () => {
      mockDb.runAsync.mockResolvedValue({ lastInsertRowId: 0, changes: 2 });

      const count = await retryAll();

      expect(count).toBe(2);
      const sql = mockDb.runAsync.mock.calls[0][0];
      expect(sql).toContain("status = 'failed'");
      const { emitQueueChange } = require('@/services/sync/events');
      expect(emitQueueChange).toHaveBeenCalled();
    });

    it('does not emit when nothing was parked', async () => {
      mockDb.runAsync.mockResolvedValue({ lastInsertRowId: 0, changes: 0 });

      const count = await retryAll();

      expect(count).toBe(0);
      const { emitQueueChange } = require('@/services/sync/events');
      expect(emitQueueChange).not.toHaveBeenCalled();
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
      // No existing row → INSERT path. The NOT NULL payload column must never
      // receive a JS `null` or the write throws.
      mockDb.getFirstAsync.mockResolvedValue(null);

      await enqueueChange(mockDb as unknown as Db, {
        table: 'transactions',
        operation: 'delete',
        recordUuid: 'uuid-1',
      });

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

      await enqueueChange(mockDb as unknown as Db, {
        table: 'transactions',
        operation: 'insert',
        recordUuid: 'uuid-2',
        payload: { amount: 100 },
      });

      expect(mockDb.runAsync.mock.calls[0][4]).toBe('{"amount":100}');
    });

    it('coalesces an existing row and lets a delete override an earlier update', async () => {
      mockDb.getFirstAsync.mockResolvedValue({ id: 7 });

      await enqueueChange(mockDb as unknown as Db, {
        table: 'transactions',
        operation: 'update',
        recordUuid: 'uuid-3',
      });

      const sql = mockDb.runAsync.mock.calls[0][0];
      expect(sql).toContain('UPDATE sync_queue');
      expect(mockDb.runAsync.mock.calls[0][1]).toBe('update');
      // Update payload also uses the empty-JSON default, never JS null.
      expect(mockDb.runAsync.mock.calls[0][2]).toBe('{}');
    });
  });
});
