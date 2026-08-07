/**
 * Global search — finds transactions (+ transfers), parties and accounts from
 * one input. Typing is debounced in `useGlobalSearch`; each entity is queried
 * in SQLite so only matching rows are loaded. Tapping a party or account opens
 * its detail screen; transaction rows are read-only (like the Home recent list).
 */
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AccountItem } from '@/components/account-item';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { PartyItem } from '@/components/party-item';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { SearchInput } from '@/components/search-input';
import { ThemedText } from '@/components/themed-text';
import { TransactionItem } from '@/components/transaction-item';
import { Spacing } from '@/constants/theme';
import { useGlobalSearch } from '@/hooks/use-global-search';
import { useTheme } from '@/hooks/use-theme';
import type { PartyBalance } from '@/types';

export default function SearchScreen() {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const { results, searching } = useGlobalSearch(query);

  const hasQuery = query.trim().length > 0;
  const hasResults =
    results.parties.length > 0 || results.accounts.length > 0 || results.transactions.length > 0;

  const openParty = useCallback((item: PartyBalance) => {
    router.push({ pathname: '/party/[id]', params: { id: item.id } });
  }, []);

  return (
    <Screen>
      <ScreenHeader title="Search" />

      <SearchInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search entries, parties, accounts…"
        autoFocus
      />

      {searching ? (
        <ActivityIndicator
          size="small"
          color={theme.primary}
          style={styles.spinner}
          accessibilityLabel="Searching"
        />
      ) : null}

      {!hasQuery ? (
        <EmptyState
          type="search"
          title="Search everything"
          message="Find transactions, customers, suppliers and accounts by name, note or amount."
        />
      ) : !hasResults ? (
        <EmptyState
          type="search"
          title="No results"
          message={`Nothing matches “${query.trim()}”. Try a different word or number.`}
        />
      ) : (
        <>
          {results.parties.length > 0 ? (
            <View style={styles.section}>
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionLabel}>
                Parties
              </ThemedText>
              <Card>
                {results.parties.map((item) => (
                  <PartyItem key={item.id} item={item} onPress={openParty} />
                ))}
              </Card>
            </View>
          ) : null}

          {results.accounts.length > 0 ? (
            <View style={styles.section}>
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionLabel}>
                Accounts
              </ThemedText>
              <Card>
                {results.accounts.map((item) => (
                  <AccountItem
                    key={item.id}
                    item={item}
                    onPress={() =>
                      router.push({ pathname: '/account/[id]', params: { id: item.id } })
                    }
                  />
                ))}
              </Card>
            </View>
          ) : null}

          {results.transactions.length > 0 ? (
            <View style={styles.section}>
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionLabel}>
                Transactions
              </ThemedText>
              <Card pad={false}>
                {results.transactions.map((item) => (
                  <TransactionItem key={item.id} item={item} />
                ))}
              </Card>
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  spinner: {
    paddingVertical: Spacing.two,
  },
  section: {
    gap: Spacing.two,
  },
  sectionLabel: {
    paddingTop: Spacing.one,
  },
});
