/**
 * Customer / Supplier ledger — Cashbook-style.
 *
 * Top: back + edit header, a centered balance summary card, and pill-style
 * Remind / Share PDF buttons. Body: the khata history grouped by date, each day
 * behind a plain header (Date + entry count on the left; "Out" / "In" totals on
 * the right) with 3-column Out | In entry cards that mirror the Cashbook
 * exactly. Bottom: sticky Out / In action buttons.
 */
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  Bell,
  ChevronLeft,
  FileText,
  MessageCircle,
  MessageSquare,
  Pencil,
  Phone,
} from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, SectionList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { ExportOptionsSheet } from '@/components/export-options-sheet';
import { FitText } from '@/components/fit-text';
import { feedback } from '@/components/feedback';
import { LargeButton } from '@/components/large-button';
import { PartyDayEntryCard } from '@/components/party-day-entry-card';
import { ThemedText } from '@/components/themed-text';
import { EXPORT_OPTIONS } from '@/constants/export-options';
import { InterFonts, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useParty } from '@/hooks/use-party';
import { useTheme } from '@/hooks/use-theme';
import type { PartyAction, PartyTransaction } from '@/types';
import { partyBalanceColor, partyBalanceLabel } from '@/utils/balance';
import { formatINR, formatISOToDisplay } from '@/utils/format';
import { buildPartyStatementPdf } from '@/utils/pdf';
import { buildReminderMessage, openSms, openWhatsApp } from '@/utils/remind';
import { writeAndShareFile } from '@/utils/share';
import { DEFAULT_INCLUDE, type StatementInclude } from '@/utils/statement';

/** One date group: the day's entries (newest first) + give/receive totals. */
type DayGroup = {
  date: string;
  give: number;
  receive: number;
  entries: PartyTransaction[];
};

