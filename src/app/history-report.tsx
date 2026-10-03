/**
 * Older Entries — pushed from the Cashbook's summary card. Browse the ledger by
 * duration (This Month default) and download the range as a PDF, or toggle to
 * the detailed History view for a full khata-style ledger of all transactions.
 */
import { router, useFocusEffect } from "expo-router";
import { ChevronRight, CircleHelp, Download } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    SectionList,
    StyleSheet,
    View,
} from "react-native";

import { Card } from "@/components/card";
import {
    DEFAULT_DURATION,
    DurationPicker,
    durationBounds,
    type DurationKey,
} from "@/components/duration-picker";
import { EmptyState } from "@/components/empty-state";
import { feedback } from "@/components/feedback";
import { LargeButton } from "@/components/large-button";
import { PartyDayEntryCard } from "@/components/party-day-entry-card";
import { Screen } from "@/components/screen";
import { ScreenHeader } from "@/components/screen-header";
import { Segment } from "@/components/segment";
import { ThemedText } from "@/components/themed-text";
import { InterFonts, Radius, Spacing } from "@/constants/theme";
import {
    editRouteForLedgerRow,
    listDaySummaries,
    listLedgerRange,
    runningCashInHand,
    type DayLedgerSummary,
} from "@/db/transaction-repo";
import { useResponsiveLayout } from "@/hooks/use-responsive";
import { useTheme } from "@/hooks/use-theme";
import type { LedgerRow } from "@/types";
import {
    formatDayMonth,
    formatINR,
    formatISOToDisplay,
    formatRangeDate,
} from "@/utils/format";
import { buildTransactionsPdf } from "@/utils/pdf";
import { writeAndShareFile } from "@/utils/share";

type ReportView = "daily" | "history";

type LedgerDayGroup = {
  date: string;
  out: number;
  in: number;
  data: LedgerRow[];
};

function ledgerOutIn(row: LedgerRow): {
  give: number | null;
  receive: number | null;
} {
  const amt = Math.abs(row.amount);
  if (row.kind === "expense") return { give: amt, receive: null };
  if (row.kind === "income") return { give: null, receive: amt };
  if (row.kind === "transfer") {
    return row.amount < 0
      ? { give: amt, receive: null }
      : { give: null, receive: amt };
  }
  return { give: null, receive: null };
}

function ledgerNote(row: LedgerRow): string {
  const main = (row.partyName ?? row.category ?? row.account ?? "").trim();
  const note = (row.note ?? "").trim();
  if (main && note) return `${main} · ${note}`;
  return main || note;
}

export default function HistoryReportScreen() {
  const theme = useTheme();
  const { contentMaxWidth } = useResponsiveLayout();
  const [view, setView] = useState<ReportView>("daily");
  const [duration, setDuration] = useState<DurationKey>(DEFAULT_DURATION);
  const bounds = useMemo(() => durationBounds(duration), [duration]);

  return (
    <Screen scroll={false}>
      <View style={[styles.column, { maxWidth: contentMaxWidth }]}>
        <ScreenHeader
          title="Older Entries"
          right={
            <Pressable
              onPress={() =>
                feedback.toast({
                  message:
                    "Browse days by duration, or toggle to History for all detailed entries.",
                  tone: "info",
                })
              }
              accessibilityRole="button"
              accessibilityLabel="Help"
              hitSlop={8}
            >
              <CircleHelp size={22} color={theme.text} />
            </Pressable>
          }
        />

        <Card style={styles.rangeCard} pad={false}>
          <View style={styles.rangeRow}>
            <View style={styles.rangeCell}>
              <ThemedText type="small" themeColor="textSecondary">
                From
              </ThemedText>
              <ThemedText style={styles.rangeValue}>
                {bounds.from ? formatRangeDate(bounds.from) : "All time"}
              </ThemedText>
            </View>
            <View
              style={[styles.rangeDivider, { backgroundColor: theme.border }]}
            />
            <View style={styles.rangeCell}>
              <ThemedText type="small" themeColor="textSecondary">
                To
              </ThemedText>
              <ThemedText style={styles.rangeValue}>
                {bounds.to ? formatRangeDate(bounds.to) : "All time"}
              </ThemedText>
            </View>
          </View>
        </Card>

        <DurationPicker value={duration} onChange={setDuration} />

        <Segment
          options={[
            { key: "daily", label: "Daily Balances" },
            { key: "history", label: "Detailed History" },
          ]}
          value={view}
          onChange={(key) => setView(key as ReportView)}
        />

        {view === "daily" ? (
          <ReportDaily from={bounds.from} to={bounds.to} />
        ) : (
          <ReportHistory from={bounds.from} to={bounds.to} />
        )}
      </View>
    </Screen>
  );
}

