/**
 * Party khata statement PDF: builds through pdf-lib and always returns a valid
 * PDF document, with or without ledger rows.
 */
import { buildPartyStatementPdf } from '@/utils/pdf';
import type { PartyTransaction } from '@/types';

/** First 5 bytes of a pdf-lib document are the ASCII magic `%PDF-`. */
function pdfMagic(bytes: Uint8Array): string {
  return String.fromCharCode(...Array.from(bytes).slice(0, 5));
}

describe('buildPartyStatementPdf', () => {
  const base = {
    name: 'Ramesh Store',
    phone: '9876543210',
    type: 'customer' as const,
    openingBalance: 500,
    balance: 1700,
  };

  it('produces a valid PDF with ledger rows', async () => {
    const ledger: PartyTransaction[] = [
      {
        id: 1,
        partyId: 1,
        direction: 'out',
        amount: 1500,
        note: 'Wheat on credit',
        date: '2026-08-01',
        createdAt: '2026-08-01',
        kind: 'normal',
      },
      {
        id: 2,
        partyId: 1,
        direction: 'in',
        amount: 300,
        note: '',
        date: '2026-08-02',
        createdAt: '2026-08-02',
        kind: 'normal',
      },
    ];

    const bytes = await buildPartyStatementPdf({ ...base, ledger });

    const head = pdfMagic(bytes);
    expect(head).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it('produces a valid PDF with an empty ledger', async () => {
    const bytes = await buildPartyStatementPdf({ ...base, ledger: [] });
    expect(pdfMagic(bytes)).toBe('%PDF-');
  });

  it('handles a supplier with a negative (we owe) balance', async () => {
    const bytes = await buildPartyStatementPdf({
      name: 'Sharma Traders',
      phone: '',
      type: 'supplier',
      openingBalance: 0,
      balance: -2000,
      ledger: [
        {
          id: 1,
          partyId: 2,
          direction: 'out',
          amount: 2000,
          note: 'Stock purchase',
          date: '2026-08-03',
          createdAt: '2026-08-03',
          kind: 'normal',
        },
      ],
    });
    expect(pdfMagic(bytes)).toBe('%PDF-');
  });
});