export default function PartyDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const partyId = Number(id);
  const { party, balance, ledger, hasMore, loadingMore, refresh, loadMore } = useParty(partyId);
  const [sharing, setSharing] = useState(false);
  const [exportOptionsOpen, setExportOptionsOpen] = useState(false);
  const [includeOptions, setIncludeOptions] = useState<StatementInclude>(DEFAULT_INCLUDE);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const partyType = party?.type;

  /** Stable row handler — Opening Balance entries are immutable. */
  const openEntry = useCallback(
    (entry: PartyTransaction) => {
      if (entry.kind === 'opening' || !partyType) {
        return;
      }
      router.push({
        pathname: '/party/entry',
        params: { id: partyId, type: partyType, editId: entry.id },
      });
    },
    [partyId, partyType]
  );

  /** Groups the (already newest-first) ledger by date, totalling Give/Receive. */
  const groups = useMemo<DayGroup[]>(() => {
    const byDate = new Map<string, DayGroup>();
    for (const entry of ledger) {
      let group = byDate.get(entry.date);
      if (!group) {
        group = { date: entry.date, give: 0, receive: 0, entries: [] };
        byDate.set(entry.date, group);
      }
      group.entries.push(entry);
      if (entry.direction === 'out') {
        group.give += entry.amount;
      } else {
        group.receive += entry.amount;
      }
    }
    return Array.from(byDate.values());
  }, [ledger]);

  if (!party) {
    return null;
  }

  const isCustomer = party.type === 'customer';

  const remind = () => {
    if (!party.phone) {
      feedback.alert({
        title: 'No phone number',
        message: 'Add a phone number in Edit to send reminders.',
        tone: 'info',
      });
      return;
    }
    if (balance === 0) {
      feedback.alert({
        title: 'Khata settled',
        message: 'There is nothing due for this party right now.',
        tone: 'success',
      });
      return;
    }
    const message = buildReminderMessage(party.name, party.type, balance);
    feedback.sheet({
      title: 'Send reminder',
      message,
      options: [
        {
          label: 'WhatsApp',
          icon: MessageCircle,
          onPress: () => openWhatsApp(party.phone, message),
        },
        { label: 'SMS', icon: MessageSquare, onPress: () => openSms(party.phone, message) },
      ],
    });
  };

  const sharePdf = async (include: StatementInclude) => {
    if (sharing) {
      return;
    }
    setSharing(true);
    try {
      const pdf = await buildPartyStatementPdf({
        name: party.name,
        phone: party.phone ?? '',
        type: party.type,
        ledger,
        include,
      });
      const safeName = party.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'party';
      await writeAndShareFile({
        filename: `dailykhata-${safeName}-statement.pdf`,
        content: pdf,
        mimeType: 'application/pdf',
        dialogTitle: 'Share khata statement',
      });
    } finally {
      setSharing(false);
    }
  };

  const handleSharePdf = () => {
    // Show Export Options first so the user can choose what goes in the PDF.
    setExportOptionsOpen(true);
  };

  const handleExportOptionsConfirm = () => {
    setExportOptionsOpen(false);
    void sharePdf(includeOptions);
  };

  const toggleExportOption = (key: keyof StatementInclude) => {
    setIncludeOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const balanceColor = partyBalanceColor(party.type, balance, theme);
  const balanceLabel = partyBalanceLabel(party.type, balance);

  // Red = money out/credit, Green = money in/advance. The same four khata
  // verbs power both customer and supplier.
  const bottomActions: { action: PartyAction; label: string; expense: boolean }[] = isCustomer
    ? [
        { action: 'give', label: 'Out', expense: true },
        { action: 'receive', label: 'In', expense: false },
      ]
    : [
        { action: 'pay', label: 'Pay', expense: true },
        { action: 'take', label: 'Take', expense: false },
      ];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={8}
            style={[styles.headerButton, { backgroundColor: theme.backgroundElement }]}>
            <ChevronLeft size={24} color={theme.text} />
          </Pressable>
          <Pressable
            onPress={() => router.push({ pathname: '/party/edit', params: { id: partyId } })}
            accessibilityRole="button"
            accessibilityLabel="Edit party details"
            hitSlop={8}
            style={[styles.headerButton, { backgroundColor: theme.backgroundElement }]}>
            <Pencil size={20} color={theme.text} />
          </Pressable>
        </View>

        {/* Summary card — name, phone, centered balance. */}
        <Card style={styles.summaryCard}>
          <ThemedText type="subtitle" style={styles.name} numberOfLines={1}>
            {party.name}
          </ThemedText>
          {party.phone ? (
            <View style={styles.phoneRow}>
              <Phone size={14} color={theme.textSecondary} />
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {party.phone}
              </ThemedText>
            </View>
          ) : null}
          <ThemedText type="small" themeColor="textSecondary" style={styles.balanceLabel}>
            {balanceLabel}
          </ThemedText>
          <FitText
            fontSize={34}
            style={[styles.balanceAmount, { color: balanceColor }]}>
            {formatINR(Math.abs(balance))}
          </FitText>
        </Card>

        {/* Secondary actions — Remind + Share PDF as card-colored pills. */}
        <View style={styles.tools}>
          <Button
            variant="outline"
            onPress={remind}
            style={styles.toolButton}
          >
            <View style={styles.toolButtonContent}>
              <Bell size={20} color={theme.text} strokeWidth={2.4} />
              <ThemedText style={styles.toolButtonLabel}>Remind</ThemedText>
            </View>
          </Button>
          <Button
            variant="outline"
            onPress={handleSharePdf}
            disabled={sharing}
            style={styles.toolButton}
          >
            <View style={styles.toolButtonContent}>
              <FileText size={20} color={theme.text} strokeWidth={2.4} />
              <ThemedText style={styles.toolButtonLabel}>Share PDF</ThemedText>
            </View>
          </Button>
        </View>

        {/* Column headers — identify Entries / Out / In columns in the ledger below. */}
        <View style={styles.columnHeaders}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.columnHeaderTime}>
            Entries
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.columnHeaderGive}>
            Out
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.columnHeaderReceive}>
            In
          </ThemedText>
        </View>

        {/* Grouped ledger — daily headers above 3-column entry cards. */}
        <SectionList
          sections={groups.map((group) => ({
            date: group.date,
            data: group.entries,
          }))}
          keyExtractor={(item) => String(item.id)}
          stickySectionHeadersEnabled={false}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={7}
          renderSectionHeader={({ section }) => (
            <DayHeaderRow date={section.date} />
          )}
          renderItem={({ item }) => {
            const isOpening = item.kind === 'opening';
            return (
              <PartyDayEntryCard
                time={item.time}
                note={isOpening ? 'Opening Balance' : item.note}
                give={item.direction === 'out' ? item.amount : null}
                receive={item.direction === 'in' ? item.amount : null}
                hasAttachments={item.hasAttachments}
                onPress={isOpening ? undefined : () => openEntry(item)}
              />
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          SectionSeparatorComponent={() => <View style={styles.sectionSeparator} />}
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
              title="No entries yet"
              message="Use the buttons below to record money in or out."
            />
          }
          showsVerticalScrollIndicator={false}
        />

        {/* Sticky bottom bar — pinned below the scrolling ledger. */}
        <View style={styles.actions}>
          {bottomActions.map(({ action, label, expense }) => (
            <LargeButton
              key={action}
              title={label}
              variant={expense ? 'expense' : 'income'}
              onPress={() =>
                router.push({
                  pathname: '/party/entry',
                  params: { id: partyId, type: party.type, action },
                })
              }
              height={56}
              style={styles.actionButton}
            />
          ))}
        </View>
      </View>

      {/* Export Options sheet — shown before sharing the statement PDF */}
      {exportOptionsOpen && (
        <ExportOptionsSheet<keyof StatementInclude>
          visible
          options={EXPORT_OPTIONS}
          selected={includeOptions}
          onToggle={toggleExportOption}
          onCancel={() => setExportOptionsOpen(false)}
          onConfirm={handleExportOptionsConfirm}
        />
      )}
    </SafeAreaView>
  );
}

