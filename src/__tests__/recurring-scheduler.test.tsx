/**
 * Recurring scheduler tests — the "generate on schedule" logic that creates
 * transactions/party entries from active templates for a given date.
 */
import {
  generateEntriesForDate,
  catchUpMissedEntries,
} from '@/services/recurring/scheduler';
import type { RecurringTemplate } from '@/types';

jest.mock('@/db/recurring-repo', () => ({
  listActiveRecurringTemplatesForDate: jest.fn(),
  updateLastGeneratedDate: jest.fn(),
  listRecurringTemplates: jest.fn(),
}));

jest.mock('@/db/transaction-repo', () => ({
  addTransaction: jest.fn().mockResolvedValue(1),
}));

jest.mock('@/db/party-repo', () => ({
  addPartyTransaction: jest.fn().mockResolvedValue(2),
}));

function makeTemplate(overrides: Partial<RecurringTemplate> = {}): RecurringTemplate {
  return {
    id: 1,
    uuid: 'tpl-1',
    templateType: 'transaction',
    type: 'expense',
    amount: 500,
    accountId: 3,
    categoryId: null,
    note: 'Rent',
    partyId: null,
    direction: undefined,
    frequency: 'daily',
    dayOfWeek: null,
    dayOfMonth: null,
    startDate: '2026-01-01',
    endDate: null,
    lastGeneratedDate: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('Recurring scheduler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('generates a transaction entry for a matching daily template', async () => {
    const template = makeTemplate();
    require('@/db/recurring-repo').listActiveRecurringTemplatesForDate.mockResolvedValue([template]);

    const results = await generateEntriesForDate('2026-01-15');

    const { addTransaction } = require('@/db/transaction-repo');
    expect(addTransaction).toHaveBeenCalledWith({
      type: 'expense',
      amount: 500,
      accountId: 3,
      categoryId: null,
      note: 'Rent',
      date: '2026-01-15',
    });
    expect(results).toEqual([{ templateId: 1, templateUuid: 'tpl-1', success: true }]);
  });

  it('skips a weekly template when the target day does not match', async () => {
    // 2026-01-15 is a Thursday (getDay() = 4); template fires only on Sunday (0).
    const template = makeTemplate({ frequency: 'weekly', dayOfWeek: 0 });
    require('@/db/recurring-repo').listActiveRecurringTemplatesForDate.mockResolvedValue([template]);

    const results = await generateEntriesForDate('2026-01-15');

    expect(require('@/db/transaction-repo').addTransaction).not.toHaveBeenCalled();
    expect(results).toEqual([]);
  });

  it('fires a weekly template on its matching weekday', async () => {
    // 2026-01-18 is a Sunday (getDay() = 0).
    const template = makeTemplate({ frequency: 'weekly', dayOfWeek: 0 });
    require('@/db/recurring-repo').listActiveRecurringTemplatesForDate.mockResolvedValue([template]);

    const results = await generateEntriesForDate('2026-01-18');

    expect(require('@/db/transaction-repo').addTransaction).toHaveBeenCalledTimes(1);
    expect(results[0]).toMatchObject({ success: true });
  });

  it('does not generate before the template start date', async () => {
    const template = makeTemplate({ startDate: '2026-02-01' });
    require('@/db/recurring-repo').listActiveRecurringTemplatesForDate.mockResolvedValue([template]);

    const results = await generateEntriesForDate('2026-01-15');

    expect(require('@/db/transaction-repo').addTransaction).not.toHaveBeenCalled();
    expect(results).toEqual([]);
  });

  it('generates a party transaction for a party template with direction', async () => {
    const template = makeTemplate({
      templateType: 'party_transaction',
      direction: 'in',
      partyId: 9,
      accountId: null,
      categoryId: null,
      type: undefined,
    });
    require('@/db/recurring-repo').listActiveRecurringTemplatesForDate.mockResolvedValue([template]);

    const results = await generateEntriesForDate('2026-01-15');

    const { addPartyTransaction } = require('@/db/party-repo');
    expect(addPartyTransaction).toHaveBeenCalledWith({
      partyId: 9,
      direction: 'in',
      amount: 500,
      note: 'Rent',
      date: '2026-01-15',
    });
    expect(results[0]).toMatchObject({ success: true });
  });

  it('reports failure instead of throwing when a transaction template is invalid', async () => {
    const template = makeTemplate({ accountId: null });
    require('@/db/recurring-repo').listActiveRecurringTemplatesForDate.mockResolvedValue([template]);

    const results = await generateEntriesForDate('2026-01-15');

    expect(results[0]).toMatchObject({
      templateId: 1,
      success: false,
      error: expect.stringContaining('Invalid transaction template'),
    });
  });

  it('records the generated date so the template does not re-fire', async () => {
    const template = makeTemplate();
    require('@/db/recurring-repo').listActiveRecurringTemplatesForDate.mockResolvedValue([template]);

    await generateEntriesForDate('2026-01-15');

    const { updateLastGeneratedDate } = require('@/db/recurring-repo');
    expect(updateLastGeneratedDate).toHaveBeenCalledWith(1, '2026-01-15');
  });

  it('catch-up is a no-op when no templates exist', async () => {
    require('@/db/recurring-repo').listRecurringTemplates.mockResolvedValue([]);
    const results = await catchUpMissedEntries();
    expect(results).toEqual([]);
  });
});
