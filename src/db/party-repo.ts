/**
 * Customers / suppliers ("parties") and their khata ledgers.
 *
 * Balance sign convention:
 * - Customer: balance = Σ(out) − Σ(in). Positive → they owe you.
 * - Supplier: balance = Σ(in) − Σ(out). Positive → you owe them.
 *
 * The Opening Balance is the very first ledger entry (kind = 'opening').
 * All balances derive from the ledger — there is no separate addition.
 */
import { getDatabase, nowIso } from '@/db/database';
import { enqueueChange } from '@/db/sync/queue-repo';
import { LEDGER_PAGE_SIZE, type LedgerCursor } from '@/db/transaction-repo';
import { getCurrentUserId } from '@/services/supabase/auth';
import type {
  KhataSummary,
  NewPartyTransaction,
  Party,
  PartyBalance,
  PartyTotals,
  PartyTransaction,
  PartyType,
} from '@/types';
import { monthBounds } from '@/utils/format';
import { likeParam, SEARCH_LIMIT } from '@/utils/search';
import { uuid } from '@/utils/uuid';

export interface NewParty {
  name: string;
  type: PartyType;
  phone: string;
  openingBalance?: number;
}

/**
 * Creates a party and, when it has an opening balance, an immutable
 * "Opening Balance" ledger entry timestamped as the earliest transaction.
 */
export async function addParty(party: NewParty): Promise<number> {
  const db = getDatabase();
  const recordUuid = uuid();
  const now = nowIso();
  const userId = getCurrentUserId();
  const openingBalance = party.openingBalance ?? 0;

  let partyId = 0;
  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      'INSERT INTO parties (uuid, user_id, updated_at, name, type, phone, opening_balance) VALUES (?, ?, ?, ?, ?, ?, ?)',
      recordUuid,
      userId,
      now,
      party.name.trim(),
      party.type,
      party.phone.trim(),
      openingBalance
    );
    partyId = result.lastInsertRowId;

    // Opening Balance is the very first ledger entry.
    if (openingBalance !== 0) {
      const entryUuid = uuid();
      const openingDate = now.slice(0, 10);
      // Customer opening balance = they owe us → 'out'. Supplier = we owe them → 'in'.
      const direction = party.type === 'customer' ? 'out' : 'in';
      await db.runAsync(
        `INSERT INTO party_transactions
          (uuid, user_id, updated_at, party_id, direction, amount, note, date, kind, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'Opening Balance', ?, 'opening', ?)`,
        entryUuid,
        userId,
        now,
        partyId,
        direction,
        openingBalance,
        openingDate,
        now
      );
      await enqueueChange(db, {
        table: 'party_transactions',
        operation: 'insert',
        recordUuid: entryUuid,
        payload: { partyId, direction, amount: openingBalance, kind: 'opening' },
      });
    }
  });

  await enqueueChange(db, {
    table: 'parties',
    operation: 'insert',
    recordUuid,
    payload: {
      name: party.name.trim(),
      type: party.type,
      phone: party.phone.trim(),
      opening_balance: openingBalance,
    },
  });
  return partyId;
}

/**
 * Updates a party's details. When the opening balance changes, the immutable
 * "Opening Balance" ledger entry is updated in place (this is the dedicated
 * opening-balance workflow — normal transaction edits never touch it).
 */
