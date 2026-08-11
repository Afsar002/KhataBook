/**
 * History filter → SQL tests.
 *
 * The History screen used to filter the fetched feed in memory; those rules
 * now live in `buildLedgerFilter` as SQL WHERE clauses over the `feed`
 * subquery. These tests lock the SQL shape + param order so the semantics stay
 * identical (text LIKE on note/category/account names, numeric queries also
 * match amounts, full-date only, inclusive amount bounds, account matches any
 * of the three account columns, category matches the transaction category).
 */
import { buildLedgerFilter, listLedgerPage } from '@/db/transaction-repo';

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

describe('buildLedgerFilter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { getDatabase } = require('@/db/database');
    getDatabase.mockReturnValue(mockDb);
  });

  it('returns an empty clause for an empty filter', () => {
    expect(buildLedgerFilter({})).toEqual({ where: '', params: [] });
  });

  it('matches text columns with LIKE for a non-numeric query', () => {
    const { where, params } = buildLedgerFilter({ query: 'chai' });
    expect(where).toContain('feed.note LIKE ? ESCAPE');
    expect(where).toContain('feed.categoryName LIKE ? ESCAPE');
    expect(where).toContain('feed.accountName LIKE ? ESCAPE');
    expect(where).toContain('feed.fromAccountName LIKE ? ESCAPE');
    expect(where).toContain('feed.toAccountName LIKE ? ESCAPE');
    expect(where).not.toContain('CAST(feed.amount AS TEXT)');
    expect(params).toEqual(['%chai%', '%chai%', '%chai%', '%chai%', '%chai%']);
  });

  it('also matches amounts as text when the query contains digits', () => {
    const { where, params } = buildLedgerFilter({ query: '1500' });
    expect(where).toContain('CAST(feed.amount AS TEXT) LIKE ? ESCAPE');
    // 5 text LIKEs + 1 amount LIKE.
    expect(params).toHaveLength(6);
    expect(params[5]).toBe('%1500%');
  });

  it('escapes LIKE wildcards in the query', () => {
    const { params } = buildLedgerFilter({ query: '50%' });
    expect(params[0]).toBe('%50\\%%');
  });

  it('applies the date range only for full YYYY-MM-DD dates', () => {
    const { where, params } = buildLedgerFilter({ dateFrom: '2026-07-01', dateTo: '2026-07-31' });
    expect(where).toContain('feed.date >= ?');
    expect(where).toContain('feed.date <= ?');
    expect(params).toEqual(['2026-07-01', '2026-07-31']);
  });

  it('ignores partial dates (matching the old in-memory guard)', () => {
    expect(buildLedgerFilter({ dateFrom: '2026-' })).toEqual({ where: '', params: [] });
  });

  it('applies inclusive amount bounds, skipping NaN/empty inputs', () => {
    const { where, params } = buildLedgerFilter({ minAmount: '500', maxAmount: '5000' });
    expect(where).toContain('feed.amount >= ?');
    expect(where).toContain('feed.amount <= ?');
    expect(params).toEqual([500, 5000]);
  });

  it('skips an invalid amount string', () => {
    expect(buildLedgerFilter({ minAmount: 'abc' })).toEqual({ where: '', params: [] });
  });

  it('matches account ids against all three account columns', () => {
    const { where, params } = buildLedgerFilter({ accountIds: [1, 2] });
    expect(where).toContain('feed.accountId IN (?,?)');
    expect(where).toContain('feed.fromAccountId IN (?,?)');
    expect(where).toContain('feed.toAccountId IN (?,?)');
    // Each IN list gets the full id set.
    expect(params).toEqual([1, 2, 1, 2, 1, 2]);
  });

  it('matches category ids in one IN list', () => {
    const { where, params } = buildLedgerFilter({ categoryIds: [3] });
    expect(where).toContain('feed.categoryId IN (?)');
    expect(params).toEqual([3]);
  });

  it('ANDs every dimension together in filter-then-cursor order', () => {
    const { where, params } = buildLedgerFilter({
      query: 'chai',
      dateFrom: '2026-07-01',
      minAmount: '100',
      accountIds: [1],
    });
    expect(where).toContain(' AND feed.date >= ? AND feed.amount >= ?');
    expect(where).toContain('feed.accountId IN (?)');
    // Params keep the same order as the clauses they fill.
    expect(params).toEqual(['%chai%', '%chai%', '%chai%', '%chai%', '%chai%', '2026-07-01', 100, 1, 1, 1]);
  });
});

describe('listLedgerPage with filters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { getDatabase } = require('@/db/database');
    getDatabase.mockReturnValue(mockDb);
    mockDb.getAllAsync.mockResolvedValue([]);
  });

  it('splices the filter and cursor clauses with AND', async () => {
    await listLedgerPage({ dateFrom: '2026-07-01' }, { date: '2026-07-01', id: 10 });

    const [sql, ...params] = mockDb.getAllAsync.mock.calls[0];
    expect(sql).toContain('WHERE feed.date >= ? AND (feed.date < ? OR (feed.date = ? AND feed.id < ?))');
    expect(params).toEqual(['2026-07-01', '2026-07-01', '2026-07-01', 10]);
  });

  it('still works with a cursor and no filter', async () => {
    await listLedgerPage(undefined, { date: '2026-07-01', id: 10 });

    const [sql, ...params] = mockDb.getAllAsync.mock.calls[0];
    expect(sql).toContain('WHERE (feed.date < ? OR (feed.date = ? AND feed.id < ?))');
    expect(params).toEqual(['2026-07-01', '2026-07-01', 10]);
  });
});
