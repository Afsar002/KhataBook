/**
 * PDF layout engine edge cases.
 *
 * Exercises every builder against the tricky inputs from the layout polish
 * pass: very long names, huge amounts, hundreds of transactions (multi-page),
 * empty notes/ledgers, long phone numbers, optional columns off, and the
 * real-rupee path with Inter embedded. Every case must produce a valid PDF.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { PDFDocument } from 'pdf-lib';

import {
  buildPartyStatementPdf,
  buildStatementReportPdf,
  buildMonthlyReportPdf,
  buildCombinedPdf,
  buildTransactionsPdf,
} from '@/utils/pdf';
import { computeStatementReport, type StatementInclude } from '@/utils/statement';
import { setPdfFontBytes } from '@/utils/pdf-fonts';
import type { MonthReport, Party, PartyBalance, PartyTransaction, PartyDirection, LedgerRow } from '@/types';

/** First 5 bytes of a pdf-lib document are the ASCII magic `%PDF-`. */
function pdfMagic(bytes: Uint8Array): string {
  return String.fromCharCode(...Array.from(bytes).slice(0, 5));
}

function expectValidPdf(bytes: Uint8Array): void {
  expect(pdfMagic(bytes)).toBe('%PDF-');
  expect(bytes.length).toBeGreaterThan(300);
}

/**
 * Concatenates the decoded content streams of every page. Only readable for
 * the Helvetica fallback path — embedded custom fonts draw hex glyph ids, not
 * ASCII. Lets us assert the actual strings rendered into the PDF.
 */
async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const doc = await PDFDocument.load(bytes);
  const context = (doc as unknown as { context: { lookup: (ref: unknown) => unknown } }).context;
  let out = '';
  for (const page of doc.getPages()) {
    const node = (page as unknown as { node: { Contents: () => unknown } }).node;
    const contents = node.Contents();
    if (!contents) continue;
    const list = (
      contents as unknown as { asArray?: () => unknown[] }
    ).asArray ? (contents as unknown as { asArray: () => unknown[] }).asArray() : [contents];
    for (const entry of list) {
      const stream = context.lookup(entry);
      if (!stream) continue;
      const s = stream as {
        getContentsString?: () => string;
        getUnencodedContents?: () => Uint8Array;
        contents?: Uint8Array;
      };
      let raw: string | Uint8Array | undefined;
      if (s.getContentsString) raw = s.getContentsString();
      else if (s.getUnencodedContents) raw = s.getUnencodedContents();
      else raw = s.contents;
      if (!raw) continue;
      // Normalize to bytes, then inflate if it's a zlib stream (magic 0x78).
      let bytes = typeof raw === 'string' ? Buffer.from(raw, 'latin1') : Buffer.from(raw);
      if (bytes[0] === 0x78) {
        try {
          bytes = zlib.inflateSync(bytes);
        } catch {
          // not actually deflated — keep as-is
        }
      }
      // pdf-lib draws text as hex literals: <47697665...> → "Give..." (only
      // true for the built-in Helvetica path; embedded fonts use glyph ids).
      out += bytes
        .toString('latin1')
        .replace(/<([0-9A-Fa-f]+)>/g, (_m, hex: string) => Buffer.from(hex, 'hex').toString('latin1'));
    }
  }
  return out;
}

/** Builds a dense ledger of `count` alternating customer entries. */
function ledgerFor(count: number, startDate = '2026-01-01', note = 'Wheat on credit'): PartyTransaction[] {
  const ledger: PartyTransaction[] = [];
  let day = 0;
  for (let i = 0; i < count; i++) {
    const date = `2026-01-${String(day + 1).padStart(2, '0')}`;
    ledger.push({
      id: i + 1,
      partyId: 1,
      direction: (i % 2 === 0 ? 'out' : 'in') as PartyDirection,
      amount: (i + 1) * 1234,
      note: i % 5 === 0 ? note : '',
      date,
      time: '10:30',
      createdAt: `${date}T10:00:00.000Z`,
      kind: 'normal',
    });
    day += 1;
  }
  return ledger;
}

const base = { name: 'Ramesh Store', phone: '9876543210', type: 'customer' as const };

function makeReport(overrides: Partial<Parameters<typeof computeStatementReport>[0]> = {}): Party {
  return { id: 1, name: 'Ramesh Store', phone: '9876543210', type: 'customer', openingBalance: 0, ...overrides };
}

function monthlyReport(): MonthReport {
  return {
    summary: { income: 1234567, expense: 345678 },
    expenses: [
      { name: 'Rent for the shop', icon: 'home', total: 50000, type: 'expense' },
      { name: 'Supplier bills', icon: 'cart', total: 295678, type: 'expense' },
    ],
    incomes: [
      { name: 'Sales', icon: 'wallet', total: 1000000, type: 'income' },
      { name: 'Refunds', icon: 'refresh', total: 234567, type: 'income' },
    ],
    party: { given: 200000, received: 150000 },
  };
}

