/**
 * Audit-log repo tests — the device-local, append-only mutation trail.
 * `auditChange` is called by `enqueueChange` (see queue-repo.test.tsx) and
 * captures who changed which record, attributing to the current session.
 */
import {
  auditChange,
  countAuditEvents,
  listAuditEvents,
  purgeAuditLog,
} from '@/db/audit-log-repo';

type Db = Parameters<typeof auditChange>[0];

const mockDb = {
  getFirstAsync: jest.fn().mockResolvedValue(null),
  getAllAsync: jest.fn().mockResolvedValue([]),
  runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 1, changes: 0 }),
};

jest.mock('@/db/database', () => ({
  getDatabase: jest.fn(),
}));

jest.mock('@/services/supabase/auth', () => ({
  getCurrentSession: jest.fn(),
}));

describe('Audit log repo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { getDatabase } = require('@/db/database');
    getDatabase.mockReturnValue(mockDb);
  });

  it('records a mutation with the signed-in user id', async () => {
    const { getCurrentSession } = require('@/services/supabase/auth');
    getCurrentSession.mockReturnValue({ user: { id: 'user-1' } });

    await auditChange(mockDb as unknown as Db, {
      table: 'transactions',
      operation: 'update',
      recordUuid: 'tx-1',
      payload: { amount: 200 },
    });

    const [sql, table, operation, uuid, userId, payload] = mockDb.runAsync.mock.calls[0];
    expect(sql).toContain('INSERT INTO audit_log');
    expect(table).toBe('transactions');
    expect(operation).toBe('update');
    expect(uuid).toBe('tx-1');
    expect(userId).toBe('user-1');
    expect(JSON.parse(payload).amount).toBe(200);
  });

  it('attributes null user when signed out (offline-only mode)', async () => {
    const { getCurrentSession } = require('@/services/supabase/auth');
    getCurrentSession.mockReturnValue(null);

    await auditChange(mockDb as unknown as Db, {
      table: 'parties',
      operation: 'insert',
      recordUuid: 'p-1',
    });

    expect(mockDb.runAsync.mock.calls[0][4]).toBeNull();
  });

  it('stores a null payload when none is provided', async () => {
    await auditChange(mockDb as unknown as Db, {
      table: 'accounts',
      operation: 'delete',
      recordUuid: 'a-1',
    });

    expect(mockDb.runAsync.mock.calls[0][5]).toBeNull();
  });

  it('lists audit events newest first with camelCase mapping', async () => {
    mockDb.getAllAsync.mockResolvedValue([
      {
        id: 3,
        tableName: 'accounts',
        operation: 'update',
        recordUuid: 'u3',
        userId: 'user-1',
        payload: '{"name":"Cash"}',
        createdAt: '2026-08-07T10:00:00.000Z',
      },
    ]);

    const rows = await listAuditEvents();

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 3,
      tableName: 'accounts',
      operation: 'update',
      userId: 'user-1',
    });
    expect(mockDb.getAllAsync.mock.calls[0][0]).toContain('ORDER BY created_at DESC, id DESC');
    expect(mockDb.getAllAsync.mock.calls[0][1]).toBe(100);
  });

  it('counts all audit events', async () => {
    mockDb.getFirstAsync.mockResolvedValue({ count: 42 });
    await expect(countAuditEvents()).resolves.toBe(42);
    expect(mockDb.getFirstAsync.mock.calls[0][0]).toContain('COUNT(*)');
  });

  it('purges rows older than the retention window', async () => {
    mockDb.runAsync.mockResolvedValue({ lastInsertRowId: 0, changes: 7 });

    const count = await purgeAuditLog(90);

    expect(count).toBe(7);
    const [sql, cutoff] = mockDb.runAsync.mock.calls[0];
    expect(sql).toContain('DELETE FROM audit_log');
    expect(sql).toContain('created_at < ?');
    // Cutoff is an ISO timestamp ~90 days before now.
    expect(typeof cutoff).toBe('string');
  });
});
