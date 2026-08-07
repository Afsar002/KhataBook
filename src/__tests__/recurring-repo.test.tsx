/**
 * Recurring template repo tests — CRUD plus the date-matching query that the
 * scheduler relies on. Templates are local-only (never enqueued for sync), so
 * these assert the SQL shape and the mapping, not the sync queue.
 */
import {
  addRecurringTemplate,
  updateRecurringTemplate,
  deleteRecurringTemplate,
  getRecurringTemplate,
  listRecurringTemplates,
  listActiveRecurringTemplatesForDate,
  updateLastGeneratedDate,
} from '@/db/recurring-repo';

const mockDb = {
  getAllAsync: jest.fn().mockResolvedValue([]),
  getFirstAsync: jest.fn(),
  runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 7, changes: 1 }),
  withTransactionAsync: jest.fn((cb: () => Promise<unknown> | unknown) => Promise.resolve(cb())),
};

jest.mock('@/db/database', () => ({
  getDatabase: jest.fn(),
  nowIso: jest.fn(() => '2026-01-01T00:00:00.000Z'),
}));

jest.mock('@/services/supabase/auth', () => ({
  getCurrentUserId: jest.fn().mockReturnValue('user-id'),
}));

jest.mock('@/utils/uuid', () => ({
  uuid: jest.fn(() => 'tpl-uuid'),
}));

describe('Recurring template repo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { getDatabase } = require('@/db/database');
    getDatabase.mockReturnValue(mockDb);
  });

  it('adds a template with all columns and returns the row id', async () => {
    const id = await addRecurringTemplate({
      templateType: 'transaction',
      type: 'expense',
      amount: 500,
      accountId: 3,
      categoryId: 4,
      note: 'Rent',
      frequency: 'monthly',
      dayOfMonth: 1,
      startDate: '2026-01-01',
      endDate: undefined,
    });

    expect(id).toBe(7);
    const insert = mockDb.runAsync.mock.calls[0];
    expect(insert[0]).toContain('INSERT INTO recurring_templates');
    expect(insert[0]).toContain('template_type');
    expect(insert[1]).toBe('tpl-uuid'); // uuid
    expect(insert[3]).toBe('transaction'); // template_type
    expect(insert[4]).toBe('expense'); // type
  });

  it('adds a party template with direction and party_id', async () => {
    await addRecurringTemplate({
      templateType: 'party_transaction',
      direction: 'in',
      amount: 200,
      partyId: 9,
      note: 'Tea',
      frequency: 'daily',
      startDate: '2026-01-01',
    });

    const insert = mockDb.runAsync.mock.calls[0];
    expect(insert[0]).toContain('party_id');
    expect(insert[9]).toBe(9); // party_id position
    expect(insert[10]).toBe('in'); // direction position
  });

  it('updates only the provided fields and persists is_active as 0/1', async () => {
    await updateRecurringTemplate(5, { amount: 750, isActive: false });

    const update = mockDb.runAsync.mock.calls[0];
    expect(update[0]).toContain('UPDATE recurring_templates SET updated_at = ?');
    expect(update[0]).toContain('amount = ?');
    expect(update[0]).toContain('is_active = ?');
    expect(update[1]).toBe('2026-01-01T00:00:00.000Z'); // updated_at
    expect(update[2]).toBe(750);
    expect(update[3]).toBe(0); // is_active false → 0
    expect(update[4]).toBe(5); // WHERE id
  });

  it('deletes a template by id', async () => {
    await deleteRecurringTemplate(5);
    expect(mockDb.runAsync.mock.calls[0][0]).toContain('DELETE FROM recurring_templates WHERE id = ?');
    expect(mockDb.runAsync.mock.calls[0][1]).toBe(5);
  });

  it('maps a stored row to a camelCase template', async () => {
    mockDb.getFirstAsync.mockResolvedValue({
      id: 2,
      uuid: 'u1',
      template_type: 'transaction',
      type: 'income',
      amount: 100,
      account_id: 1,
      category_id: null,
      note: 'n',
      party_id: null,
      direction: null,
      frequency: 'weekly',
      day_of_week: 3,
      day_of_month: null,
      start_date: '2026-02-01',
      end_date: null,
      last_generated_date: null,
      is_active: 1,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    });

    const template = await getRecurringTemplate(2);
    expect(template).toMatchObject({
      id: 2,
      templateType: 'transaction',
      type: 'income',
      amount: 100,
      accountId: 1,
      frequency: 'weekly',
      dayOfWeek: 3,
      isActive: true,
    });
  });

  it('lists only active templates by default', async () => {
    await listRecurringTemplates();
    const sql = mockDb.getAllAsync.mock.calls[0][0];
    expect(sql).toContain('SELECT * FROM recurring_templates');
    expect(sql).toContain('WHERE is_active = 1');
    expect(sql).toContain('ORDER BY template_type, created_at DESC');

    await listRecurringTemplates(false);
    expect(mockDb.getAllAsync.mock.calls[1][0]).not.toContain('WHERE is_active');
  });

  it('builds the date-matching query with frequency conditions', async () => {
    await listActiveRecurringTemplatesForDate('2026-01-15');
    const [sql, date] = mockDb.getAllAsync.mock.calls[0];
    expect(sql).toContain('frequency = \'daily\'');
    expect(sql).toContain('frequency = \'weekly\' AND day_of_week =');
    expect(sql).toContain('frequency = \'monthly\' AND day_of_month =');
    expect(sql).toContain('last_generated_date IS NULL OR date(last_generated_date) < date(?)');
    expect(date).toBe('2026-01-15');
  });

  it('records the last generated date for a template', async () => {
    await updateLastGeneratedDate(5, '2026-01-15');
    const [sql, generatedDate, updatedAt, id] = mockDb.runAsync.mock.calls[0];
    expect(sql).toContain('UPDATE recurring_templates SET last_generated_date = ?');
    expect(generatedDate).toBe('2026-01-15');
    expect(updatedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(id).toBe(5);
  });
});
