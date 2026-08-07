import {
  buildBackup,
  buildBackupJSON,
  parseBackup,
  restoreBackup,
  type BackupFile,
  TABLE_COLUMNS,
} from '@/db/backup';

/**
 * Mock dependencies. `getDatabase` is a jest.fn whose return value is set in
 * beforeEach to a shared singleton mock, so per-test `mockResolvedValue` calls
 * apply to the exact instance the module under test uses.
 */
const mockDb = {
  getAllAsync: jest.fn().mockResolvedValue([]),
  runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 1, changes: 1 }),
  withTransactionAsync: jest.fn((fn: () => Promise<void>) => fn()),
};

jest.mock('@/db/database', () => ({
  getDatabase: jest.fn(),
  nowIso: () => '2026-08-05T12:00:00.000Z',
}));

jest.mock('@/db/sync/queue-repo', () => ({
  clearQueue: jest.fn().mockResolvedValue(undefined),
  enqueueChange: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/utils/uuid', () => ({
  uuid: () => 'test-uuid-' + Math.random().toString(36).substr(2, 9),
}));

jest.mock('@/services/app-meta', () => ({
  fetchAppMeta: jest.fn().mockResolvedValue({
    min_version: '1.0.0',
    migrate_from: [],
    migrate_notice: undefined,
  }),
}));

const emptyBackup: BackupFile = {
  app: 'dailykhata',
  version: 2,
  createdAt: '2026-08-05T12:00:00.000Z',
  tables: {
    accounts: [],
    categories: [],
    transactions: [],
    transfers: [],
    parties: [],
    party_transactions: [],
    settings: [],
  },
};

