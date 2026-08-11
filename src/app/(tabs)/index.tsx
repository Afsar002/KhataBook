import { router, useFocusEffect } from "expo-router";
import {
    Banknote,
    ChevronRight,
    Landmark,
    Search,
} from "lucide-react-native";
import { useCallback } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { BalanceCard } from "@/components/balance-card";
import { Card } from "@/components/card";
import { DayEntryCard } from "@/components/day-entry-card";
import { FitText } from "@/components/fit-text";
import { EmptyState } from "@/components/empty-state";
import { Fab } from "@/components/fab";
import { Screen } from "@/components/screen";
import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { useProfile } from "@/context/profile-context";
import { editRouteForLedgerRow } from "@/db/transaction-repo";
import { useAccounts } from "@/hooks/use-accounts";
import { useDaySummary } from "@/hooks/use-day-summary";
import { useLedger } from "@/hooks/use-ledger";
import { useTheme } from "@/hooks/use-theme";
import type { LedgerRow } from "@/types";
import { formatINR, todayISODate } from "@/utils/format";

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
    }, [refreshAccounts, refreshDay, refreshLedger]),
  );

  const total = balances.reduce((sum, b) => sum + b.balance, 0);
  const cash = balances
    .filter((b) => b.type === "cash")
    .reduce((s, b) => s + b.balance, 0);
  const bank = balances
    .filter((b) => b.type === "bank")
    .reduce((s, b) => s + b.balance, 0);
  // Same 3-column ledger as the Cashbook: transfers are net-zero and don't fit
  // the Withdraw/Deposit split, so they're filtered out of Recent.
  const recent = entries.filter((entry) => entry.kind !== "transfer").slice(0, 5);

  const openEntry = useCallback((row: LedgerRow) => {
    const route = editRouteForLedgerRow(row);
    if (route) {
      router.push(route);
    }
  }, []);

  return (
    <View style={styles.fabHost}>
      <Screen hasTabBar>
        <View style={styles.header}>
          <View style={styles.profileHeader}>
            <View
              style={[
                styles.headerAvatar,
                { backgroundColor: theme.incomeSoft },
              ]}
            >
              <ThemedText style={styles.headerAvatarEmoji}>
                {profile.avatar || "🏪"}
              </ThemedText>
            </View>
            <View style={styles.headerText}>
              <ThemedText type="subtitle" numberOfLines={1}>
                {profile.shopName || profile.name || "DailyKhata"}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {new Date().toLocaleDateString("en-IN", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </ThemedText>
            </View>
          </View>
          <Pressable
            onPress={() => router.push("/search")}
            accessibilityRole="button"
            accessibilityLabel="Search"
            hitSlop={8}
            style={[
              styles.searchButton,
              { backgroundColor: theme.backgroundElement },
            ]}
          >
            <Search size={22} color={theme.text} />
          </Pressable>
        </View>

        <Card style={styles.totalCard}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            Total Balance
          </ThemedText>
          <FitText
            fontSize={36}
            style={[
              styles.totalAmount,
              { color: total < 0 ? theme.expense : theme.primary },
            ]}
          >
            {formatINR(total)}
          </FitText>
        </Card>

        <View style={styles.row}>
          <Pressable
            onPress={() => router.push("/cashbook")}
            accessibilityRole="button"
            accessibilityLabel="Open cash book"
            style={styles.bankCard}
          >
            <BalanceCard label="Cash" amount={cash} icon={Banknote} />
            <View
              style={[
                styles.bankChevron,
                { backgroundColor: theme.backgroundElement },
              ]}
            >
              <ChevronRight size={16} color={theme.textSecondary} />
            </View>
          </Pressable>
          <Pressable
            onPress={() => router.push("/accounts")}
            accessibilityRole="button"
            accessibilityLabel="Open accounts"
            style={styles.bankCard}
          >
            <BalanceCard label="Total Bank" amount={bank} icon={Landmark} />
            <View
              style={[
                styles.bankChevron,
                { backgroundColor: theme.backgroundElement },
              ]}
            >
              <ChevronRight size={16} color={theme.textSecondary} />
            </View>
          </Pressable>
        </View>

        <Card style={styles.row}>
          <View style={styles.summaryItem}>
            <View style={styles.summaryText}>
              <ThemedText type="small" themeColor="textSecondary">
                Today&apos;s Deposit
              </ThemedText>
              <FitText
                fontSize={20}
                style={[styles.summaryAmount, { color: theme.income }]}
              >
                {formatINR(summary.income)}
              </FitText>
            </View>
          </View>
          <View
            style={[
              styles.summaryItem,
              styles.summaryDivider,
              { borderLeftColor: theme.border },
            ]}
          >
            <View style={styles.summaryText}>
              <ThemedText type="small" themeColor="textSecondary">
                Today&apos;s Withdraw
              </ThemedText>
              <FitText
                fontSize={20}
                style={[styles.summaryAmount, { color: theme.expense }]}
              >
                {formatINR(summary.expense)}
              </FitText>
            </View>
          </View>
        </Card>

        <View style={styles.recentHeader}>
          <ThemedText type="smallBold">Recent</ThemedText>
          <Pressable
            onPress={() => router.push("/history")}
            accessibilityRole="button"
            hitSlop={8}
          >
            <ThemedText type="small" themeColor="primary">
              View all
            </ThemedText>
          </Pressable>
        </View>

        {recent.length > 0 ? (
          <View>
            <View style={styles.recentColumns}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.recentHeaderTime}>
                Time
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.recentHeaderCenter}>
                Withdraw
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.recentHeaderRight}>
                Deposit
              </ThemedText>
            </View>
            <View style={styles.recentList}>
              {recent.map((item) => (
                <DayEntryCard
                  key={item.id}
                  time={item.time}
                  pill={item.categoryName ?? undefined}
                  withdraw={item.kind === "expense" ? item.amount : null}
                  deposit={item.kind === "income" ? item.amount : null}
                  hasAttachments={item.hasAttachments}
                  onPress={item.entryKind !== "opening" ? () => openEntry(item) : undefined}
                />
              ))}
            </View>
          </View>
        ) : (
          <Card>
            <EmptyState
              type="transactions"
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    flex: 1,
  },
  headerAvatar: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
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
    alignItems: "center",
    justifyContent: "center",
  },
  totalCard: {
    gap: Spacing.one,
  },
  totalAmount: {
    fontFamily: "Inter_700Bold",
    fontSize: 36,
  },
  row: {
    flexDirection: "row",
    gap: Spacing.three,
  },
  bankCard: {
    flex: 1,
  },
  bankChevron: {
    position: "absolute",
    right: Spacing.two,
    top: Spacing.two,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
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
    fontFamily: "Inter_700Bold",
    fontSize: 20,
  },
  summaryInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  summaryText: {
    flex: 1,
    justifyContent: "center",
    gap: Spacing.half,
  },
  actionButton: {
    flex: 1,
  },
  recentHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.two,
  },
  recentList: {
    gap: Spacing.two,
  },
  // Column labels above the Recent ledger — mirrors the DayEntryCard's layout
  // (2:1:1 flex + same 16px padding) so each label sits over its column.
  recentColumns: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.one,
  },
  recentHeaderTime: {
    flex: 2,
  },
  recentHeaderCenter: {
    flex: 1,
    textAlign: "center",
  },
  recentHeaderRight: {
    flex: 1,
    textAlign: "right",
  },
});
