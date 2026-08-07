/**
 * Pull conflict-detection tests.
 *
 * `pullRemoteChanges` is called with a fake Supabase client and a mocked DB.
 * Which (table, uuid) pairs count as "local changes that can be overwritten"
 * comes from `listPendingChanges`, so the mocks fully control conflict setup.
 */
import { pullRemoteChanges } from '@/db/sync/pull';

const mockDb = {
  getFirstAsync: jest.fn().mockResolvedValue(null),
  getAllAsync: jest.fn().mockResolvedValue([]),
  runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 1, changes: 1 }),
};

jest.mock('@/db/database', () => ({
  getDatabase: jest.fn(),
}));

jest.mock('@/db/sync/meta', () => ({
  cursorKey: (table: string) => `last_pulled_${table}`,
  getMeta: jest.fn().mockResolvedValue(''),
  setMeta: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/db/sync/history-repo', () => ({
  addSyncEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/db/sync/queue-repo', () => ({
  listPendingChanges: jest.fn().mockResolvedValue([]),
}));

jest.mock('@/db/sync/tables', () => ({
  specFor: jest.fn((table: string) =>
    table === 'accounts'
      ? { table: 'accounts', columns: ['name', 'type', 'opening_balance', 'sort_order'], fks: {} }
      : undefined
  ),
  loadUuidToIdMap: jest.fn().mockResolvedValue({}),
}));

/** A cloud-shaped accounts row, newer than the local rows the tests use. */
const remoteRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'uuid-account-1',
  name: 'Cash',
  type: 'cash',
  opening_balance: 100,
  sort_order: 1,
  updated_at: '2026-01-02T00:00:00.000Z',
  deleted_at: null,
  user_id: 'user-1',
  version: 1,
  created_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

/** A queued local op for the account, as `listPendingChanges` would return it. */
const queuedOp = {
  id: 1,
  operation: 'insert' as const,
  tableName: 'accounts',
  recordUuid: 'uuid-account-1',
  payload: '{}',
  status: 'pending' as const,
  retryCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const makeSupabase = (rows: Record<string, unknown>[]) => ({
  from: jest.fn(() => ({
    select: jest.fn().mockReturnThis(),
    order: jest.fn().mockResolvedValue({ data: rows, error: null }),
    gt: jest.fn().mockResolvedValue({ data: rows, error: null }),
  })),
});

describe('pullRemoteChanges conflict detection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { getDatabase } = require('@/db/database');
    getDatabase.mockReturnValue(mockDb);
    // Reset the per-test default (clearAllMocks doesn't drop implementations).
    const { listPendingChanges } = require('@/db/sync/queue-repo');
    listPendingChanges.mockResolvedValue([]);
  });

  it('counts and logs a conflict when a queued local change is overwritten', async () => {
    const { listPendingChanges } = require('@/db/sync/queue-repo');
    listPendingChanges.mockResolvedValue([queuedOp]);
    mockDb.getFirstAsync.mockResolvedValue({ id: 5, updated_at: '2026-01-01T00:00:00.000Z' });

    const result = await pullRemoteChanges(makeSupabase([remoteRow()]) as never, 'user-1');

    expect(result.conflicts).toBe(1);
    expect(result.updated).toBe(1);
    const { addSyncEvent } = require('@/db/sync/history-repo');
    expect(addSyncEvent).toHaveBeenCalledWith('conflict', expect.stringContaining('account'));
  });

  it('does not count a conflict when nothing is queued', async () => {
    mockDb.getFirstAsync.mockResolvedValue({ id: 5, updated_at: '2026-01-01T00:00:00.000Z' });

    const result = await pullRemoteChanges(makeSupabase([remoteRow()]) as never, 'user-1');

    expect(result.conflicts).toBe(0);
    expect(result.updated).toBe(1);
    const { addSyncEvent } = require('@/db/sync/history-repo');
    expect(addSyncEvent).not.toHaveBeenCalled();
  });

  it('counts a conflict when a tombstone deletes a queued local row', async () => {
    const { listPendingChanges } = require('@/db/sync/queue-repo');
    listPendingChanges.mockResolvedValue([queuedOp]);
    mockDb.getFirstAsync.mockResolvedValue({ id: 5, updated_at: '2026-01-01T00:00:00.000Z' });

    const result = await pullRemoteChanges(
      makeSupabase([remoteRow({ deleted_at: '2026-01-02T00:00:00.000Z' })]) as never,
      'user-1'
    );

    expect(result.conflicts).toBe(1);
    expect(result.deleted).toBe(1);
  });

  it('skips rows where the local change is newer (local wins)', async () => {
    mockDb.getFirstAsync.mockResolvedValue({ id: 5, updated_at: '2026-01-03T00:00:00.000Z' });

    const result = await pullRemoteChanges(makeSupabase([remoteRow()]) as never, 'user-1');

    expect(result.skipped).toBe(1);
    expect(result.conflicts).toBe(0);
    expect(result.updated).toBe(0);
  });
});