describe('Backup/Restore Module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { getDatabase } = require('@/db/database');
    getDatabase.mockReturnValue(mockDb);
  });

  describe('buildBackup', () => {
    it('returns a valid backup structure', async () => {
      mockDb.getAllAsync.mockResolvedValue([]);

      const backup = await buildBackup();

      expect(backup).toEqual({
        app: 'dailykhata',
        version: 2,
        createdAt: expect.any(String),
        tables: expect.objectContaining({
          accounts: [],
          categories: [],
          transactions: [],
          transfers: [],
          parties: [],
          party_transactions: [],
          settings: [],
        }),
      });
    });

    it('includes all tables with sync columns', async () => {
      mockDb.getAllAsync.mockResolvedValue([
        { id: 1, name: 'Cash', type: 'cash', opening_balance: 0, sort_order: 1, created_at: '2026-01-01', uuid: 'uuid-1', user_id: 'user-1', updated_at: '2026-01-01', deleted_at: null, version: 1 },
      ]);

      const backup = await buildBackup();

      expect(backup.tables.accounts).toHaveLength(1);
      expect(backup.tables.accounts[0]).toHaveProperty('uuid');
      expect(backup.tables.accounts[0]).toHaveProperty('user_id');
      expect(backup.tables.accounts[0]).toHaveProperty('updated_at');
      expect(backup.tables.accounts[0]).toHaveProperty('deleted_at');
      expect(backup.tables.accounts[0]).toHaveProperty('version');
    });
  });

  describe('buildBackupJSON', () => {
    it('returns valid JSON string', async () => {
      mockDb.getAllAsync.mockResolvedValue([]);

      const json = await buildBackupJSON();
      const parsed = JSON.parse(json);

      expect(parsed).toHaveProperty('app', 'dailykhata');
      expect(parsed).toHaveProperty('version', 2);
      expect(parsed).toHaveProperty('tables');
    });
  });

  describe('parseBackup', () => {
    /** Every v1 table except transfers (which only exists from v2). */
    const V1_TABLES = {
      accounts: [],
      categories: [],
      transactions: [],
      parties: [],
      party_transactions: [],
      settings: [],
    };

    it('returns null for invalid JSON', () => {
      const result = parseBackup('not valid json');
      expect(result).toBeNull();
    });

    it('returns null for wrong app', () => {
      const result = parseBackup(JSON.stringify({ app: 'other', version: 2, tables: {} }));
      expect(result).toBeNull();
    });

    it('returns null for wrong version', () => {
      const result = parseBackup(JSON.stringify({ app: 'dailykhata', version: 99, tables: {} }));
      expect(result).toBeNull();
    });

    it('accepts legacy app name', () => {
      const result = parseBackup(JSON.stringify({ app: 'khatabook', version: 1, tables: V1_TABLES }));
      expect(result).not.toBeNull();
    });

    it('accepts legacy version 1', () => {
      const result = parseBackup(JSON.stringify({ app: 'dailykhata', version: 1, tables: V1_TABLES }));
      expect(result).not.toBeNull();
    });

    it('rejects tables that are not arrays', () => {
      const invalid = parseBackup(JSON.stringify({
        app: 'dailykhata',
        version: 2,
        tables: { ...V1_TABLES, transfers: [], accounts: 'not an array' },
      }));
      expect(invalid).toBeNull();
    });

    it('rejects non-object rows', () => {
      const invalid2 = parseBackup(JSON.stringify({
        app: 'dailykhata',
        version: 2,
        tables: { ...V1_TABLES, transfers: [], accounts: [1] },
      }));
      expect(invalid2).toBeNull();
    });

    it('rejects a backup missing a required table', () => {
      const invalid = parseBackup(JSON.stringify({
        app: 'dailykhata',
        version: 2,
        tables: { accounts: [] }, // categories, transactions, ... are missing
      }));
      expect(invalid).toBeNull();
    });

    it('handles missing transfers table in v1 backup', () => {
      const result = parseBackup(JSON.stringify({
        app: 'dailykhata',
        version: 1,
        tables: V1_TABLES, // no transfers — predates the table
      }));
      expect(result).not.toBeNull();
      expect(result!.tables.transfers).toEqual([]);
    });
  });

  describe('restoreBackup', () => {
    it('rejects a backup from a newer app version without touching the DB', async () => {
      const futureBackup: BackupFile = { ...emptyBackup, version: 3 };
      const result = await restoreBackup(futureBackup);

      expect(result.restored).toBe(false);
      expect(result.message).toContain('newer');
      // Nothing was wiped or inserted.
      const writes = mockDb.runAsync.mock.calls.filter(
        (call: any[]) => typeof call[0] === 'string' && call[0].startsWith('DELETE FROM')
      );
      expect(writes).toHaveLength(0);
    });

    it('rejects a backup with a non-integer version', async () => {
      const badBackup: BackupFile = { ...emptyBackup, version: 1.5 };
      const result = await restoreBackup(badBackup);

      expect(result.restored).toBe(false);
    });

    it('wipes tables in correct order (children first)', async () => {
      await restoreBackup(emptyBackup);

      // Check delete order: party_transactions, transfers, transactions, parties, categories, accounts, settings
      const deleteCalls = mockDb.runAsync.mock.calls
        .filter((call: any[]) => call[0].startsWith('DELETE FROM'))
        .map((call: any[]) => call[0].replace('DELETE FROM ', ''));

      expect(deleteCalls).toEqual([
        'party_transactions',
        'transfers',
        'transactions',
        'parties',
        'categories',
        'accounts',
        'settings',
      ]);
    });

    it('clears queue before restore', async () => {
      await restoreBackup(emptyBackup);

      const { clearQueue } = require('@/db/sync/queue-repo');
      expect(clearQueue).toHaveBeenCalled();
    });

    it('inserts rows with fresh timestamps', async () => {
      const mockBackup: BackupFile = {
        ...emptyBackup,
        tables: {
          ...emptyBackup.tables,
          accounts: [
            { id: 1, name: 'Cash', type: 'cash', opening_balance: 100, sort_order: 1, created_at: '2026-01-01' },
          ],
        },
      };

      await restoreBackup(mockBackup);

      // Should insert with uuid and updated_at
      const insertCalls = mockDb.runAsync.mock.calls
        .filter((call: any[]) => call[0].startsWith('INSERT INTO accounts'));

      expect(insertCalls.length).toBe(1);
      // Last two args should be uuid and nowIso
      const values = insertCalls[0].slice(1);
      expect(values[values.length - 2]).toMatch(/^test-uuid-/); // uuid
      expect(values[values.length - 1]).toBe('2026-08-05T12:00:00.000Z'); // now
    });

    it('preserves uuid from backup when present', async () => {
      const mockBackup: BackupFile = {
        ...emptyBackup,
        tables: {
          ...emptyBackup.tables,
          accounts: [
            { id: 1, name: 'Cash', type: 'cash', opening_balance: 100, sort_order: 1, created_at: '2026-01-01', uuid: 'backup-uuid-123' },
          ],
        },
      };

      await restoreBackup(mockBackup);

      const insertCalls = mockDb.runAsync.mock.calls
        .filter((call: any[]) => call[0].startsWith('INSERT INTO accounts'));

      const values = insertCalls[0].slice(1);
      expect(values[values.length - 2]).toBe('backup-uuid-123');
    });

    it('generates new uuid when backup has none', async () => {
      const mockBackup: BackupFile = {
        ...emptyBackup,
        tables: {
          ...emptyBackup.tables,
          accounts: [
            { id: 1, name: 'Cash', type: 'cash', opening_balance: 100, sort_order: 1, created_at: '2026-01-01' }, // no uuid
          ],
        },
      };

      await restoreBackup(mockBackup);

      const insertCalls = mockDb.runAsync.mock.calls
        .filter((call: any[]) => call[0].startsWith('INSERT INTO accounts'));

      const values = insertCalls[0].slice(1);
      expect(values[values.length - 2]).toMatch(/^test-uuid-/);
    });

    it('enqueues changes for each restored row', async () => {
      const mockBackup: BackupFile = {
        ...emptyBackup,
        tables: {
          ...emptyBackup.tables,
          accounts: [
            { id: 1, name: 'Cash', type: 'cash', opening_balance: 100, sort_order: 1, created_at: '2026-01-01' },
            { id: 2, name: 'Bank', type: 'bank', opening_balance: 500, sort_order: 2, created_at: '2026-01-01' },
          ],
        },
      };

      await restoreBackup(mockBackup);

      const { enqueueChange } = require('@/db/sync/queue-repo');
      expect(enqueueChange).toHaveBeenCalledTimes(2);
      expect(enqueueChange).toHaveBeenCalledWith(
        mockDb,
        expect.objectContaining({ table: 'accounts', operation: 'insert' })
      );
    });

    it('returns restore result with counts', async () => {
      const mockBackup: BackupFile = {
        ...emptyBackup,
        tables: {
          ...emptyBackup.tables,
          transactions: [{ id: 1 }, { id: 2 }, { id: 3 }],
          transfers: [{ id: 1 }],
          parties: [{ id: 1 }, { id: 2 }],
        },
      };

      const result = await restoreBackup(mockBackup);

      expect(result.restored).toBe(true);
      expect(result.message).toContain('3 entries');
      expect(result.message).toContain('1 transfers');
      expect(result.message).toContain('2 parties');
    });

    it('includes migration notice for v1 backups when app_meta has migrate notice', async () => {
      const { fetchAppMeta } = require('@/services/app-meta');
      fetchAppMeta.mockResolvedValueOnce({
        min_version: '1.0.0',
        migrate_from: ['1.6.0'],
        migrate_notice: 'Important: This backup is from an older version.',
      });

      const mockBackup: BackupFile = {
        ...emptyBackup,
        version: 1,
      };

      const result = await restoreBackup(mockBackup);

      expect(result.migrationNotice).toBe('Important: This backup is from an older version.');
    });

    it('does not include migration notice for v2 backups', async () => {
      const result = await restoreBackup(emptyBackup);

      expect(result.migrationNotice).toBeUndefined();
    });
  });

  describe('TABLE_COLUMNS', () => {
    it('defines columns for all tables', () => {
      expect(TABLE_COLUMNS).toHaveProperty('accounts');
      expect(TABLE_COLUMNS).toHaveProperty('categories');
      expect(TABLE_COLUMNS).toHaveProperty('transactions');
      expect(TABLE_COLUMNS).toHaveProperty('transfers');
      expect(TABLE_COLUMNS).toHaveProperty('parties');
      expect(TABLE_COLUMNS).toHaveProperty('party_transactions');
      expect(TABLE_COLUMNS).toHaveProperty('settings');
    });

    it('includes required columns', () => {
      expect(TABLE_COLUMNS.accounts).toContain('opening_balance');
      expect(TABLE_COLUMNS.transactions).toContain('account_id');
      expect(TABLE_COLUMNS.transactions).toContain('category_id');
      expect(TABLE_COLUMNS.party_transactions).toContain('party_id');
    });
  });
});
