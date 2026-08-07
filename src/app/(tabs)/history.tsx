import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, SectionList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import {
  activeFilterCount,
  EMPTY_FILTERS,
  HistoryFilters,
  type HistoryFiltersState,
} from '@/components/history-filters';
import { SearchInput } from '@/components/search-input';
import { Segment, type SegmentOption } from '@/components/segment';
import { ThemedText } from '@/components/themed-text';
import { TransactionItem } from '@/components/transaction-item';
import { InterFonts, Spacing } from '@/constants/theme';
import { editRouteForLedgerRow } from '@/db/transaction-repo';
import { useFilterOptions } from '@/hooks/use-filter-options';
import { useLedger } from '@/hooks/use-ledger';
import { useResponsiveLayout } from '@/hooks/use-responsive';
import { useTheme } from '@/hooks/use-theme';
import type { LedgerKind, LedgerRow } from '@/types';
import { formatDateLabel } from '@/utils/format';

type FilterKey = 'all' | LedgerKind;

const FILTER_OPTIONS: SegmentOption[] = [
  { key: 'all', label: 'All' },
  { key: 'income', label: 'Income' },
  { key: 'expense', label: 'Expense' },
  { key: 'transfer', label: 'Transfers' },
];

type Section = { title: string; data: LedgerRow[] };

/** Full `YYYY-MM-DD` — shorter partial dates are ignored to avoid surprises. */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function HistoryScreen() {
  const theme = useTheme();
  const { contentMaxWidth } = useResponsiveLayout();
  const { entries, hasMore, loadMore, loadingMore, refresh } = useLedger();
  const { accounts, categories } = useFilterOptions();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<HistoryFiltersState>(EMPTY_FILTERS);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  /** Stable row handler — Opening Balance entries have no edit route. */
  const openEntry = useCallback((row: LedgerRow) => {
    const route = editRouteForLedgerRow(row);
    if (route) {
      router.push(route);
    }
  }, []);

  const filtered = useMemo(() => {
    let rows = entries;
    if (filter !== 'all') {
      rows = rows.filter((entry) => entry.kind === filter);
    }
    const q = query.trim().toLowerCase();
    if (q) {
      const numeric = q.replace(/[^0-9]/g, '');
      rows = rows.filter((entry) => {
        const textMatch =
          (entry.note ?? '').toLowerCase().includes(q) ||
          (entry.categoryName ?? '').toLowerCase().includes(q) ||
          (entry.accountName ?? '').toLowerCase().includes(q) ||
          (entry.fromAccountName ?? '').toLowerCase().includes(q) ||
          (entry.toAccountName ?? '').toLowerCase().includes(q);
        const amountMatch = numeric !== '' && String(Math.round(entry.amount)).includes(numeric);
        return textMatch || amountMatch;
      });
    }
    // Advanced filters: date range, amount range, account/category multi-select.
    if (filters.dateFrom && DATE_RE.test(filters.dateFrom)) {
      rows = rows.filter((entry) => entry.date >= filters.dateFrom);
    }
    if (filters.dateTo && DATE_RE.test(filters.dateTo)) {
      rows = rows.filter((entry) => entry.date <= filters.dateTo);
    }
    const min = Number(filters.minAmount);
    if (filters.minAmount !== '' && !Number.isNaN(min)) {
      rows = rows.filter((entry) => entry.amount >= min);
    }
    const max = Number(filters.maxAmount);
    if (filters.maxAmount !== '' && !Number.isNaN(max)) {
      rows = rows.filter((entry) => entry.amount <= max);
    }
    if (filters.accountIds.length > 0) {
      rows = rows.filter(
        (entry) =>
          (entry.accountId != null && filters.accountIds.includes(entry.accountId)) ||
          (entry.fromAccountId != null && filters.accountIds.includes(entry.fromAccountId)) ||
          (entry.toAccountId != null && filters.accountIds.includes(entry.toAccountId))
      );
    }
    if (filters.categoryIds.length > 0) {
      rows = rows.filter(
        (entry) => entry.categoryId != null && filters.categoryIds.includes(entry.categoryId)
      );
    }
    return rows;
  }, [entries, filter, query, filters]);

  const hasActiveFilters = activeFilterCount(filters) > 0;

  const sections = useMemo(() => {
    const map = new Map<string, LedgerRow[]>();
    for (const item of filtered) {
      const bucket = map.get(item.date) ?? [];
      bucket.push(item);
      map.set(item.date, bucket);
    }
    return Array.from(map.entries()).map<Section>(([date, data]) => ({
      title: formatDateLabel(date),
      data,
    }));
  }, [filtered]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={[styles.container, { maxWidth: contentMaxWidth }]}>
        <ThemedText type="subtitle">History</ThemedText>

        <SearchInput value={query} onChangeText={setQuery} placeholder="Search entries…" />

        <Segment
          options={FILTER_OPTIONS}
          value={filter}
          onChange={(key) => setFilter(key as FilterKey)}
        />

        <HistoryFilters
          filters={filters}
          onChange={setFilters}
          accounts={accounts}
          categories={categories}
        />

        <SectionList
          sections={sections}
          keyExtractor={(item) => String(item.id)}
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={7}
          renderSectionHeader={({ section }) => (
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionHeader}>
              {section.title}
            </ThemedText>
          )}
          renderItem={({ item }) => <TransactionItem item={item} onPress={openEntry} />}
          onEndReached={hasMore ? () => void loadMore() : undefined}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator
                color={theme.textSecondary}
                style={styles.listFooter}
                accessibilityLabel="Loading more entries"
              />
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              type="entries"
              title={hasActiveFilters || query.trim() ? 'No matching entries' : 'Nothing here yet'}
              message={
                hasActiveFilters || query.trim()
                  ? 'Try clearing the search or filters to see more entries.'
                  : 'Record your income, expenses and transfers from the Home screen.'
              }
            />
          }
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  container: {
    flex: 1,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
  },
  sectionHeader: {
    paddingTop: Spacing.four,
    paddingBottom: Spacing.two,
    fontFamily: InterFonts.semibold,
  },
  listContent: {
    paddingBottom: Spacing.seven,
  },
  listFooter: {
    paddingVertical: Spacing.four,
  },
});