function ReportDaily({ from, to }: { from?: string; to?: string }) {
  const theme = useTheme();
  const [days, setDays] = useState<DayLedgerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      setLoading(true);
      void listDaySummaries(from, to).then((rows) => {
        if (!mounted) return;
        setDays(runningCashInHand(rows));
        setLoading(false);
      });
      return () => {
        mounted = false;
      };
    }, [from, to]),
  );

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const data = await listLedgerRange(from, to);
      if (data.length === 0) {
        feedback.toast({
          message: "No transactions in this range.",
          tone: "info",
        });
        return;
      }
      const pdfBytes = await buildTransactionsPdf({
        dateFrom: from ?? "",
        dateTo: to ?? "",
        entries: data,
      });
      const rangeLabel =
        from && to ? `${from}-to-${to}` : (from ?? to ?? "all");
      await writeAndShareFile({
        filename: `dailykhata-transactions-${rangeLabel}.pdf`,
        content: pdfBytes,
        mimeType: "application/pdf",
        dialogTitle: "Save PDF",
      });
      feedback.toast({
        message: "Transactions PDF generated",
        tone: "success",
      });
    } catch (error) {
      feedback.toast({
        message: error instanceof Error ? error.message : String(error),
        tone: "error",
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <View style={styles.dailyRoot}>
      <View style={styles.dayHeader}>
        <ThemedText
          type="small"
          themeColor="textSecondary"
          style={styles.dayHeaderDate}
        >
          Date
        </ThemedText>
        <ThemedText
          type="small"
          themeColor="textSecondary"
          style={styles.dayHeaderCell}
        >
          Daily Balance
        </ThemedText>
        <ThemedText
          type="small"
          themeColor="textSecondary"
          style={styles.dayHeaderCell}
        >
          Cash in Hand
        </ThemedText>
        <View style={styles.dayHeaderChevron} />
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="small" color={theme.primary} />
        </View>
      ) : (
        <FlatList
          data={days}
          style={styles.dayList}
          keyExtractor={(item) => item.date}
          renderItem={({ item }) => {
            const dayBalance = item.income - item.expense;
            return (
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: "/history-day/[date]",
                    params: { date: item.date },
                  })
                }
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.dayCard,
                  { backgroundColor: theme.card, borderColor: theme.border },
                  pressed && styles.pressed,
                ]}
              >
                <ThemedText style={styles.dayTitle}>
                  {formatDayMonth(item.date)}
                </ThemedText>
                <View style={styles.dayCenter}>
                  <ThemedText
                    style={[
                      styles.dayAmount,
                      { color: dayBalance >= 0 ? theme.income : theme.expense },
                    ]}
                  >
                    {formatINR(dayBalance)}
                  </ThemedText>
                </View>
                <View style={styles.dayRight}>
                  <ThemedText style={[styles.dayAmount, { color: theme.text }]}>
                    {formatINR(item.cashInHand)}
                  </ThemedText>
                </View>
                <ChevronRight size={20} color={theme.textSecondary} />
              </Pressable>
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <EmptyState
              type="entries"
              title="No entries in this period"
              message="Try a different duration."
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      <LargeButton
        title={exporting ? "Generating…" : "Download"}
        icon={Download}
        onPress={handleExport}
        height={56}
        disabled={exporting}
        style={{ ...styles.download, backgroundColor: theme.info }}
      />
    </View>
  );
}