/** Plain (no card) daily header: Date only. */
function DayHeaderRow({
  date,
}: {
  date: string;
}) {
  return (
    <View style={styles.dayHeader}>
      <View style={styles.dayHeaderDate}>
        <ThemedText style={styles.dayHeaderTitle}>{formatISOToDisplay(date)}</ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  container: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.two,
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: Radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryCard: {
    alignItems: 'center',
    gap: Spacing.two,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  name: {
    fontSize: 24,
    lineHeight: 30,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  balanceLabel: {
    textAlign: 'center',
    marginTop: Spacing.one,
  },
  balanceAmount: {
    fontFamily: InterFonts.bold,
    fontSize: 34,
    textAlign: 'center',
  },
  tools: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.three,
    marginBottom: Spacing.two,
  },
  toolButton: {
    flex: 1,
  },
  toolButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  toolButtonLabel: {
    fontFamily: InterFonts.semibold,
    fontSize: 15,
    lineHeight: 20,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: Spacing.two,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.half,
    paddingBottom: Spacing.half,
    gap: Spacing.two,
  },
  dayHeaderDate: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.half,
  },
  dayHeaderTitle: {
    fontFamily: InterFonts.semibold,
    fontSize: 14,
  },
  columnHeaders: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    gap: Spacing.two,
  },
  columnHeaderTime: {
    flex: 2,
    alignItems: 'flex-start',
  },
  columnHeaderGive: {
    flex: 1,
    alignItems: 'center',
  },
  columnHeaderReceive: {
    flex: 0.25,
    alignItems: 'flex-end',
  },
  separator: {
    height: Spacing.one,
  },
  sectionSeparator: {
    height: Spacing.one,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.one,
  },
  actionButton: {
    flex: 1,
  },
  listFooter: {
    paddingVertical: Spacing.three,
  },
});
