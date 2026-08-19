/**
 * Category repo CRUD tests — the add/update/delete helpers behind the
 * Categories screen. `getDatabase` returns a shared mock so per-test
 * `mockResolvedValue` calls reach the exact instance under test.
 */
import { addCategory, deleteCategory, listAllCategories, updateCategory } from '@/db/category-repo';

const mockDb = {
  getAllAsync: jest.fn().mockResolvedValue([]),
  getFirstAsync: jest.fn(),
  runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 1, changes: 1 }),
  withTransactionAsync: jest.fn((cb: () => Promise<unknown> | unknown) => Promise.resolve(cb())),
};

jest.mock('@/db/database', () => ({
  getDatabase: jest.fn(),
  nowIso: jest.fn(() => '2026-01-01T00:00:00.000Z'),
}));

jest.mock('@/db/sync/queue', () => ({
  enqueueChange: jest.fn(),
}));

jest.mock('@/services/supabase/auth', () => ({
  getCurrentUserId: jest.fn().mockReturnValue('user-id'),
}));

describe('Category repo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { getDatabase } = require('@/db/database');
    getDatabase.mockReturnValue(mockDb);
  });

  it('adds a category with the next sort order and enqueues an insert', async () => {
    mockDb.getFirstAsync.mockResolvedValue({ next: 4 });

    const id = await addCategory({ name: 'Groceries', type: 'expense', icon: 'store' });

    expect(id).toBe(1);
    const insert = mockDb.runAsync.mock.calls[0];
    expect(insert[0]).toContain('INSERT INTO categories');
    expect(insert[4]).toBe('Groceries');
    const { enqueueChange } = require('@/db/sync/queue');
    expect(enqueueChange).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ table: 'categories', operation: 'insert' })
    );
  });

  it('updates name and icon and enqueues an update', async () => {
    mockDb.getFirstAsync.mockResolvedValue({ uuid: 'cat-uuid' });

    await updateCategory(3, { name: 'Snacks', icon: 'tag' });

    const update = mockDb.runAsync.mock.calls[0];
    expect(update[0]).toContain('UPDATE categories SET name');
    expect(update[1]).toBe('Snacks');
    const { enqueueChange } = require('@/db/sync/queue');
    expect(enqueueChange).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        table: 'categories',
        operation: 'update',
        recordUuid: 'cat-uuid',
      })
    );
  });

  it('deletes a category and enqueues a delete', async () => {
    mockDb.getFirstAsync.mockResolvedValue({ uuid: 'cat-uuid' });

    await deleteCategory(3);

    expect(mockDb.runAsync.mock.calls[0][0]).toContain('DELETE FROM categories');
    const { enqueueChange } = require('@/db/sync/queue');
    expect(enqueueChange).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        table: 'categories',
        operation: 'delete',
        recordUuid: 'cat-uuid',
      })
    );
  });

  it('lists all categories ordered by type', async () => {
    mockDb.getAllAsync.mockResolvedValue([
      { id: 1, name: 'Food', type: 'expense', icon: 'utensils', sortOrder: 1 },
    ]);

    const rows = await listAllCategories();

    expect(rows).toHaveLength(1);
    expect(mockDb.getAllAsync.mock.calls[0][0]).toContain('FROM categories');
    expect(mockDb.getAllAsync.mock.calls[0][0]).toContain('ORDER BY type');
  });
});