function ReportHistory({ from, to }: { from?: string; to?: string }) {
  const theme = useTheme();
  const [entries, setEntries] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      setLoading(true);
      listLedgerRange(from, to).then((data) => {
        if (!mounted) return;
        setEntries(data);
        setLoading(false);
      });
      return () => {
        mounted = false;
      };
    }, [from, to]),
  );

  const historyGroups = useMemo<LedgerDayGroup[]>(() => {
    const byDate = new Map<string, LedgerDayGroup>();
    for (const row of entries) {
      let group = byDate.get(row.date);
      if (!group) {
        group = { date: row.date, out: 0, in: 0, data: [] };
        byDate.set(row.date, group);
      }
      group.data.push(row);
      const { give, receive } = ledgerOutIn(row);
      if (give) group.out += give;
      if (receive) group.in += receive;
    }
    return Array.from(byDate.values());
  }, [entries]);

  const openHistoryEntry = useCallback((row: LedgerRow) => {
    const route = editRouteForLedgerRow(row);
    if (route) {
      router.push(route);
    }
  }, []);

  return (
    <View style={styles.historyWrap}>
      <View style={styles.columnHeaders}>
        <ThemedText
          type="small"
          themeColor="textSecondary"
          style={styles.columnHeaderTime}
        >
          Entries
        </ThemedText>
        <ThemedText
          type="small"
          themeColor="textSecondary"
          style={styles.columnHeaderGive}
        >
          Out
        </ThemedText>
        <ThemedText
          type="small"
          themeColor="textSecondary"
          style={styles.columnHeaderReceive}
        >
          In
        </ThemedText>
      </View>
      <SectionList
        sections={historyGroups}
        keyExtractor={(item, index) => `${item.kind}-${item.id}-${index}`}
        stickySectionHeadersEnabled={false}
        style={styles.historyList}
        contentContainerStyle={styles.historyContent}
        initialNumToRender={20}
        renderSectionHeader={({ section }) => (
          <CashDayHeader
            date={section.date}
            count={section.data.length}
            out={section.out}
            in={section.in}
          />
        )}
        renderItem={({ item }: { item: LedgerRow }) => (
          <HistoryEntryRow item={item} onPress={() => openHistoryEntry(item)} />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        SectionSeparatorComponent={() => (
          <View style={styles.sectionSeparator} />
        )}
        ListEmptyComponent={
          loading ? (
            <View style={styles.loading}>
              <ActivityIndicator size="small" color={theme.primary} />
            </View>
          ) : (
            <EmptyState
              type="entries"
              title="No entries found"
              message="No transactions match this duration."
            />
          )
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

function HistoryEntryRow({
  item,
  onPress,
}: {
  item: LedgerRow;
  onPress: () => void;
}) {
  const { give, receive } = ledgerOutIn(item);
  const route = editRouteForLedgerRow(item);
  return (
    <PartyDayEntryCard
      time={item.time}
      date={item.date}
      note={ledgerNote(item)}
      give={give}
      receive={receive}
      hasAttachments={item.hasAttachments}
      onPress={route ? onPress : undefined}
    />
  );
}

function CashDayHeader({
  date,
  count,
  out,
  in: inTotal,
}: {
  date: string;
  count: number;
  out: number;
  in: number;
}) {
  const theme = useTheme();
  return (
    <View style={styles.dayGroupHeader}>
      <View style={styles.dayHeaderLeft}>
        <ThemedText type="smallBold">{formatISOToDisplay(date)}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {count} {count === 1 ? "entry" : "entries"}
        </ThemedText>
      </View>
      <View style={styles.dayHeaderTotals}>
        {out > 0 ? (
          <ThemedText type="smallBold" style={{ color: theme.expense }}>
            {formatINR(out)}
          </ThemedText>
        ) : null}
        {inTotal > 0 ? (
          <ThemedText type="smallBold" style={{ color: theme.income }}>
            {formatINR(inTotal)}
          </ThemedText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  column: {
    flex: 1,
    width: "100%",
    alignSelf: "center",
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    gap: Spacing.three,
  },
  dailyRoot: {
    flex: 1,
  },
  rangeCard: {
    overflow: "hidden",
  },
  rangeRow: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  rangeCell: {
    flex: 1,
    alignItems: "center",
    gap: Spacing.half,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
  },
  rangeDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    marginVertical: Spacing.two,
  },
  rangeValue: {
    fontFamily: InterFonts.semibold,
    fontSize: 15,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  dayList: {
    flex: 1,
  },
  listContent: {
    paddingVertical: Spacing.one,
  },
  separator: {
    height: Spacing.two,
  },
  dayCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.card,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  pressed: {
    opacity: 0.7,
  },
  dayTitle: {
    fontFamily: InterFonts.bold,
    fontSize: 16,
    minWidth: 64,
  },
  dayCenter: {
    flex: 1,
    alignItems: "center",
    gap: Spacing.half,
  },
  dayRight: {
    flex: 1,
    alignItems: "center",
    gap: Spacing.half,
  },
  dayAmount: {
    fontFamily: InterFonts.semibold,
    fontSize: 15,
  },
  dayHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.half,
  },
  dayHeaderDate: {
    minWidth: 64,
    fontSize: 12,
    textTransform: "uppercase",
    fontFamily: InterFonts.semibold,
  },
  dayHeaderCell: {
    flex: 1,
    textAlign: "center",
    fontSize: 12,
    textTransform: "uppercase",
    fontFamily: InterFonts.semibold,
  },
  dayHeaderChevron: {
    width: 20,
  },
  download: {
    marginTop: Spacing.three,
    marginBottom: Spacing.three,
  },
  historyWrap: {
    flex: 1,
    gap: Spacing.two,
  },
  columnHeaders: {
    flexDirection: "row",
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    gap: Spacing.two,
  },
  columnHeaderTime: {
    flex: 2,
    textAlign: "left",
  },
  columnHeaderGive: {
    flex: 1,
    textAlign: "center",
  },
  columnHeaderReceive: {
    flex: 1,
    textAlign: "right",
  },
  historyList: {
    flex: 1,
  },
  historyContent: {
    paddingBottom: Spacing.four,
  },
  dayGroupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    gap: Spacing.two,
  },
  dayHeaderLeft: {
    flex: 1,
    gap: 2,
  },
  dayHeaderTotals: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  sectionSeparator: {
    height: Spacing.two,
  },
});
