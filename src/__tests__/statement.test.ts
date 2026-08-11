/**
 * Statement report builder (pure logic): running balance, debit/credit split,
 * monthly grouping, opening-balance-as-of-date and totals.
 */
import { computeStatementReport } from '@/utils/statement';
import type { Party, PartyTransaction } from '@/types';

const CUSTOMER: Party = {
  id: 1,
  name: 'Ramesh Store',
  type: 'customer',
  phone: '9876543210',
  openingBalance: 500,
};

const SUPPLIER: Party = {
  id: 2,
  name: 'Sharma Traders',
  type: 'supplier',
  phone: '',
  openingBalance: 1000,
};

function tx(
  id: number,
  date: string,
  direction: 'in' | 'out',
  amount: number,
  note = ''
): PartyTransaction {
  return { id, partyId: 1, direction, amount, note, date, time: '10:30', createdAt: date, kind: 'normal' };
}

/**
 * Opening Balance ledger entry. In the v8 model the opening balance is the
 * first ledger row (customer → 'out', supplier → 'in'), so `computeStatementReport`
 * never reads `party.openingBalance` separately.
 */
function openingTx(date: string, direction: 'in' | 'out', amount: number): PartyTransaction {
  return {
    id: 0,
    partyId: 1,
    direction,
    amount,
    note: 'Opening Balance',
    date,
    time: '',
    createdAt: date,
    kind: 'opening',
  };
}

describe('computeStatementReport', () => {
  it('sorts entries oldest-first and computes running balance from the opening', () => {
    const report = computeStatementReport(
      CUSTOMER,
      // Deliberately newest-first, as the ledger UI returns them.
      [
        tx(2, '2026-08-02', 'in', 300, 'Paid cash'),
        tx(1, '2026-08-01', 'out', 1500, 'Wheat'),
        openingTx('2026-07-31', 'out', 500),
      ]
    );

    // All-time report: the opening entry is the first row of the period.
    expect(report.openingBalance).toBe(0);
    expect(report.entries.map((e) => e.date)).toEqual(['2026-07-31', '2026-08-01', '2026-08-02']);
    // The opening entry carries the party action title, not a special label.
    expect(report.entries[0].description).toBe('Money Out');
    // 500 (opening) → 500 + 1500 = 2000, then 2000 − 300 = 1700.
    expect(report.entries[0].debit).toBe(500);
    expect(report.entries[0].credit).toBe(0);
    expect(report.entries[0].runningBalance).toBe(500);
    expect(report.entries[1].debit).toBe(1500);
    expect(report.entries[1].runningBalance).toBe(2000);
    expect(report.entries[2].credit).toBe(300);
    expect(report.entries[2].runningBalance).toBe(1700);

    expect(report.totalDebit).toBe(2000);
    expect(report.totalCredit).toBe(300);
    expect(report.netBalance).toBe(1700);
  });

  it('computes the opening balance as of the start date', () => {
    const report = computeStatementReport(
      CUSTOMER,
      [
        openingTx('2026-07-10', 'out', 500),
        tx(1, '2026-07-15', 'out', 200, 'Earlier'),
        tx(2, '2026-08-01', 'out', 1500),
        tx(3, '2026-08-05', 'in', 400),
      ],
      '2026-08-01'
    );

    // 500 (opening entry) + 200 (before the range) = 700 carried in.
    expect(report.openingBalance).toBe(700);
    expect(report.entries).toHaveLength(2);
    expect(report.netBalance).toBe(700 + 1500 - 400);
  });

  it('respects an end date', () => {
    const report = computeStatementReport(
      CUSTOMER,
      [
        openingTx('2026-07-31', 'out', 500),
        tx(1, '2026-08-01', 'out', 1500),
        tx(2, '2026-08-31', 'out', 900),
      ],
      '',
      '2026-08-01'
    );
    // Opening + 08-01 are within the range; 08-31 is excluded.
    expect(report.entries).toHaveLength(2);
    expect(report.totalDebit).toBe(2000);
    expect(report.netBalance).toBe(2000);
  });

  it('groups entries by month with monthly subtotals', () => {
    const report = computeStatementReport(CUSTOMER, [
      tx(1, '2026-07-10', 'out', 100),
      tx(2, '2026-08-01', 'out', 1500),
      tx(3, '2026-08-02', 'in', 300),
    ]);

    expect(report.months.map((m) => m.monthKey)).toEqual(['2026-07', '2026-08']);
    expect(report.months[0].label).toBe('July 2026');
    expect(report.months[0].debit).toBe(100);
    expect(report.months[1].debit).toBe(1500);
    expect(report.months[1].credit).toBe(300);
    expect(report.months[1].entries).toHaveLength(2);
  });

  it('flips debit/credit for suppliers (in = you owe them more)', () => {
    const report = computeStatementReport(
      SUPPLIER,
      [
        openingTx('2026-07-31', 'in', 1000),
        tx(1, '2026-08-01', 'in', 500),
        tx(2, '2026-08-03', 'out', 200),
      ]
    );

    expect(report.entries[0].debit).toBe(1000); // opening (goods taken on credit)
    expect(report.entries[1].debit).toBe(500); // took goods on credit
    expect(report.entries[1].credit).toBe(0);
    expect(report.entries[2].credit).toBe(200); // paid them
    expect(report.entries[2].debit).toBe(0);
    expect(report.netBalance).toBe(1000 + 500 - 200);
  });

  it('returns a zero opening balance when there are no entries', () => {
    const report = computeStatementReport(CUSTOMER, []);
    expect(report.entries).toEqual([]);
    expect(report.months).toEqual([]);
    // Opening balance is a ledger entry — an empty ledger has none.
    expect(report.openingBalance).toBe(0);
    expect(report.netBalance).toBe(0);
  });

  it('describes entries with their party action label when there is no note', () => {
    const report = computeStatementReport(CUSTOMER, [tx(1, '2026-08-01', 'out', 1500)]);
    expect(report.entries[0].description).toBe('Money Out');
    const supplier = computeStatementReport(SUPPLIER, [tx(1, '2026-08-01', 'in', 500)]);
    expect(supplier.entries[0].description).toBe('Took on Credit');
  });

  it('uses the user note as the description when present', () => {
    const report = computeStatementReport(CUSTOMER, [
      tx(1, '2026-08-01', 'out', 1500, 'Wheat on credit'),
    ]);
    expect(report.entries[0].description).toBe('Wheat on credit');
    expect(report.entries[0].note).toBe('Wheat on credit');
  });

  it('never surfaces the opening marker as a description or note', () => {
    const report = computeStatementReport(CUSTOMER, [openingTx('2026-07-31', 'out', 500)]);
    // The opening entry is described by its action; its system-marker note is
    // stripped so the statement never prints "Opening Balance".
    expect(report.entries[0].description).toBe('Money Out');
    expect(report.entries[0].note).toBe('');
  });
});
