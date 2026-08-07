/**
 * Database module tests.
 *
 * Uses the shared expo-sqlite mock from jest.setup.js (a fresh mock DB object
 * per `openDatabaseSync` call). Because `getDatabase()` caches the open handle
 * at module level, each test starts by closing it so the next `getDatabase()`
 * opens the fresh mock instance the test controls.
 */
import {
  closeDatabase,
  getDatabase,
  initDatabase,
  nowIso,
  seedDefaultsIfEmpty,
  wipeDatabase,
} from '@/db/database';
import * as SQLite from 'expo-sqlite';

/** Shape of the mocked SQLite handle returned by jest.setup.js. */
interface MockDb {
  execAsync: jest.Mock;
  runAsync: jest.Mock;
  getFirstAsync: jest.Mock;
  getAllAsync: jest.Mock;
  withTransactionAsync: jest.Mock;
  closeSync: jest.Mock;
}

function insertsOf(db: MockDb): unknown[][] {
  return db.runAsync.mock.calls.filter((call) => String(call[0]).startsWith('INSERT INTO'));
}

describe('Database Module', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await closeDatabase(); // reset the module-level cached handle
  });

  afterAll(async () => {
    await closeDatabase();
  });

  describe('nowIso', () => {
    it('returns an ISO timestamp with milliseconds', () => {
      expect(nowIso()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  describe('getDatabase', () => {
    it('opens a database and caches the same instance', () => {
      const db1 = getDatabase();
      const db2 = getDatabase();
      expect(db1).toBe(db2);
      expect(SQLite.openDatabaseSync).toHaveBeenCalledTimes(1);
    });

    it('opens a fresh instance after closeDatabase', async () => {
      const db1 = getDatabase();
      await closeDatabase();
      const db2 = getDatabase();
      expect(db2).not.toBe(db1);
    });
  });

  describe('closeDatabase', () => {
    it('closes the cached handle', async () => {
      const db = getDatabase() as unknown as MockDb;
      await closeDatabase();
      expect(db.closeSync).toHaveBeenCalled();
    });

    it('is safe to call when nothing is open', async () => {
      await expect(closeDatabase()).resolves.toBeUndefined();
      await expect(closeDatabase()).resolves.toBeUndefined();
    });
  });

  describe('initDatabase', () => {
    it('applies the schema and runs both migrations on a fresh DB', async () => {
      const db = getDatabase() as unknown as MockDb;
      await expect(initDatabase()).resolves.toBeUndefined();
      expect(db.execAsync).toHaveBeenCalled();
      expect(db.runAsync).toHaveBeenCalledWith('PRAGMA user_version = 1');
      expect(db.runAsync).toHaveBeenCalledWith('PRAGMA user_version = 2');
    });

    it('skips migrations when the database is already current', async () => {
      const db = getDatabase() as unknown as MockDb;
      db.getFirstAsync.mockResolvedValueOnce({ user_version: 2 });
      await initDatabase();
      expect(db.runAsync).not.toHaveBeenCalledWith('PRAGMA user_version = 1');
      expect(db.runAsync).not.toHaveBeenCalledWith('PRAGMA user_version = 2');
    });

    it('seeds default accounts and categories when the ledger is empty', async () => {
      const db = getDatabase() as unknown as MockDb;
      await initDatabase();
      // 2 accounts + 3 income categories + 6 expense categories = 11 inserts
      expect(insertsOf(db)).toHaveLength(11);
    });
  });

  describe('wipeDatabase', () => {
    it('closes the current handle and re-opens a fresh database', async () => {
      const db1 = getDatabase() as unknown as MockDb;
      await wipeDatabase();
      const db2 = getDatabase() as unknown as MockDb;
      // The old handle was closed and the cache reset, so a new handle is used.
      expect(db1.closeSync).toHaveBeenCalled();
      expect(db2).not.toBe(db1);
      expect(SQLite.openDatabaseSync).toHaveBeenCalledTimes(2);
    });
  });

  describe('seedDefaultsIfEmpty', () => {
    it('seeds when the ledger is empty', async () => {
      const db = getDatabase() as unknown as MockDb;
      db.getFirstAsync.mockResolvedValueOnce({ count: 0 });
      await seedDefaultsIfEmpty(db as never);
      expect(insertsOf(db)).toHaveLength(11);
    });

    it('skips seeding when accounts already exist', async () => {
      const db = getDatabase() as unknown as MockDb;
      db.getFirstAsync.mockResolvedValueOnce({ count: 3 });
      await seedDefaultsIfEmpty(db as never);
      expect(db.runAsync).not.toHaveBeenCalled();
    });
  });
});
