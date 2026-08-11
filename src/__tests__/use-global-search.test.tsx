/**
 * `useGlobalSearch` debounce + staleness tests.
 *
 * Regression: the original "cancelled" boolean flag got stuck `true` the first
 * time the effect cleaned up (i.e. on any second keystroke), so results were
 * permanently dropped and the spinner spun forever. The hook now guards with a
 * request generation: every new query starts fresh and a stale in-flight
 * response can never overwrite a newer one.
 */
import { act, renderHook } from '@testing-library/react-native';

import { searchAccounts } from '@/db/account-repo';
import { searchParties } from '@/db/party-repo';
import { searchLedger } from '@/db/transaction-repo';
import { useGlobalSearch } from '@/hooks/use-global-search';
import type { LedgerRow } from '@/types';

jest.mock('@/db/transaction-repo', () => ({ searchLedger: jest.fn() }));
jest.mock('@/db/party-repo', () => ({ searchParties: jest.fn() }));
jest.mock('@/db/account-repo', () => ({ searchAccounts: jest.fn() }));

const TXN: LedgerRow[] = [{ id: 1, kind: 'income', amount: 10 } as LedgerRow];
const PARTY = [{ id: 1, name: 'Shop' }];
const ACCOUNT = [{ id: 1, name: 'Cash' }];

const EMPTY = { transactions: [], parties: [], accounts: [] };

/** Fire the debounce timer and flush the response microtasks. */
async function flushDebounce() {
  await act(async () => {
    jest.advanceTimersByTime(250);
  });
}

describe('useGlobalSearch', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    (searchLedger as jest.Mock).mockResolvedValue(TXN);
    (searchParties as jest.Mock).mockResolvedValue(PARTY);
    (searchAccounts as jest.Mock).mockResolvedValue(ACCOUNT);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not query while the query is blank', () => {
    const { result } = renderHook(() => useGlobalSearch('   '));

    expect(searchLedger).not.toHaveBeenCalled();
    expect(result.current.searching).toBe(false);
    expect(result.current.results).toEqual(EMPTY);
  });

  it('returns results for a single keystroke after the debounce', async () => {
    const { result } = renderHook(() => useGlobalSearch('a'));

    expect(result.current.searching).toBe(true);
    await flushDebounce();

    expect(searchLedger).toHaveBeenCalledWith('a');
    expect(searchParties).toHaveBeenCalledWith('a');
    expect(searchAccounts).toHaveBeenCalledWith('a');
    expect(result.current.results.transactions).toEqual(TXN);
    expect(result.current.results.parties).toEqual(PARTY);
    expect(result.current.results.accounts).toEqual(ACCOUNT);
    expect(result.current.searching).toBe(false);
  });

  it('returns results when the query changes mid-debounce (regression)', async () => {
    const { rerender, result } = renderHook(({ q }: { q: string }) => useGlobalSearch(q), {
      initialProps: { q: 'a' },
    });

    // Second keystroke before the first debounce fires — the old buggy flag
    // got stuck here and dropped every later response.
    rerender({ q: 'ab' });
    await flushDebounce();

    expect(searchLedger).toHaveBeenCalledWith('ab');
    expect(searchLedger).not.toHaveBeenCalledWith('a');
    expect(result.current.results.transactions).toEqual(TXN);
    expect(result.current.searching).toBe(false);
  });

  it('drops a stale in-flight response once a newer query exists', async () => {
    let resolveSlow: ((rows: LedgerRow[]) => void) | null = null;
    (searchLedger as jest.Mock).mockImplementation((q: string) =>
      q === 'slow' ? new Promise<LedgerRow[]>((r) => (resolveSlow = r)) : Promise.resolve([{ id: 2 } as LedgerRow])
    );
    (searchParties as jest.Mock).mockResolvedValue([]);
    (searchAccounts as jest.Mock).mockResolvedValue([]);

    const { rerender, result } = renderHook(({ q }: { q: string }) => useGlobalSearch(q), {
      initialProps: { q: 'slow' },
    });

    // Slow request is in flight; user types a newer query which completes.
    await flushDebounce();
    rerender({ q: 'new' });
    await flushDebounce();
    expect(result.current.results.transactions).toEqual([{ id: 2 }]);

    // The stale response lands late — it must be ignored.
    await act(async () => {
      resolveSlow?.([{ id: 99 } as LedgerRow]);
    });

    expect(result.current.results.transactions).toEqual([{ id: 2 }]);
    expect(result.current.searching).toBe(false);
  });
});
