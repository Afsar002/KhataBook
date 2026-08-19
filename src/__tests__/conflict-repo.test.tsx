/**
 * Conflict repo tests — capture, list, resolve, and the "restore my version"
 * path that writes a local snapshot back and re-enqueues it for upload.
 */
import {
  addConflictRecord,
  countUnresolvedConflicts,
  listConflicts,
  resolveConflict,
  restoreLocalVersion,
} from '@/db/sync/conflict-repo';

const mockDb = {
  getFirstAsync: jest.fn().mockResolvedValue(null),
  getAllAsync: jest.fn().mockResolvedValue([]),
  runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 1, changes: 1 }),
  withTransactionAsync: jest.fn((cb: () => Promise<unknown> | unknown) => Promise.resolve(cb())),
};

jest.mock('@/db/database', () => ({
  getDatabase: jest.fn(),
  nowIso: jest.fn(() => '2026-01-02T00:00:00.000Z'),
}));

jest.mock('@/db/sync/queue', () => ({
  enqueueChange: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/db/sync/tables', () => ({
  specFor: jest.fn((table: string) =>
    table === 'accounts'
      ? { table: 'accounts', columns: ['name', 'type', 'opening_balance', 'sort_order'], fks: {} }
      : undefined
  ),
}));

describe('Conflict repo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { getDatabase } = require('@/db/database');
    getDatabase.mockReturnValue(mockDb);
  });

  it('captures a conflict with both snapshots', async () => {
    await addConflictRecord({
      tableName: 'transactions',
      recordUuid: 'tx-1',
      message: 'A newer entry from the cloud replaced an unsynced local change.',
      localJson: JSON.stringify({ id: 7, amount: 100 }),
      remoteJson: JSON.stringify({ id: 'tx-1', amount: 200 }),
    });

    const [sql, table, uuid, message, localJson, remoteJson] = mockDb.runAsync.mock.calls[0];
    expect(sql).toContain('INSERT INTO sync_conflicts');
    expect(table).toBe('transactions');
    expect(uuid).toBe('tx-1');
    expect(message).toContain('replaced an unsynced local change');
    expect(JSON.parse(localJson).amount).toBe(100);
    expect(JSON.parse(remoteJson).amount).toBe(200);
  });

  it('does not duplicate an already-open conflict for the same record', async () => {
    mockDb.getFirstAsync.mockResolvedValue({ id: 3 });

    await addConflictRecord({
      tableName: 'transactions',
      recordUuid: 'tx-1',
      message: 'same',
    });

    expect(mockDb.runAsync).not.toHaveBeenCalled();
  });

  it('lists open conflicts newest first and maps resolved to a boolean', async () => {
    mockDb.getAllAsync.mockResolvedValue([
      {
        id: 2,
        tableName: 'accounts',
        recordUuid: 'u2',
        message: 'newer',
        localJson: '{}',
        remoteJson: '{}',
        resolved: 0,
        createdAt: '2026-01-02T00:00:00.000Z',
      },
    ]);

    const rows = await listConflicts();

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 2, tableName: 'accounts', resolved: false });
    expect(mockDb.getAllAsync.mock.calls[0][0]).toContain('WHERE resolved = 0');
    expect(mockDb.getAllAsync.mock.calls[0][0]).toContain('ORDER BY created_at DESC, id DESC');
  });

  it('counts only unresolved conflicts', async () => {
    mockDb.getFirstAsync.mockResolvedValue({ count: 4 });
    await expect(countUnresolvedConflicts()).resolves.toBe(4);
    expect(mockDb.getFirstAsync.mock.calls[0][0]).toContain('COUNT(*)');
    expect(mockDb.getFirstAsync.mock.calls[0][0]).toContain('resolved = 0');
  });

  it('resolves a conflict by id', async () => {
    await resolveConflict(9);
    const [sql, id] = mockDb.runAsync.mock.calls[0];
    expect(sql).toContain('UPDATE sync_conflicts SET resolved = 1 WHERE id = ?');
    expect(id).toBe(9);
  });

  it('restores the local version: writes the snapshot back, enqueues, resolves', async () => {
    // First getFirstAsync: the conflict row itself.
    mockDb.getFirstAsync.mockResolvedValueOnce({
      tableName: 'accounts',
      recordUuid: 'u1',
      localJson: JSON.stringify({
        uuid: 'u1',
        name: 'My Cash',
        type: 'cash',
        user_id: 'user-1',
        deleted_at: null,
        version: 1,
        updated_at: '2026-01-01T00:00:00.000Z',
      }),
    });
    // Second getFirstAsync: row exists locally → UPDATE path.
    mockDb.getFirstAsync.mockResolvedValueOnce({ id: 5 });

    await restoreLocalVersion(1);

    const update = mockDb.runAsync.mock.calls.find(([sql]) => (sql as string).includes('UPDATE accounts'));
    expect(update).toBeTruthy();
    // updated_at is bumped to nowIso so LWW favors the restored version.
    expect(update[0]).toContain('updated_at = ?');
    expect(update).toContain('2026-01-02T00:00:00.000Z');

    const { enqueueChange } = require('@/db/sync/queue');
    expect(enqueueChange).toHaveBeenCalledWith(
      expect.anything(),
      'accounts',
      'u1',
      'update'
    );

    const resolve = mockDb.runAsync.mock.calls.find(([sql]) =>
      (sql as string).includes('sync_conflicts SET resolved')
    );
    expect(resolve).toBeTruthy();
  });

  it('restores the local version by inserting when the row was deleted', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({
      tableName: 'accounts',
      recordUuid: 'u1',
      localJson: JSON.stringify({
        uuid: 'u1',
        name: 'My Cash',
        type: 'cash',
        user_id: 'user-1',
        deleted_at: null,
        version: 1,
        updated_at: '2026-01-01T00:00:00.000Z',
      }),
    });
    // Second getFirstAsync: row is gone locally → INSERT path.
    mockDb.getFirstAsync.mockResolvedValueOnce(null);

    await restoreLocalVersion(1);

    const insert = mockDb.runAsync.mock.calls.find(([sql]) => (sql as string).includes('INSERT INTO accounts'));
    expect(insert).toBeTruthy();
  });

  it('throws when the conflict has no local snapshot', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({
      tableName: 'accounts',
      recordUuid: 'u1',
      localJson: null,
    });

    await expect(restoreLocalVersion(1)).rejects.toThrow('No local version to restore');
  });
});
