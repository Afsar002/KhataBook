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
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { feedback } from '@/components/feedback';
import { LargeButton } from '@/components/large-button';
import { PartyTransactionItem } from '@/components/party-transaction-item';
import { ThemedText } from '@/components/themed-text';
import { InterFonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { deleteParty } from '@/db/party-repo';
import { useParty } from '@/hooks/use-party';
import { useTheme } from '@/hooks/use-theme';
import type { PartyAction, PartyTransaction } from '@/types';
import { confirmDelete } from '@/utils/confirm';
import { formatINR } from '@/utils/format';
import {
  actionForDirection,
  entryIncreasesBalance,
  PARTY_ACTIONS,
  partyBalanceLabel,
} from '@/utils/party';
import { buildPartyStatementPdf } from '@/utils/pdf';
import { buildReminderMessage, openSms, openWhatsApp } from '@/utils/remind';
import { writeAndShareFile } from '@/utils/share';

export default function PartyDetailScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const partyId = Number(id);
  const { party, balance, ledger, hasMore, loadingMore, refresh, loadMore } = useParty(partyId);
  const [sharing, setSharing] = useState(false);

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

  if (!party) {
    return null;
  }

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

  const sharePdf = async () => {
    if (sharing) {
      return;
    }
    setSharing(true);
    try {
      const pdf = await buildPartyStatementPdf({
        name: party.name,
        phone: party.phone,
        type: party.type,
        openingBalance: party.openingBalance,
        balance,
        ledger,
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

  const isCustomer = party.type === 'customer';
  const receivable = balance >= 0 ? isCustomer : !isCustomer;
  const balanceColor =
    balance === 0 ? theme.textSecondary : receivable ? theme.income : theme.expense;

  const actionKeys: PartyAction[] = isCustomer ? ['give', 'receive'] : ['take', 'pay'];

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
            onPress={() =>
              router.push({ pathname: '/party/edit', params: { id: partyId } })
            }
            accessibilityRole="button"
            accessibilityLabel="Edit party details"
            hitSlop={8}
            style={[styles.headerButton, { backgroundColor: theme.backgroundElement }]}>
            <Pencil size={20} color={theme.text} />
          </Pressable>
        </View>

        <Card style={styles.balanceCard}>
          <ThemedText type="subtitle" style={styles.name}>
            {party.name}
          </ThemedText>
          {party.phone ? (
            <View style={styles.phoneRow}>
              <Phone size={14} color={theme.textSecondary} />
              <ThemedText type="small" themeColor="textSecondary">
                {party.phone}
              </ThemedText>
            </View>
          ) : null}
          <ThemedText type="small" themeColor="textSecondary">
            {partyBalanceLabel(party.type, balance)}
          </ThemedText>
          <Text style={[styles.balanceAmount, { color: balanceColor }]} numberOfLines={1} ellipsizeMode="tail">
            {formatINR(Math.abs(balance))}
          </Text>
        </Card>

        <View style={styles.actions}>
          {actionKeys.map((key) => (
            <LargeButton
              key={key}
              title={PARTY_ACTIONS[key].title}
              subtitle={PARTY_ACTIONS[key].hint}
              variant={isCustomer ? 'income' : 'expense'}
              icon={PARTY_ACTIONS[key].icon}
              onPress={() =>
                router.push({
                  pathname: '/party/entry',
                  params: { id: partyId, type: party.type, action: key },
                })
              }
              height={68}
              style={styles.actionButton}
            />
          ))}
        </View>

        <View style={styles.tools}>
          <LargeButton
            title="Remind"
            variant="outline"
            icon={Bell}
            onPress={remind}
            disabled={balance === 0}
            height={56}
            style={styles.toolButton}
          />
          <LargeButton
            title="Share PDF"
            variant="outline"
            icon={FileText}
            onPress={sharePdf}
            height={56}
            style={styles.toolButton}
          />
        </View>

        <ThemedText type="smallBold" style={styles.ledgerTitle}>
          Ledger
        </ThemedText>

        <Card pad={false}>
          <FlatList
            data={ledger}
            keyExtractor={(item) => String(item.id)}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            initialNumToRender={12}
            maxToRenderPerBatch={12}
            windowSize={7}
            ItemSeparatorComponent={() => (
              <View style={[styles.separator, { backgroundColor: theme.border }]} />
            )}
            renderItem={({ item }) => {
              const isOpening = item.kind === 'opening';
              const actionLabel = isOpening
                ? 'Opening Balance'
                : PARTY_ACTIONS[actionForDirection(party.type, item.direction)].title;

              return (
                <PartyTransactionItem
                  item={item}
                  actionLabel={actionLabel}
                  increases={entryIncreasesBalance(party.type, item.direction)}
                  onPress={openEntry}
                />
              );
            }}
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
              <Card>
                <EmptyState
                  type="entries"
                  title="No entries yet"
                  message="Tap Give or Receive money to start this khata."
                />
              </Card>
            }
          />
        </Card>

        <LargeButton
          title={`Delete ${isCustomer ? 'Customer' : 'Supplier'}`}
          variant="outline"
          onPress={() =>
            confirmDelete(
              `Delete ${party.name}?`,
              'This will also delete all its khata entries.',
              () => {
                void deleteParty(partyId);
                router.back();
              }
            )
          }
        />
        <View style={{ height: insets.bottom }} />
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
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  balanceCard: {
    gap: Spacing.one,
  },
  name: {
    fontSize: 28,
    lineHeight: 34,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  balanceAmount: {
    fontFamily: InterFonts.bold,
    fontSize: 40,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  actionButton: {
    flex: 1,
  },
  tools: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.three,
  },
  toolButton: {
    flex: 1,
  },
  ledgerTitle: {
    paddingTop: Spacing.two,
  },
  listContent: {
    paddingTop: Spacing.one,
    paddingBottom: Spacing.two,
  },
  separator: {
    height: 1,
    marginVertical: Spacing.one,
  },
  listFooter: {
    paddingVertical: Spacing.four,
  },
});
