/**
 * Global search hook.
 *
 * Debounces the query and searches transactions (+transfers), parties and
 * accounts in parallel. Results are dropped when the query changes again
 * mid-flight so a stale response can never overwrite a newer one.
 */
import { useEffect, useRef, useState } from 'react';

import { searchAccounts } from '@/db/account-repo';
import { searchParties } from '@/db/party-repo';
import { searchLedger } from '@/db/transaction-repo';
import type { AccountBalance, LedgerRow, PartyBalance } from '@/types';

export interface GlobalSearchResult {
  transactions: LedgerRow[];
  parties: PartyBalance[];
  accounts: AccountBalance[];
}

export interface UseGlobalSearch {
  /** Grouped matches for the current query (empty when the query is blank). */
  results: GlobalSearchResult;
  /** True while a debounced search is running. */
  searching: boolean;
}

const EMPTY: GlobalSearchResult = { transactions: [], parties: [], accounts: [] };

/** Pause between the last keystroke and the first query, so typing is smooth. */
const DEBOUNCE_MS = 250;

export function useGlobalSearch(query: string): UseGlobalSearch {
  const [results, setResults] = useState<GlobalSearchResult>(EMPTY);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const q = query.trim();
    if (!q) {
      cancelled.current = true;
      setResults(EMPTY);
      setSearching(false);
      return;
    }

    setSearching(true);
    timer.current = setTimeout(() => {
      void Promise.all([searchLedger(q), searchParties(q), searchAccounts(q)]).then(
        ([transactions, parties, accounts]) => {
          if (!cancelled.current) {
            setResults({ transactions, parties, accounts });
            setSearching(false);
          }
        }
      );
    }, DEBOUNCE_MS);

    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      cancelled.current = true;
    };
  }, [query]);

  return { results, searching };
}
