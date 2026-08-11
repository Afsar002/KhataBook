/**
 * `useLedger` filter-reload tests.
 *
 * The SQL-filter work moved filtering out of the screen; this verifies the
 * hook reloads from the newest page when the filter VALUE changes and ignores
 * identity-only churn (a recreated object with the same values), so a parent
 * rebuild that re-memoizes a filter never fires a redundant query.
 */
import { renderHook, waitFor } from '@testing-library/react-native';

import { type LedgerFilter, listLedgerPage } from '@/db/transaction-repo';
import { useLedger } from '@/hooks/use-ledger';

jest.mock('@/db/transaction-repo', () => ({
  listLedgerPage: jest.fn(),
}));

type HookProps = { filter: LedgerFilter | undefined };

const page = { rows: [{ id: 1, date: '2026-08-01', amount: 10 }], hasMore: false, nextCursor: null };

describe('useLedger filter reloads', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (listLedgerPage as jest.Mock).mockResolvedValue(page);
  });

  it('loads the first page on mount', async () => {
    const { result } = renderHook(() => useLedger());

    expect(listLedgerPage).toHaveBeenCalledTimes(1);
    expect(listLedgerPage).toHaveBeenCalledWith(undefined);

    await waitFor(() => expect(result.current.entries).toHaveLength(1));
    expect(result.current.hasMore).toBe(false);
  });

  it('reloads from the newest page when the filter value changes', async () => {
    const { rerender } = renderHook(({ filter }: HookProps) => useLedger(filter), {
      initialProps: { filter: undefined },
    });
    await waitFor(() => expect(listLedgerPage).toHaveBeenCalledTimes(1));

    rerender({ filter: { query: 'chai' } });

    await waitFor(() => expect(listLedgerPage).toHaveBeenCalledTimes(2));
    expect(listLedgerPage).toHaveBeenLastCalledWith({ query: 'chai' });
  });

  it('skips reloading when only the filter identity changes', async () => {
    const { rerender } = renderHook(({ filter }: HookProps) => useLedger(filter), {
      initialProps: { filter: { query: 'chai' } },
    });
    await waitFor(() => expect(listLedgerPage).toHaveBeenCalledTimes(1));

    // Same values, fresh object — the value-key gate must swallow it.
    rerender({ filter: { query: 'chai' } });

    await waitFor(() => {
      expect(listLedgerPage).toHaveBeenCalledTimes(1);
    });
  });
});