export async function updateParty(
  id: number,
  input: { name: string; phone: string; openingBalance: number }
): Promise<void> {
  const db = getDatabase();
  await db.withTransactionAsync(async () => {
    const row = await db.getFirstAsync<{ uuid: string }>(
      'SELECT uuid FROM parties WHERE id = ?',
      id
    );
    await db.runAsync(
      'UPDATE parties SET name = ?, phone = ?, opening_balance = ?, updated_at = ? WHERE id = ?',
      input.name.trim(),
      input.phone.trim(),
      input.openingBalance,
      nowIso(),
      id
    );

    // Sync the opening-balance ledger entry with the new value.
    const existing = await db.getFirstAsync<{ id: number; uuid: string }>(
      `SELECT id, uuid FROM party_transactions
       WHERE party_id = ? AND kind = 'opening' LIMIT 1`,
      id
    );
    if (input.openingBalance !== 0) {
      const direction = await db.getFirstAsync<{ type: string }>(
        'SELECT type FROM parties WHERE id = ?',
        id
      );
      const dir = direction?.type === 'customer' ? 'out' : 'in';
      if (existing) {
        await db.runAsync(
          `UPDATE party_transactions SET amount = ?, direction = ?, note = 'Opening Balance', updated_at = ? WHERE id = ?`,
          input.openingBalance,
          dir,
          nowIso(),
          existing.id
        );
        if (existing.uuid) {
          await enqueueChange(db, {
            table: 'party_transactions',
            operation: 'update',
            recordUuid: existing.uuid,
          });
        }
      } else {
        const entryUuid = uuid();
        const now = nowIso();
        const openingDate = now.slice(0, 10);
        const userId = getCurrentUserId();
        await db.runAsync(
          `INSERT INTO party_transactions
            (uuid, user_id, updated_at, party_id, direction, amount, note, date, kind, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'Opening Balance', ?, 'opening', ?)`,
          entryUuid,
          userId,
          now,
          id,
          dir,
          input.openingBalance,
          openingDate,
          now
        );
        await enqueueChange(db, {
          table: 'party_transactions',
          operation: 'insert',
          recordUuid: entryUuid,
          payload: { partyId: id, direction: dir, amount: input.openingBalance, kind: 'opening' },
        });
      }
    } else if (existing) {
      // Opening balance set to zero → remove the opening entry.
      await db.runAsync('DELETE FROM party_transactions WHERE id = ?', existing.id);
      if (existing.uuid) {
        await enqueueChange(db, {
          table: 'party_transactions',
          operation: 'delete',
          recordUuid: existing.uuid,
        });
      }
    }

    if (row?.uuid) {
      await enqueueChange(db, {
        table: 'parties',
        operation: 'update',
        recordUuid: row.uuid,
        payload: {
          name: input.name.trim(),
          phone: input.phone.trim(),
          opening_balance: input.openingBalance,
        },
      });
    }
  });
}

export async function deleteParty(id: number): Promise<void> {
  const db = getDatabase();
  await db.withTransactionAsync(async () => {
    // Enqueue tombstones for the ledger rows first so the cloud copies are removed too.
    const children = await db.getAllAsync<{ uuid: string }>(
      'SELECT uuid FROM party_transactions WHERE party_id = ? AND uuid IS NOT NULL',
      id
    );
    for (const child of children) {
      await enqueueChange(db, {
        table: 'party_transactions',
        operation: 'delete',
        recordUuid: child.uuid,
      });
    }
    const row = await db.getFirstAsync<{ uuid: string }>(
      'SELECT uuid FROM parties WHERE id = ?',
      id
    );
    await db.runAsync('DELETE FROM party_transactions WHERE party_id = ?', id);
    await db.runAsync('DELETE FROM parties WHERE id = ?', id);
    if (row?.uuid) {
      await enqueueChange(db, { table: 'parties', operation: 'delete', recordUuid: row.uuid });
    }
  });
}

export async function getParty(id: number): Promise<Party | null> {
  const db = getDatabase();
  const row = await db.getFirstAsync<Party>(
    'SELECT id, name, type, phone, opening_balance AS openingBalance FROM parties WHERE id = ?',
    id
  );
  return row ?? null;
}

/**
 * A single party with its running balance, derived entirely from the ledger.
 * The Opening Balance entry (kind = 'opening') is the first transaction, so
 * the balance is simply the sum of all party_transactions.
 */
const PARTY_BALANCE_SQL = `
  COALESCE(
    SUM(
      CASE
        WHEN (p.type = 'customer' AND pt.direction = 'out')
          OR (p.type = 'supplier' AND pt.direction = 'in')
        THEN pt.amount
        ELSE -pt.amount
      END
    ),
    0
  )
`;

/** A single party with its running balance (avoids scanning every party). */
export async function getPartyBalance(id: number): Promise<PartyBalance | null> {
  const db = getDatabase();
  const row = await db.getFirstAsync<PartyBalance>(
    `
    SELECT
      p.id,
      p.name,
      p.type,
      p.phone,
      p.opening_balance AS openingBalance,
      ${PARTY_BALANCE_SQL} AS balance
    FROM parties p
    LEFT JOIN party_transactions pt ON pt.party_id = p.id
    WHERE p.id = ?
    GROUP BY p.id
    `,
    id
  );
  return row ?? null;
}

