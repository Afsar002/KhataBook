/**
 * Real-SQLite integration tests for `listDaySummaries`.
 *
 * Repo tests mock expo-sqlite, so they never exercise the actual window
 * function. This file runs the day-aggregation query against Node's built-in
 * SQLite (`node:sqlite`) to verify the per-day income/expense/entryCount math
 * and the running `cashInHand` — which must carry a pre-range balance in when
 * the query is bounded (Cashbook's "Cash in Hand" is the cumulative running
 * balance over ALL days, not just the visible range).
 */
import { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

import {
  getDayLedgerSummary,
  getRunningBalance,
  listDaySummaries,
  runningCashInHand,
  type DayLedgerSummary,
} from '@/db/transaction-repo';

jest.mock('@/db/database', () => ({
  getDatabase: jest.fn(),
  nowIso: jest.fn(() => '2026-08-11T00:00:00.000Z'),
}));

jest.mock('@/db/sync/queue-repo', () => ({
  enqueueChange: jest.fn(),
}));

jest.mock('@/services/supabase/auth', () => ({
  getCurrentUserId: jest.fn().mockReturnValue('user-id'),
}));

/** node:sqlite has no async helpers — adapt it to the expo-sqlite shape. */
function adapter(db: DatabaseSync): SQLiteDatabase {
  return {
    getAllAsync: async (sql: string, ...params: (string | number)[]) =>
      db.prepare(sql).all(...params),
    getFirstAsync: async (sql: string, ...params: (string | number)[]) =>
      db.prepare(sql).get(...params),
  } as unknown as SQLiteDatabase;
}

/** Minimal transactions table — `listDaySummaries` only reads date/type/amount. */
function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'normal'
    );
  `);
  return db;
}

/** `id`, `type`, `amount`, `date`, optional `kind` (default 'normal'). */
function seed(
  db: DatabaseSync,
  rows: { type: string; amount: number; date: string; kind?: string }[]
): void {
  const stmt = db.prepare(
    'INSERT INTO transactions (type, amount, note, date, kind) VALUES (?, ?, ?, ?, ?)'
  );
  for (const r of rows) {
    stmt.run(r.type, r.amount, '', r.date, r.kind ?? 'normal');
  }
}

describe('listDaySummaries — real SQLite', () => {
  /** Cash in Hand 08-01 = 400 → 08-02 = 350 → 08-03 = 550 (opening entry counts as income). */
  function seededDb(): DatabaseSync {
    const db = freshDb();
    seed(db, [
      { type: 'income', amount: 500, date: '2026-08-01' },
      { type: 'expense', amount: 100, date: '2026-08-01' },
      { type: 'expense', amount: 50, date: '2026-08-02' },
      // Opening-balance entries are type='income' — they feed Cash in Hand.
      { type: 'income', amount: 200, date: '2026-08-03', kind: 'opening' },
    ]);
    return db;
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns one newest-first row per day with income/expense/entryCount', async () => {
    const { getDatabase } = require('@/db/database');
    getDatabase.mockReturnValue(adapter(seededDb()));

    await expect(listDaySummaries()).resolves.toEqual([
      { date: '2026-08-03', entryCount: 1, income: 200, expense: 0, cashInHand: 550 },
      { date: '2026-08-02', entryCount: 1, income: 0, expense: 50, cashInHand: 350 },
      { date: '2026-08-01', entryCount: 2, income: 500, expense: 100, cashInHand: 400 },
    ]);
  });

  it('bounded range carries the pre-range cashInHand balance in', async () => {
    const { getDatabase } = require('@/db/database');
    getDatabase.mockReturnValue(adapter(seededDb()));

    const rows = await listDaySummaries('2026-08-02', '2026-08-03');
    // Only the two in-range days are returned…
    expect(rows.map((r) => r.date)).toEqual(['2026-08-03', '2026-08-02']);
    // …but their cashInHand still folds in 08-01's 400 (400 − 50 = 350).
    expect(rows.map((r) => r.cashInHand)).toEqual([550, 350]);
    expect(rows[1].income).toBe(0);
    expect(rows[1].expense).toBe(50);
  });

  it('single-day range returns just that day with the full running balance', async () => {
    const { getDatabase } = require('@/db/database');
    getDatabase.mockReturnValue(adapter(seededDb()));

    await expect(listDaySummaries('2026-08-02', '2026-08-02')).resolves.toEqual([
      { date: '2026-08-02', entryCount: 1, income: 0, expense: 50, cashInHand: 350 },
    ]);
  });

  it('empty table returns no rows', async () => {
    const { getDatabase } = require('@/db/database');
    getDatabase.mockReturnValue(adapter(freshDb()));

    await expect(listDaySummaries()).resolves.toEqual([]);
  });

  it('passes both bounds as SQL params (no injection of an unbounded query)', async () => {
    const { getDatabase } = require('@/db/database');
    const db = freshDb();
    seed(db, [{ type: 'income', amount: 10, date: '2026-08-05' }]);
    const dbAdapter = adapter(db);
    const getAllAsync = jest.fn(dbAdapter.getAllAsync);
    getDatabase.mockReturnValue({ ...dbAdapter, getAllAsync });

    await listDaySummaries('2026-08-01', '2026-08-31');

    expect(getAllAsync).toHaveBeenCalledTimes(1);
    const [sql, from, to] = getAllAsync.mock.calls[0];
    expect(sql).toContain('WHERE date >= ? AND date <= ?');
    expect(from).toBe('2026-08-01');
    expect(to).toBe('2026-08-31');
  });

  it('getRunningBalance returns the cumulative balance through the given date', async () => {
    const { getDatabase } = require('@/db/database');
    const db = freshDb();
    seed(db, [
      { type: 'income', amount: 1000, date: '2026-08-01', kind: 'opening' },
      { type: 'income', amount: 2000, date: '2026-08-01', kind: 'opening' },
      { type: 'expense', amount: 100, date: '2026-08-02' },
      { type: 'income', amount: 300, date: '2026-08-03' },
    ]);
    getDatabase.mockReturnValue(adapter(db));

    await expect(getRunningBalance('2026-08-01')).resolves.toBe(3000);
    await expect(getRunningBalance('2026-08-02')).resolves.toBe(2900);
    await expect(getRunningBalance('2026-08-03')).resolves.toBe(3200);
  });

  it('a day with no entries still reports the running balance (Cash in Hand not ₹0)', async () => {
    const { getDatabase } = require('@/db/database');
    const db = freshDb();
    seed(db, [{ type: 'income', amount: 5000, date: '2026-08-05', kind: 'opening' }]);
    getDatabase.mockReturnValue(adapter(db));

    // Today (2026-08-11) has no entries → listDaySummaries emits no row, but
    // the running balance exists and is what the Cashbook must show.
    await expect(listDaySummaries('2026-08-11', '2026-08-11')).resolves.toEqual([]);
    await expect(getRunningBalance('2026-08-11')).resolves.toBe(5000);
  });

  it('getDayLedgerSummary synthesizes a row for an entry-less day with the running balance', async () => {
    const { getDatabase } = require('@/db/database');
    const db = freshDb();
    seed(db, [{ type: 'income', amount: 5000, date: '2026-08-05', kind: 'opening' }]);
    getDatabase.mockReturnValue(adapter(db));

    // This is exactly what the Cashbook / day-detail screens run: no day row
    // exists for 08-11, so the helper builds one with the true Cash in Hand.
    await expect(getDayLedgerSummary('2026-08-11')).resolves.toEqual({
      date: '2026-08-11',
      entryCount: 0,
      income: 0,
      expense: 0,
      cashInHand: 5000,
    });
  });

  it('getDayLedgerSummary returns the real row when the day has entries', async () => {
    const { getDatabase } = require('@/db/database');
    const db = freshDb();
    seed(db, [{ type: 'income', amount: 500, date: '2026-08-01' }]);
    getDatabase.mockReturnValue(adapter(db));

    await expect(getDayLedgerSummary('2026-08-01')).resolves.toEqual({
      date: '2026-08-01',
      entryCount: 1,
      income: 500,
      expense: 0,
      cashInHand: 500,
    });
  });

  it('latest-day cashInHand equals the sum of all account balances (transfers cancel)', async () => {
    const { getDatabase } = require('@/db/database');
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        opening_balance REAL NOT NULL DEFAULT 0
      );
      CREATE TABLE transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        account_id INTEGER NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        date TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'normal'
      );
      CREATE TABLE transfers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        amount REAL NOT NULL,
        from_account_id INTEGER NOT NULL,
        to_account_id INTEGER NOT NULL,
        date TEXT NOT NULL
      );
    `);
    db.exec(
      `INSERT INTO accounts (id, name, type, opening_balance) VALUES (1, 'Cash', 'cash', 1000), (2, 'Bank', 'bank', 2000);`
    );
    const ins = db.prepare(
      'INSERT INTO transactions (type, amount, account_id, note, date, kind) VALUES (?, ?, ?, ?, ?, ?)'
    );
    ins.run('income', 1000, 1, 'Opening Balance', '2026-08-01', 'opening');
    ins.run('income', 2000, 2, 'Opening Balance', '2026-08-01', 'opening');
    ins.run('expense', 100, 1, '', '2026-08-02', 'normal');
    ins.run('income', 300, 1, '', '2026-08-03', 'normal');
    db.prepare('INSERT INTO transfers (amount, from_account_id, to_account_id, date) VALUES (?, ?, ?, ?)').run(
      500,
      1,
      2,
      '2026-08-02'
    );
    getDatabase.mockReturnValue(adapter(db));

    const [latest] = await listDaySummaries();
    expect(latest.cashInHand).toBe(3200); // 3000 openings − 100 expense + 300 income

    // Account balances (BALANCE_SQL equivalent): transfers net to zero across
    // accounts, so the sum must equal the cumulative ledger total.
    const balanceRows = db
      .prepare(
        `SELECT
           COALESCE((SELECT SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE -t.amount END)
                     FROM transactions t WHERE t.account_id = a.id), 0)
           + COALESCE((SELECT SUM(amount) FROM transfers tr WHERE tr.to_account_id = a.id), 0)
           - COALESCE((SELECT SUM(amount) FROM transfers tr WHERE tr.from_account_id = a.id), 0)
           AS balance
         FROM accounts a`
      )
      .all() as { balance: number }[];
    const total = balanceRows.reduce((sum, r) => sum + r.balance, 0);
    expect(total).toBe(3200);
    expect(latest.cashInHand).toBe(total);
  });

  it('omits bounds SQL when both are undefined', async () => {
    const { getDatabase } = require('@/db/database');
    const dbAdapter = adapter(freshDb());
    const getAllAsync = jest.fn(dbAdapter.getAllAsync);
    getDatabase.mockReturnValue({ ...dbAdapter, getAllAsync });

    await listDaySummaries();

    const [sql, ...params] = getAllAsync.mock.calls[0];
    expect(sql).not.toContain('WHERE');
    expect(params).toHaveLength(0);
  });
});

