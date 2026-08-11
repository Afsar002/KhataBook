/**
 * Statement report builder for the khata export flow.
 *
 * A "statement" is one party's (customer/supplier) khata history over a date
 * range, laid out like a Khatabook customer statement: per-entry debit/credit
 * with running balance, monthly subtotals and grand totals. Both the PDF and
 * Excel (.xlsx) exporters consume the same model.
 *
 * Balance sign convention (matches `party-repo`):
 * - Customer: an 'out' entry increases the balance (they owe you more).
 * - Supplier: an 'in' entry increases the balance (you owe them more).
 *
 * The **debit** side is what increases the balance — money out on credit
 * ("Out"). The **credit** side is what reduces it — money in (repayment)
 * ("In").
 *
 * Every entry — including the opening entry (kind = 'opening'), which is the
 * earliest transaction — is described by its party action title and flows
 * through the running-balance math below. There is no separate
 * `opening_balance` addition.
 */

import type { Party, PartyTransaction, PartyType } from '@/types';
import { monthLabel } from '@/utils/format';
import { actionForDirection, entryIncreasesBalance, PARTY_ACTIONS } from '@/utils/party';

/** What the user wants included in a statement report. */
export interface StatementInclude {
  /** Show the entry description column. */
  entryDetails: boolean;
  /** Show entry notes under the description. */
  notes: boolean;
  /** Show the running-balance column and month-end balance. */
  runningBalance: boolean;
}

export const DEFAULT_INCLUDE: StatementInclude = {
  entryDetails: true,
  notes: true,
  runningBalance: true,
};

interface StatementEntry {
  id: number;
  /** `YYYY-MM-DD`. */
  date: string;
  /** Action title, e.g. "Money Out". */
  description: string;
  note: string;
  /** Amount on the debit side (0 when the entry is a credit). */
  debit: number;
  /** Amount on the credit side (0 when the entry is a debit). */
  credit: number;
  /** Balance after this entry. */
  runningBalance: number;
  /** 'opening' for the immutable opening entry, 'normal' otherwise. */
  kind: 'normal' | 'opening';
}

interface StatementMonth {
  /** `YYYY-MM`. */
  monthKey: string;
  /** e.g. "August 2026". */
  label: string;
  entries: StatementEntry[];
  debit: number;
  credit: number;
}

export interface StatementReport {
  party: Party;
  /** Resolved start date (`YYYY-MM-DD`, '' = all time). */
  from: string;
  /** Resolved end date (`YYYY-MM-DD`, '' = all time). */
  to: string;
  /** ISO datetime the report was generated. */
  generatedAt: string;
  /** Balance as of the start of the period (everything before `from`). */
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  /** openingBalance + totalDebit - totalCredit (closing within the period). */
  netBalance: number;
  /** Entries inside the period, oldest first. */
  entries: StatementEntry[];
  /** The same entries grouped by month, oldest month first. */
  months: StatementMonth[];
}

/** Signed effect of one khata entry on the party balance. */
function balanceDelta(type: PartyType, tx: Pick<PartyTransaction, 'direction' | 'amount'>): number {
  return entryIncreasesBalance(type, tx.direction) ? tx.amount : -tx.amount;
}

/**
 * Description shown for a ledger entry in the statement: the user's own note
 * text when they wrote one, otherwise the party action title ("Money Out",
 * "Money In", "Took on Credit", "Paid Money"). Opening entries are always
 * described by their action — their system marker note is not user content.
 */
function entryDescription(
  type: PartyType,
  tx: Pick<PartyTransaction, 'direction' | 'kind' | 'note'>
): string {
  if (tx.kind === 'opening') {
    return PARTY_ACTIONS[actionForDirection(type, tx.direction)].title;
  }
  const note = tx.note?.trim();
  return note || PARTY_ACTIONS[actionForDirection(type, tx.direction)].title;
}

/**
 * Pure builder: turns a party and its transactions into a statement report for
 * the `[from, to]` date range. Empty range strings mean "everything".
 *
 * The party's `openingBalance` field is intentionally NOT added here — the
 * opening balance is already a ledger entry (kind = 'opening') that was
 * backfilled on migration, so adding it again would double-count.
 */
export function computeStatementReport(
  party: Party,
  transactions: PartyTransaction[],
  from = '',
  to = '',
  now = new Date()
): StatementReport {
  // Oldest first; the app UI usually hands us a newest-first ledger.
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);

  const beforeRange = from ? sorted.filter((tx) => tx.date < from) : [];
  const inRange = sorted.filter((tx) => (!from || tx.date >= from) && (!to || tx.date <= to));

  // Balance carried into the period = everything recorded before `from`,
  // including the opening entry (the earliest transaction).
  const openingBalance = beforeRange.reduce((sum, tx) => sum + balanceDelta(party.type, tx), 0);

  let running = openingBalance;
  const entries: StatementEntry[] = inRange.map((tx) => {
    const increases = entryIncreasesBalance(party.type, tx.direction);
    const debit = increases ? tx.amount : 0;
    const credit = increases ? 0 : tx.amount;
    running += balanceDelta(party.type, tx);
    return {
      id: tx.id,
      date: tx.date,
      description: entryDescription(party.type, tx),
      // The opening entry's note is the "Opening Balance" system marker — not
      // user content — so it is never shown in the Notes column.
      note: tx.kind === 'opening' ? '' : tx.note,
      debit,
      credit,
      runningBalance: running,
      kind: tx.kind ?? 'normal',
    };
  });

  const totalDebit = entries.reduce((sum, entry) => sum + entry.debit, 0);
  const totalCredit = entries.reduce((sum, entry) => sum + entry.credit, 0);
  const netBalance = openingBalance + totalDebit - totalCredit;

  // Group into months, preserving chronological order.
  const months: StatementMonth[] = [];
  for (const entry of entries) {
    const monthKey = entry.date.slice(0, 7);
    let month = months[months.length - 1];
    if (!month || month.monthKey !== monthKey) {
      const [year, monthNumber] = monthKey.split('-').map(Number);
      month = { monthKey, label: monthLabel(year, monthNumber - 1), entries: [], debit: 0, credit: 0 };
      months.push(month);
    }
    month.entries.push(entry);
    month.debit += entry.debit;
    month.credit += entry.credit;
  }

  return {
    party,
    from,
    to,
    generatedAt: now.toISOString(),
    openingBalance,
    totalDebit,
    totalCredit,
    netBalance,
    entries,
    months,
  };
}