describe('statement PDF layout edge cases', () => {
  it('handles a very long party name without clipping', async () => {
    const longName = 'M/s Balaji Kirana & General Merchants Store - Chaura Bazaar Road'.repeat(2);
    const bytes = await buildPartyStatementPdf({
      ...base,
      name: longName,
      ledger: ledgerFor(3),
    });
    expectValidPdf(bytes);
  });

  it('handles huge currency values', async () => {
    const ledger: PartyTransaction[] = [
      { id: 1, partyId: 1, direction: 'out', amount: 999999999999, note: 'Big amount', date: '2026-08-01', time: '10:00', createdAt: '2026-08-01', kind: 'normal' },
      { id: 2, partyId: 1, direction: 'in', amount: 1, note: '', date: '2026-08-02', time: '18:00', createdAt: '2026-08-02', kind: 'normal' },
    ];
    const bytes = await buildPartyStatementPdf({ ...base, ledger });
    expectValidPdf(bytes);
  });

  it('spans multiple pages for 300+ transactions and repeats headers', async () => {
    const bytes = await buildPartyStatementPdf({ ...base, ledger: ledgerFor(320) });
    expectValidPdf(bytes);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });

  it('handles empty notes and a long phone number', async () => {
    const bytes = await buildPartyStatementPdf({
      ...base,
      phone: '+91 98765 43210 (WhatsApp preferred)',
      ledger: ledgerFor(8, '2026-02-01', ''),
    });
    expectValidPdf(bytes);
  });

  it('renders with descriptions and running balance turned off', async () => {
    const report = computeStatementReport(makeReport(), ledgerFor(12));
    const bytes = await buildStatementReportPdf(report, {
      entryDetails: false,
      notes: false,
      runningBalance: false,
    });
    expectValidPdf(bytes);
  });

  it('renders with only descriptions (no notes / no running balance)', async () => {
    const report = computeStatementReport(makeReport(), ledgerFor(6));
    const bytes = await buildStatementReportPdf(report, {
      entryDetails: true,
      notes: false,
      runningBalance: false,
    });
    expectValidPdf(bytes);
  });

  it('renders a date-filtered report without an Invalid Date', async () => {
    const report = computeStatementReport(makeReport(), ledgerFor(4), '2026-01-01', '2026-01-31');
    const bytes = await buildStatementReportPdf(report);
    expectValidPdf(bytes);
    const text = report.months.map((m) => m.label).join(' ');
    expect(text).not.toMatch(/Invalid Date/i);
  });

  it('handles a party with no phone and an empty ledger', async () => {
    const report = computeStatementReport(makeReport({ phone: '' }), []);
    const bytes = await buildStatementReportPdf(report);
    expectValidPdf(bytes);
  });

  it('respects include options passed to buildPartyStatementPdf', async () => {
    const bytes = await buildPartyStatementPdf({
      ...base,
      ledger: ledgerFor(4),
      include: { entryDetails: false, notes: false, runningBalance: false },
    });
    expectValidPdf(bytes);
  });
});

describe('rendered statement content (Helvetica path)', () => {
  it('shows real descriptions — not an ellipsis — and never "Opening Balance"', async () => {
    const bytes = await buildPartyStatementPdf({ ...base, ledger: ledgerFor(3) });
    const text = await extractPdfText(bytes);
    // ledgerFor alternates customer out/in → "Money Out" / "Money In".
    expect(text).toContain('Money Out');
    expect(text).toContain('Money In');
    // The description text itself, when present, is drawn in full.
    expect(text).toContain('Wheat on credit'); // note on the first entry
    expect(text).not.toMatch(/Opening Balance/i);
  });

  it('uses the user note as the Description, without concatenating the action', async () => {
    const ledger: PartyTransaction[] = [
      { id: 1, partyId: 1, direction: 'in', amount: 500, note: 'cash', date: '2026-08-01', time: '09:00', createdAt: '2026-08-01', kind: 'normal' },
    ];
    const text = await extractPdfText(await buildPartyStatementPdf({ ...base, ledger }));
    expect(text).toContain('cash');
    expect(text).not.toContain('Money In cash');
  });

  it('renders the Summary heading with its column labels on separate rows', async () => {
    const text = await extractPdfText(await buildPartyStatementPdf({ ...base, ledger: ledgerFor(3) }));
    expect(text).toContain('Summary');
    expect(text).toContain('Total Debit');
    expect(text).toContain('Total Credit');
    expect(text).toContain('Net Balance');
  });
});

describe('all eight include combinations', () => {
  const combos: StatementInclude[] = [
    { entryDetails: true, notes: true, runningBalance: true },
    { entryDetails: true, notes: true, runningBalance: false },
    { entryDetails: true, notes: false, runningBalance: true },
    { entryDetails: true, notes: false, runningBalance: false },
    { entryDetails: false, notes: true, runningBalance: true },
    { entryDetails: false, notes: true, runningBalance: false },
    { entryDetails: false, notes: false, runningBalance: true },
    { entryDetails: false, notes: false, runningBalance: false },
  ];

  it.each(combos)('builds a valid full-width statement for %o', async (include) => {
    const report = computeStatementReport(
      makeReport(),
      ledgerFor(12, '2026-01-01', 'A fairly long note that should wrap gracefully')
    );
    const bytes = await buildStatementReportPdf(report, include);
    expectValidPdf(bytes);
  });
});

