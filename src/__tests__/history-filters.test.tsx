/**
 * History advanced-filter helper tests — the pure functions exported from the
 * filters panel (no rendering needed).
 */
import { activeFilterCount, EMPTY_FILTERS } from '@/components/history-filters';

describe('History filters', () => {
  it('counts zero active dimensions when nothing is set', () => {
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
  });

  it('counts one per non-empty dimension', () => {
    expect(
      activeFilterCount({
        ...EMPTY_FILTERS,
        dateFrom: '2026-01-01',
        minAmount: '100',
        accountIds: [1, 2],
      })
    ).toBe(3);
  });

  it('does not count empty strings or arrays', () => {
    expect(
      activeFilterCount({
        ...EMPTY_FILTERS,
        dateTo: '   ',
        maxAmount: '',
        categoryIds: [],
        accountIds: [],
      })
    ).toBe(0);
  });
});