/** Parties whose name or phone matches the query, with running balances. */
export async function searchParties(query: string, limit = SEARCH_LIMIT): Promise<PartyBalance[]> {
  const db = getDatabase();
  const q = query.trim();
  if (!q) {
    return [];
  }
  const like = likeParam(q);
  return db.getAllAsync<PartyBalance>(
    `
    SELECT
      p.id,
      p.name,
      p.type,
      p.phone,
      p.opening_balance AS openingBalance,
      ${PARTY_BALANCE_SQL} AS balance
    FROM parties p
    LEFT JOIN party_transactions pt ON pt.party_id = p.id
    WHERE p.name LIKE ? ESCAPE '\\' OR p.phone LIKE ? ESCAPE '\\'
    GROUP BY p.id
    ORDER BY p.name COLLATE NOCASE, p.id
    LIMIT ${limit}
    `,
    like,
    like
  );
}

export async function listParties(type?: PartyType): Promise<PartyBalance[]> {
  const db = getDatabase();
  if (type) {
    return db.getAllAsync<PartyBalance>(
      `
      SELECT
        p.id,
        p.name,
        p.type,
        p.phone,
        p.opening_balance AS openingBalance,
        ${PARTY_BALANCE_SQL} AS balance
      FROM parties p
      LEFT JOIN party_transactions pt ON pt.party_id = p.id
      WHERE p.type = ?
      GROUP BY p.id
      ORDER BY p.name COLLATE NOCASE, p.id
      `,
      type
    );
  }
  return db.getAllAsync<PartyBalance>(
    `
    SELECT
      p.id,
      p.name,
      p.type,
      p.phone,
      p.opening_balance AS openingBalance,
      ${PARTY_BALANCE_SQL} AS balance
    FROM parties p
    LEFT JOIN party_transactions pt ON pt.party_id = p.id
    GROUP BY p.id
      ORDER BY p.type, p.name COLLATE NOCASE, p.id
    `
  );
}

export async function addPartyTransaction(tx: NewPartyTransaction): Promise<number> {
  const db = getDatabase();
  const recordUuid = uuid();
  const now = nowIso();
  const userId = getCurrentUserId();
  const kind = tx.kind ?? 'normal';
  const result = await db.runAsync(
    'INSERT INTO party_transactions (uuid, user_id, updated_at, party_id, direction, amount, note, date, kind) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    recordUuid,
    userId,
    now,
    tx.partyId,
    tx.direction,
    tx.amount,
    tx.note,
    tx.date,
    kind
  );
  await enqueueChange(db, {
    table: 'party_transactions',
    operation: 'insert',
    recordUuid,
    payload: { partyId: tx.partyId, direction: tx.direction, amount: tx.amount, kind },
  });
  return result.lastInsertRowId;
}

/** Loads a single khata entry for editing. */
export async function getPartyTransaction(id: number): Promise<PartyTransaction | null> {
  const db = getDatabase();
  return db.getFirstAsync<PartyTransaction>(
    `
    SELECT id, party_id AS partyId, direction, amount, note, date, created_at AS createdAt, kind
    FROM party_transactions
    WHERE id = ?
    `,
    id
  );
}

export async function updatePartyTransaction(
  id: number,
  input: NewPartyTransaction
): Promise<void> {
  if (!(input.amount > 0)) {
    throw new Error('Amount must be greater than zero.');
  }
  const db = getDatabase();
  await db.withTransactionAsync(async () => {
    const row = await db.getFirstAsync<{ uuid: string; kind: string }>(
      'SELECT uuid, kind FROM party_transactions WHERE id = ?',
      id
    );
    // Never allow editing an Opening Balance entry through the normal flow.
    if (row?.kind === 'opening') {
      throw new Error('Opening Balance entries are immutable. Edit the opening balance instead.');
    }
    const kind = input.kind ?? 'normal';
    await db.runAsync(
      'UPDATE party_transactions SET updated_at = ?, party_id = ?, direction = ?, amount = ?, note = ?, date = ?, kind = ? WHERE id = ?',
      nowIso(),
      input.partyId,
      input.direction,
      input.amount,
      input.note,
      input.date,
      kind,
      id
    );
    if (row?.uuid) {
      await enqueueChange(db, {
        table: 'party_transactions',
        operation: 'update',
        recordUuid: row.uuid,
      });
    }
  });
}