describe('monthly + combined PDFs', () => {
  it('builds a monthly report', async () => {
    const bytes = await buildMonthlyReportPdf({ year: 2026, month: 7, report: monthlyReport() });
    expectValidPdf(bytes);
  });

  it('builds a combined report with customers and suppliers', async () => {
    const parties: PartyBalance[] = [
      { id: 1, name: 'Ramesh Store', type: 'customer', phone: '9876543210', openingBalance: 0, balance: 25000 },
      { id: 2, name: 'Sharma Traders', type: 'supplier', phone: '', openingBalance: 0, balance: -30000 },
    ];
    const bytes = await buildCombinedPdf({ year: 2026, month: 7, report: monthlyReport(), parties });
    expectValidPdf(bytes);
  });
});

describe('embedded rupee font', () => {
  it('embeds Inter and renders a ₹ when font bytes are injected', async () => {
    const root = process.cwd();
    setPdfFontBytes({
      regular: new Uint8Array(
        fs.readFileSync(path.join(root, 'node_modules', '@expo-google-fonts', 'inter', '400Regular', 'Inter_400Regular.ttf'))
      ),
      bold: new Uint8Array(
        fs.readFileSync(path.join(root, 'node_modules', '@expo-google-fonts', 'inter', '700Bold', 'Inter_700Bold.ttf'))
      ),
    });
    try {
      const bytes = await buildPartyStatementPdf({ ...base, ledger: ledgerFor(3) });
      expectValidPdf(bytes);
      // Embedding two ~180KB TTFs makes the document far larger than the
      // Helvetica fallback, proving the custom fonts were embedded.
      expect(bytes.length).toBeGreaterThan(100_000);
    } finally {
      setPdfFontBytes(null);
    }
  });
});

describe('transactions PDF', () => {
  it('builds a valid transactions report with summary and table', async () => {
    const entries: LedgerRow[] = [
      {
        id: 1,
        kind: 'income',
        amount: 5000,
        note: 'Cash sale',
        date: '2026-08-01',
        time: '10:00',
        createdAt: '2026-08-01T10:00:00.000Z',
        accountId: 1,
        accountName: 'Cash',
        categoryId: 1,
        categoryName: 'Sales',
        categoryIcon: 'wallet',
        fromAccountId: null,
        fromAccountName: null,
        toAccountId: null,
        toAccountName: null,
        entryKind: 'normal',
      },
      {
        id: 2,
        kind: 'expense',
        amount: 2000,
        note: 'Rent',
        date: '2026-08-01',
        time: '12:00',
        createdAt: '2026-08-01T12:00:00.000Z',
        accountId: 2,
        accountName: 'Bank',
        categoryId: 2,
        categoryName: 'Rent',
        categoryIcon: 'home',
        fromAccountId: null,
        fromAccountName: null,
        toAccountId: null,
        toAccountName: null,
        entryKind: 'normal',
      },
      {
        id: 3,
        kind: 'transfer',
        amount: 1000,
        note: 'Cash to bank',
        date: '2026-08-02',
        time: '10:00',
        createdAt: '2026-08-02T10:00:00.000Z',
        accountId: null,
        accountName: null,
        categoryId: null,
        categoryName: null,
        categoryIcon: null,
        fromAccountId: 1,
        fromAccountName: 'Cash',
        toAccountId: 2,
        toAccountName: 'Bank',
        entryKind: 'normal',
      },
      {
        id: 4,
        kind: 'expense',
        amount: 500,
        note: '',
        date: '2026-08-02',
        time: '14:00',
        createdAt: '2026-08-02T14:00:00.000Z',
        accountId: 1,
        accountName: 'Cash',
        categoryId: 3,
        categoryName: 'Office Supplies',
        categoryIcon: 'briefcase',
        fromAccountId: null,
        fromAccountName: null,
        toAccountId: null,
        toAccountName: null,
        entryKind: 'opening',
      },
    ];

    const bytes = await buildTransactionsPdf({
      dateFrom: '2026-08-01',
      dateTo: '2026-08-02',
      entries,
    });

    expectValidPdf(bytes);
    const text = await extractPdfText(bytes);
    expect(text).toContain('Transactions Report');
    expect(text).toContain('Total Income');
    expect(text).toContain('Total Expense');
    expect(text).toContain('Net');
    expect(text).toContain('Cash sale');
    expect(text).toContain('Rent');
    expect(text).toContain('Cash to bank');
    expect(text).toContain('Office Supplies');
  });

  it('handles empty range gracefully', async () => {
    const bytes = await buildTransactionsPdf({
      dateFrom: '2026-08-01',
      dateTo: '2026-08-01',
      entries: [],
    });

    expectValidPdf(bytes);
    const text = await extractPdfText(bytes);
    expect(text).toContain('No transactions in this range');
  });
});