describe('runningCashInHand — running-total normalization', () => {
  const day = (
    date: string,
    income: number,
    expense: number,
    cashInHand: number
  ): DayLedgerSummary => ({ date, entryCount: 1, income, expense, cashInHand });

  it('corrects an off-by-one: 1 Aug shows its own ₹5,000, not the prior ₹0', () => {
    // The reported bug: 15 Jul (first entry, balance ₹0) → 1 Aug (balance
    // ₹5,000) but Cash in Hand rendered ₹0 because the current day was excluded.
    // Feed the stale rows (newest-first) exactly as the bug report describes.
    const out = runningCashInHand([
      day('2026-08-01', 5000, 0, 0), // wrong: omits its own day's balance
      day('2026-07-15', 0, 0, 0),
    ]);
    expect(out.map((d) => d.cashInHand)).toEqual([5000, 0]);
    expect(out[0].date).toBe('2026-08-01');
  });

  it('adds the current day balance to the previous day’s cash in hand', () => {
    const out = runningCashInHand([
      day('2026-08-03', 300, 0, 5100),
      day('2026-08-02', 0, 200, 4800),
      day('2026-08-01', 1000, 0, 5000),
    ]);
    // 08-01: 5000 · 08-02: 5000 − 200 = 4800 · 08-03: 4800 + 300 = 5100.
    expect(out.map((d) => d.cashInHand)).toEqual([5100, 4800, 5000]);
  });

  it('keeps the earliest row’s pre-range carry-in intact', () => {
    // First in-range day carries a balance that existed before the range.
    const out = runningCashInHand([
      day('2026-08-02', 0, 50, 350),
      day('2026-08-01', 500, 100, 400),
    ]);
    expect(out[1].cashInHand).toBe(400); // unchanged seed
    expect(out[0].cashInHand).toBe(350); // 400 − 50
  });

  it('returns empty and single rows untouched', () => {
    expect(runningCashInHand([])).toEqual([]);
    const single = [day('2026-08-01', 500, 0, 500)];
    expect(runningCashInHand(single)).toEqual(single);
  });
});