export async function deletePartyTransaction(id: number): Promise<void> {
  const db = getDatabase();
  await db.withTransactionAsync(async () => {
    const row = await db.getFirstAsync<{ uuid: string; kind: string }>(
      'SELECT uuid, kind FROM party_transactions WHERE id = ?',
      id
    );
    // Never allow deleting an Opening Balance entry through the normal flow.
    if (row?.kind === 'opening') {
      throw new Error('Opening Balance entries are immutable. Edit the opening balance instead.');
    }
    await db.runAsync('DELETE FROM party_transactions WHERE id = ?', id);
    if (row?.uuid) {
      await enqueueChange(db, {
        table: 'party_transactions',
        operation: 'delete',
        recordUuid: row.uuid,
      });
    }
  });
}

export async function listPartyTransactions(partyId: number): Promise<PartyTransaction[]> {
  const db = getDatabase();
  return db.getAllAsync<PartyTransaction>(
    `
    SELECT id, party_id AS partyId, direction, amount, note, date, created_at AS createdAt, kind
    FROM party_transactions
    WHERE party_id = ?
    ORDER BY date DESC, id DESC
    `,
    partyId
  );
}

/** One page of a party khata ledger (same shape as the feed pages). */
export interface PartyLedgerPage {
  rows: PartyTransaction[];
  hasMore: boolean;
  nextCursor: LedgerCursor | null;
}

/**
 * One page of a party's khata ledger, newest first. Uses the same keyset
 * (cursor) pagination as the account/history feeds so the detail screen can
 * load large ledgers incrementally instead of pulling every row at once.
 */
export async function listPartyLedgerPage(
  partyId: number,
  cursor?: LedgerCursor
): Promise<PartyLedgerPage> {
  const db = getDatabase();
  const params: (string | number)[] = [partyId];
  const where = cursor ? 'AND (date < ? OR (date = ? AND id < ?))' : '';
  if (cursor) {
    params.push(cursor.date, cursor.date, cursor.id);
  }
  const rows = await db.getAllAsync<PartyTransaction>(
    `
    SELECT id, party_id AS partyId, direction, amount, note, date, created_at AS createdAt, kind
    FROM party_transactions
    WHERE party_id = ?
    ${where}
    ORDER BY date DESC, id DESC
    LIMIT ${LEDGER_PAGE_SIZE + 1}
    `,
    ...params
  );
  const hasMore = rows.length > LEDGER_PAGE_SIZE;
  const page = hasMore ? rows.slice(0, LEDGER_PAGE_SIZE) : rows;
  const last = page[page.length - 1];
  return {
    rows: page,
    hasMore,
    nextCursor: hasMore && last ? { date: last.date, id: last.id } : null,
  };
}

/**
 * Loads a party's khata entries oldest-first (used by statement reports, where
 * the running balance is built forward from the opening balance).
 */
export async function listPartyTransactionsAsc(partyId: number): Promise<PartyTransaction[]> {
  const db = getDatabase();
  return db.getAllAsync<PartyTransaction>(
    `
    SELECT id, party_id AS partyId, direction, amount, note, date, created_at AS createdAt, kind
    FROM party_transactions
    WHERE party_id = ?
    ORDER BY date ASC, id ASC
    `,
    partyId
  );
}

/**
 * Headline khata figures.
 * Receivable = Σ positive customer balances (they owe you).
 * Payable    = Σ positive supplier balances (you owe them).
 * Net        = receivable − payable.
 */
export async function getKhataSummary(): Promise<KhataSummary> {
  const parties = await listParties();
  let receivable = 0;
  let payable = 0;
  for (const party of parties) {
    if (party.balance > 0) {
      if (party.type === 'customer') {
        receivable += party.balance;
      } else {
        payable += party.balance;
      }
    }
  }
  return { receivable, payable, net: receivable - payable };
}

/** Money given on credit / received for a month (`YYYY-MM`). */
export async function getMonthPartyTotals(yearMonth: string): Promise<PartyTotals> {
  const db = getDatabase();
  const { start, end } = monthBounds(yearMonth);
  const row = await db.getFirstAsync<{ given: number; received: number }>(
    `
    SELECT
      COALESCE(SUM(CASE WHEN direction = 'out' THEN amount END), 0) AS given,
      COALESCE(SUM(CASE WHEN direction = 'in' THEN amount END), 0) AS received
    FROM party_transactions
    WHERE date >= ? AND date < ?
    `,
    start,
    end
  );
  return { given: row?.given ?? 0, received: row?.received ?? 0 };
}