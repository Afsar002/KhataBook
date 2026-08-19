/**
 * Party repo tests: add/update carry the opening-balance column, and every
 * balance query derives the total from the party_transactions ledger.
 */
import {
  addParty,
  addPartyTransaction,
  getParty,
  getPartyBalance,
  listParties,
  listPartyLedgerPage,
  updateParty,
} from '@/db/party-repo';
import { LEDGER_PAGE_SIZE } from '@/db/transaction-repo';

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

describe('Party repo — opening balances', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { getDatabase } = require('@/db/database');
    getDatabase.mockReturnValue(mockDb);
  });

  it('adds a party with its opening balance and enqueues an insert', async () => {
    const id = await addParty({
      name: 'Ramesh Store',
      type: 'customer',
      phone: '9876543210',
      openingBalance: 2500,
    });

    expect(id).toBe(1);
    const insert = mockDb.runAsync.mock.calls[0];
    expect(insert[0]).toContain('INSERT INTO parties');
    expect(insert[0]).toContain('opening_balance');
    expect(insert[4]).toBe('Ramesh Store');
    expect(insert[7]).toBe(2500);
    const { enqueueChange } = require('@/db/sync/queue');
    expect(enqueueChange).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        table: 'parties',
        operation: 'insert',
        payload: expect.objectContaining({ opening_balance: 2500 }),
      })
    );
  });

  it('defaults opening balance to 0 when omitted', async () => {
    await addParty({ name: 'Sharma Traders', type: 'supplier', phone: '' });

    const insert = mockDb.runAsync.mock.calls[0];
    expect(insert[7]).toBe(0);
  });

  it('updates name, phone and opening balance and enqueues an update', async () => {
    mockDb.getFirstAsync.mockResolvedValue({ uuid: 'party-uuid' });

    await updateParty(3, { name: 'New Name', phone: '123', openingBalance: 500 });

    const update = mockDb.runAsync.mock.calls[0];
    expect(update[0]).toContain('UPDATE parties SET name');
    expect(update[0]).toContain('opening_balance');
    expect(update[1]).toBe('New Name');
    expect(update[3]).toBe(500);
    const { enqueueChange } = require('@/db/sync/queue');
    expect(enqueueChange).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        table: 'parties',
        operation: 'update',
        recordUuid: 'party-uuid',
        payload: expect.objectContaining({ opening_balance: 500 }),
      })
    );
  });

  it('getParty selects the opening balance alias', async () => {
    mockDb.getFirstAsync.mockResolvedValue({
      id: 1,
      name: 'Ramesh',
      type: 'customer',
      phone: '',
      openingBalance: 100,
    });

    const party = await getParty(1);

    expect(party?.openingBalance).toBe(100);
    expect(mockDb.getFirstAsync.mock.calls[0][0]).toContain(
      'opening_balance AS openingBalance'
    );
  });

  it('balance queries derive the total from the party_transactions ledger', async () => {
    mockDb.getFirstAsync.mockResolvedValue(null);
    mockDb.getAllAsync.mockResolvedValue([]);

    await getPartyBalance(1);
    await listParties('customer');

    const balanceSql = [
      mockDb.getFirstAsync.mock.calls[0][0],
      mockDb.getAllAsync.mock.calls[0][0],
    ].join('\n');
    expect(balanceSql).toContain('p.opening_balance AS openingBalance');
    // The balance is the signed sum of the ledger (opening balance is the
    // first ledger entry), not a separate opening_balance addition.
    expect(balanceSql).toContain('LEFT JOIN party_transactions pt ON pt.party_id = p.id');
    expect(balanceSql).toContain('COALESCE(');
    expect(balanceSql).toContain('SUM(');
  });

  it('adds a party transaction (unchanged shape) and enqueues an insert', async () => {
    await addPartyTransaction({
      partyId: 1,
      direction: 'out',
      amount: 500,
      note: '',
      date: '2026-01-05',
    });

    const insert = mockDb.runAsync.mock.calls[0];
    expect(insert[0]).toContain('INSERT INTO party_transactions');
    expect(insert[4]).toBe(1);
  });
});

describe('Party repo — paginated ledger', () => {
  const baseRow = (id: number) => ({
    id,
    partyId: 7,
    direction: 'out',
    amount: 10,
    note: null,
    date: '2026-07-01',
    createdAt: '2026-07-01T00:00:00.000Z',
    kind: 'normal',
  });

  it('returns a page with a next cursor when more rows exist', async () => {
    const rows = Array.from({ length: LEDGER_PAGE_SIZE + 5 }, (_, i) => baseRow(100 - i));
    mockDb.getAllAsync.mockResolvedValue(rows);

    const page = await listPartyLedgerPage(7);

    expect(mockDb.getAllAsync).toHaveBeenCalledWith(
      expect.stringContaining('FROM party_transactions'),
      7
    );
    expect(page.rows).toHaveLength(LEDGER_PAGE_SIZE);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toEqual({ date: '2026-07-01', id: 100 - LEDGER_PAGE_SIZE + 1 });
  });

  it('passes the cursor into the SQL params on subsequent pages', async () => {
    mockDb.getAllAsync.mockResolvedValue([]);

    const page = await listPartyLedgerPage(7, { date: '2026-07-01', id: 55 });

    expect(mockDb.getAllAsync).toHaveBeenCalledWith(
      expect.stringContaining('AND (date < ? OR (date = ? AND id < ?))'),
      7,
      '2026-07-01',
      '2026-07-01',
      55
    );
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });

  it('returns no cursor when the last page fits exactly', async () => {
    const rows = Array.from({ length: LEDGER_PAGE_SIZE }, (_, i) => baseRow(200 - i));
    mockDb.getAllAsync.mockResolvedValue(rows);

    const page = await listPartyLedgerPage(7);

    expect(page.rows).toHaveLength(LEDGER_PAGE_SIZE);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });
});
