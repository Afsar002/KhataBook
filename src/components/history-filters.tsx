/**
 * Advanced filters for the History screen: date range, amount range and
 * multi-select account/category chips. The parent owns the filter state so the
 * list filtering and this panel stay in sync.
 *
 * Party filters aren't offered here because the transaction/transfer feed has
 * no party column — khata ledgers already filter per party.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Account, Category } from '@/types';
import { impact } from '@/utils/haptics';

/** All advanced-filter inputs, owned by the History screen. */
export interface HistoryFiltersState {
  /** `YYYY-MM-DD` (or '' for no bound). Only full dates are honoured. */
  dateFrom: string;
  dateTo: string;
  /** Raw text inputs; parsed with Number() when non-empty. */
  minAmount: string;
  maxAmount: string;
  /** Selected account ids (multi-select). */
  accountIds: number[];
  /** Selected category ids (multi-select). */
  categoryIds: number[];
}

export const EMPTY_FILTERS: HistoryFiltersState = {
  dateFrom: '',
  dateTo: '',
  minAmount: '',
  maxAmount: '',
  accountIds: [],
  categoryIds: [],
};

/** Number of filter dimensions currently in use (for the badge). */
export function activeFilterCount(filters: HistoryFiltersState): number {
  let count = 0;
  if (filters.dateFrom.trim()) {
    count += 1;
  }
  if (filters.dateTo.trim()) {
    count += 1;
  }
  if (filters.minAmount.trim() !== '') {
    count += 1;
  }
  if (filters.maxAmount.trim() !== '') {
    count += 1;
  }
  if (filters.accountIds.length > 0) {
    count += 1;
  }
  if (filters.categoryIds.length > 0) {
    count += 1;
  }
  return count;
}

type HistoryFiltersProps = {
  filters: HistoryFiltersState;
  onChange: (next: HistoryFiltersState) => void;
  accounts: Account[];
  categories: Category[];
};

export function HistoryFilters({ filters, onChange, accounts, categories }: HistoryFiltersProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const count = activeFilterCount(filters);

  /** Applies a partial update (always creates a fresh state object). */
  const set = (patch: Partial<HistoryFiltersState>) => onChange({ ...filters, ...patch });

  /** Toggles an id in/out of a multi-select array. */
  const toggle = (ids: number[], id: number): number[] =>
    ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id];

  return (
    <Card style={styles.card}>
      <Pressable
        onPress={() => {
          impact('light');
          setOpen((value) => !value);
        }}
        accessibilityRole="button"
        accessibilityLabel="Advanced filters"
        style={styles.toggle}>
        <ThemedText type="default">Advanced Filters</ThemedText>
        {count > 0 ? (
          <View style={[styles.badge, { backgroundColor: theme.primary }]}>
            <ThemedText type="small" style={styles.badgeText}>
              {count}
            </ThemedText>
          </View>
        ) : null}
        <ThemedText type="small" themeColor="primary">
          {open ? 'Hide' : 'Show'}
        </ThemedText>
      </Pressable>

      {open ? (
        <View style={styles.body}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            Date range
          </ThemedText>
          <View style={styles.row}>
            <View style={styles.field}>
              <TextField
                label="From"
                placeholder="YYYY-MM-DD"
                value={filters.dateFrom}
                onChangeText={(text) => set({ dateFrom: text })}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="From date"
              />
            </View>
            <View style={styles.field}>
              <TextField
                label="To"
                placeholder="YYYY-MM-DD"
                value={filters.dateTo}
                onChangeText={(text) => set({ dateTo: text })}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="To date"
              />
            </View>
          </View>

          <ThemedText type="smallBold" themeColor="textSecondary">
            Amount range
          </ThemedText>
          <View style={styles.row}>
            <View style={styles.field}>
              <TextField
                label="Min ₹"
                placeholder="0"
                keyboardType="numeric"
                value={filters.minAmount}
                onChangeText={(text) => set({ minAmount: text.replace(/[^\d.]/g, '') })}
                accessibilityLabel="Minimum amount"
              />
            </View>
            <View style={styles.field}>
              <TextField
                label="Max ₹"
                placeholder="Any"
                keyboardType="numeric"
                value={filters.maxAmount}
                onChangeText={(text) => set({ maxAmount: text.replace(/[^\d.]/g, '') })}
                accessibilityLabel="Maximum amount"
              />
            </View>
          </View>

          {accounts.length > 0 ? (
            <>
              <ThemedText type="smallBold" themeColor="textSecondary">
                Accounts
              </ThemedText>
              <View style={styles.chips}>
                {accounts.map((account) => (
                  <Chip
                    key={account.id}
                    label={account.name}
                    selected={filters.accountIds.includes(account.id)}
                    onPress={() => set({ accountIds: toggle(filters.accountIds, account.id) })}
                  />
                ))}
              </View>
            </>
          ) : null}

          {categories.length > 0 ? (
            <>
              <ThemedText type="smallBold" themeColor="textSecondary">
                Categories
              </ThemedText>
              <View style={styles.chips}>
                {categories.map((category) => (
                  <Chip
                    key={category.id}
                    label={category.name}
                    selected={filters.categoryIds.includes(category.id)}
                    onPress={() => set({ categoryIds: toggle(filters.categoryIds, category.id) })}
                  />
                ))}
              </View>
            </>
          ) : null}

          {count > 0 ? (
            <Pressable
              onPress={() => {
                impact('medium');
                onChange({ ...EMPTY_FILTERS });
              }}
              accessibilityRole="button"
              style={styles.clear}>
              <ThemedText type="small" themeColor="primary">
                Clear filters
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.two,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.one,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
  },
  body: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  field: {
    flex: 1,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  clear: {
    alignSelf: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Radius.chip,
  },
});
