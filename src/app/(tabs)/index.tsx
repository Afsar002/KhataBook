import { router, useFocusEffect } from 'expo-router';
import { Banknote, ChevronRight, Inbox, Landmark, Search, TrendingDown, TrendingUp } from 'lucide-react-native';
import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BalanceCard } from '@/components/balance-card';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { Fab } from '@/components/fab';
import { LargeButton } from '@/components/large-button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { TransactionItem } from '@/components/transaction-item';
import { Spacing } from '@/constants/theme';
import { useProfile } from '@/context/profile-context';
import { useAccounts } from '@/hooks/use-accounts';
import { useDaySummary } from '@/hooks/use-day-summary';
import { useLedger } from '@/hooks/use-ledger';
import { useTheme } from '@/hooks/use-theme';
import { formatINR, todayISODate } from '@/utils/format';

export default function DashboardScreen() {
  const theme = useTheme();
  const { profile } = useProfile();
  const today = todayISODate();

  const { balances, refresh: refreshAccounts } = useAccounts();
  const { summary, refresh: refreshDay } = useDaySummary(today);
  const { entries, refresh: refreshLedger } = useLedger();

  useFocusEffect(
    useCallback(() => {
      void refreshAccounts();
      void refreshDay();
      void refreshLedger();
    }, [refreshAccounts, refreshDay, refreshLedger])
  );

  const total = balances.reduce((sum, b) => sum + b.balance, 0);
  const cash = balances.filter((b) => b.type === 'cash').reduce((s, b) => s + b.balance, 0);
  const bank = balances.filter((b) => b.type === 'bank').reduce((s, b) => s + b.balance, 0);
  const recent = entries.slice(0, 5);

  return (
    <View style={styles.fabHost}>
      <Screen>
        <View style={styles.header}>
          <View style={styles.profileHeader}>
            <View style={[styles.headerAvatar, { backgroundColor: theme.incomeSoft }]}>
              <ThemedText style={styles.headerAvatarEmoji}>{profile.avatar || '🏪'}</ThemedText>
            </View>
            <View style={styles.headerText}>
              <ThemedText type="subtitle" numberOfLines={1}>
                {profile.shopName || profile.name || 'DailyKhata'}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
              </ThemedText>
            </View>
          </View>
          <Pressable
            onPress={() => router.push('/search')}
            accessibilityRole="button"
            accessibilityLabel="Search"
            hitSlop={8}
            style={[styles.searchButton, { backgroundColor: theme.backgroundElement }]}>
            <Search size={22} color={theme.text} />
          </Pressable>
        </View>

        <Card style={styles.totalCard}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            Total Balance
          </ThemedText>
          <Text style={[styles.totalAmount, { color: theme.primary }]} numberOfLines={1} ellipsizeMode="tail">
            {formatINR(total)}
          </Text>
        </Card>

        <View style={styles.row}>
          <Pressable
            onPress={() => router.push('/cashbook')}
            accessibilityRole="button"
            accessibilityLabel="Open cash book"
            style={styles.bankCard}>
            <BalanceCard label="Cash" amount={cash} icon={Banknote} accent={theme.income} />
            <View style={[styles.bankChevron, { backgroundColor: theme.backgroundElement }]}>
              <ChevronRight size={16} color={theme.textSecondary} />
            </View>
          </Pressable>
          <Pressable
            onPress={() => router.push('/accounts')}
            accessibilityRole="button"
            accessibilityLabel="Open accounts"
            style={styles.bankCard}>
            <BalanceCard label="Total Bank" amount={bank} icon={Landmark} accent={theme.income} />
            <View style={[styles.bankChevron, { backgroundColor: theme.backgroundElement }]}>
              <ChevronRight size={16} color={theme.textSecondary} />
            </View>
          </Pressable>
        </View>

        <Card style={styles.row}>
          <View style={styles.summaryItem}>
            <TrendingUp size={18} color={theme.income} />
            <ThemedText type="small" themeColor="textSecondary">
              Today&apos;s Income
            </ThemedText>
            <Text style={[styles.summaryAmount, { color: theme.income }]} numberOfLines={1} ellipsizeMode="tail">
              +{formatINR(summary.income)}
            </Text>
          </View>
          <View style={[styles.summaryItem, styles.summaryDivider, { borderLeftColor: theme.border }]}>
            <TrendingDown size={18} color={theme.expense} />
            <ThemedText type="small" themeColor="textSecondary">
              Today&apos;s Expense
            </ThemedText>
            <Text style={[styles.summaryAmount, { color: theme.expense }]} numberOfLines={1} ellipsizeMode="tail">
              -{formatINR(summary.expense)}
            </Text>
          </View>
        </Card>

        <View style={styles.row}>
          <LargeButton
            title="Add Income"
            subtitle="Money received"
            variant="income"
            icon={TrendingUp}
            onPress={() => router.push('/income')}
            height={72}
            style={styles.actionButton}
          />
          <LargeButton
            title="Add Expense"
            subtitle="Money spent"
            variant="expense"
            icon={TrendingDown}
            onPress={() => router.push('/expense')}
            height={72}
            style={styles.actionButton}
          />
        </View>

        <View style={styles.recentHeader}>
          <ThemedText type="smallBold">Recent</ThemedText>
          <Pressable
            onPress={() => router.push('/history')}
            accessibilityRole="button"
            hitSlop={8}>
            <ThemedText type="small" themeColor="primary">
              View all
            </ThemedText>
          </Pressable>
        </View>

        {recent.length > 0 ? (
          <Card style={styles.recentCard}>
            {recent.map((item, index) => (
              <View key={item.id}>
                <TransactionItem item={item} />
                {index < recent.length - 1 ? (
                  <View style={[styles.separator, { backgroundColor: theme.border }]} />
                ) : null}
              </View>
            ))}
          </Card>
        ) : (
          <Card>
            <EmptyState
              icon={Inbox}
              title="No transactions yet"
              message="Tap '+' to record your first income, expense or transfer."
            />
          </Card>
        )}
      </Screen>
      <Fab />
    </View>
  );
}

const styles = StyleSheet.create({
  fabHost: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    flex: 1,
  },
  headerAvatar: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarEmoji: {
    fontSize: 28,
  },
  headerText: {
    flex: 1,
  },
  searchButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  totalCard: {
    gap: Spacing.one,
  },
  totalAmount: {
    fontFamily: 'Inter_700Bold',
    fontSize: 44,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  bankCard: {
    flex: 1,
  },
  bankChevron: {
    position: 'absolute',
    right: Spacing.two,
    top: Spacing.two,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryItem: {
    flex: 1,
    gap: Spacing.half,
  },
  summaryDivider: {
    borderLeftWidth: 1,
    paddingLeft: Spacing.three,
  },
  summaryAmount: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
  },
  actionButton: {
    flex: 1,
  },
  recentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.two,
  },
  recentCard: {
    paddingHorizontal: Spacing.three,
  },
  separator: {
    height: 1,
    marginLeft: 52,
  },
});
