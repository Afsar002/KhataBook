/**
 * Cash book repo tests: the day's opening/income/expense/transfer math and
 * the reconciliation count (local `cash_counts` table).
 */
import {
  clearCashCount,
  getCashBook,
  getCashCount,
  setCashCount,
} from '@/db/cash-book-repo';

const mockDb = {
  getFirstAsync: jest.fn(),
  runAsync: jest.fn().mockResolvedValue({}),
};

jest.mock('@/db/database', () => ({
  getDatabase: jest.fn(),
}));

describe('Cash book repo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { getDatabase } = require('@/db/database');
    getDatabase.mockReturnValue(mockDb);
  });

  it('computes opening, day flows and closing from the aggregate query', async () => {
    // First getFirstAsync: the aggregate row. Second: the stored count.
    mockDb.getFirstAsync
      .mockResolvedValueOnce({
        opening: 1000,
        income: 500,
        expense: 200,
        transferIn: 300,
        transferOut: 150,
      })
      .mockResolvedValueOnce({ actual: 1400 });

    const book = await getCashBook('2026-08-05');

    expect(book).toEqual({
      date: '2026-08-05',
      opening: 1000,
      income: 500,
      expense: 200,
      transferIn: 300,
      transferOut: 150,
      closing: 1450, // 1000 + 500 - 200 + 300 - 150
      actual: 1400,
    });
    // The aggregate query is parameterised by the date 7 times (3× opening, 4× day).
    const sql = mockDb.getFirstAsync.mock.calls[0][0];
    expect(sql).toContain('type = \'cash\'');
    const params = mockDb.getFirstAsync.mock.calls[0].slice(1);
    expect(params).toHaveLength(7);
    expect(params.every((p: string) => p === '2026-08-05')).toBe(true);
  });

  it('defaults missing aggregates to 0 and no count to 0', async () => {
    mockDb.getFirstAsync
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    const book = await getCashBook('2026-08-04');

    expect(book.opening).toBe(0);
    expect(book.closing).toBe(0);
    expect(book.actual).toBe(0);
  });

  it('getCashCount returns the stored actual', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ actual: 777 });

    expect(await getCashCount('2026-08-05')).toBe(777);
    expect(mockDb.getFirstAsync.mock.calls[0][0]).toContain('FROM cash_counts');
    expect(mockDb.getFirstAsync.mock.calls[0][1]).toBe('2026-08-05');
  });

  it('setCashCount upserts by date', async () => {
    await setCashCount('2026-08-05', 1234);

    const [sql, date, value] = mockDb.runAsync.mock.calls[0];
    expect(sql).toContain('ON CONFLICT(date)');
    expect(date).toBe('2026-08-05');
    expect(value).toBe(1234);
  });

  it('clearCashCount removes the row for the date', async () => {
    await clearCashCount('2026-08-05');

    const [sql, date] = mockDb.runAsync.mock.calls[0];
    expect(sql).toContain('DELETE FROM cash_counts');
    expect(date).toBe('2026-08-05');
  });
});
