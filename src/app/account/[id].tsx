/** Single account: balance, rename/delete, and its full history. */
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, Pencil, ReceiptText, Trash2 } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/card';
import { feedback } from '@/components/feedback';
import { EmptyState } from '@/components/empty-state';
import { LargeButton } from '@/components/large-button';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { TransactionItem } from '@/components/transaction-item';
import { Spacing } from '@/constants/theme';
import { useAccount } from '@/hooks/use-account';
import { useAccounts } from '@/hooks/use-accounts';
import { useTheme } from '@/hooks/use-theme';
import type { LedgerRow } from '@/types';
import { confirmDelete } from '@/utils/confirm';
import { formatINR } from '@/utils/format';

const TYPE_LABELS = { cash: 'Cash', bank: 'Bank', wallet: 'Wallet' } as const;

export default function AccountDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const accountId = Number(id);

  const { account, ledger, hasMore, loadMore, loadingMore, refresh, removeEntry } = useAccount(
    accountId
  );
  const { rename, remove } = useAccounts();

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const handleRemoveEntry = useCallback(
    (rowId: number) => {
      const row = ledger.find((r) => r.id === rowId);
      if (!row) {
        return;
      }
      // Opening Balance entries are immutable — never deletable from the ledger.
      if (row.entryKind === 'opening') {
        feedback.alert({
          title: 'Opening Balance',
          message: 'The opening balance entry cannot be deleted.',
          tone: 'info',
        });
        return;
      }
      confirmDelete('Delete entry?', 'This cannot be undone.', () => void removeEntry(row));
    },
    [ledger, removeEntry]
  );

  /** Stable row handler so memoized list rows skip re-renders. */
  const handleRemoveRow = useCallback(
    (row: LedgerRow) => handleRemoveEntry(row.id),
    [handleRemoveEntry]
  );

  if (!account) {
    return (
      <Screen>
        <ThemedText type="subtitle">Account</ThemedText>
        <EmptyState title="Account not found" message="It may have been deleted." />
      </Screen>
    );
  }

  const handleRename = async () => {
    const name = editName.trim();
    if (!name) {
      return;
    }
    await rename(accountId, name);
    setEditing(false);
  };

  const handleDelete = () => {
    confirmDelete('Delete account?', 'This cannot be undone.', async () => {
      const ok = await remove(accountId);
      if (!ok) {
        feedback.alert({
          title: "Can't delete",
          message: 'This account has entries (income, expense or transfers). Delete those first.',
          tone: 'danger',
        });
        return;
      }
      router.back();
    });
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.back}>
          <ChevronLeft size={28} color={theme.text} />
        </Pressable>
        <ThemedText type="subtitle" numberOfLines={1} style={styles.title}>
          {account.name}
        </ThemedText>
      </View>

      <Card>
        <ThemedText type="small" themeColor="textSecondary">
          {TYPE_LABELS[account.type]}
        </ThemedText>
        <Text style={[styles.balance, { color: account.balance < 0 ? theme.expense : theme.primary }]} numberOfLines={1} ellipsizeMode="tail">
          {formatINR(account.balance)}
        </Text>
        <View style={styles.actions}>
          <LargeButton
            title="Rename"
            variant="outline"
            icon={Pencil}
            onPress={() => {
              setEditName(account.name);
              setEditing(true);
            }}
            style={styles.actionButton}
          />
          <LargeButton
            title="Delete"
            variant="expense"
            icon={Trash2}
            onPress={handleDelete}
            style={styles.actionButton}
          />
        </View>
      </Card>

      {editing && (
        <Card>
          <TextField
            label="Account name"
            value={editName}
            onChangeText={setEditName}
            accessibilityLabel="Account name"
            autoFocus
          />
          <LargeButton title="Save name" onPress={handleRename} />
          <LargeButton title="Cancel" variant="outline" onPress={() => setEditing(false)} />
        </Card>
      )}

      <ThemedText type="smallBold" themeColor="textSecondary">
        History
      </ThemedText>

      {ledger.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title="No entries yet"
          message="Income, expense and transfers to this account will appear here."
        />
      ) : (
        <Card pad={false}>
          {ledger.map((row) => (
            <TransactionItem key={row.id} item={row} onLongPress={handleRemoveRow} />
          ))}
        </Card>
      )}

      {hasMore ? (
        <LargeButton
          title={loadingMore ? 'Loading…' : 'Load more'}
          icon={ReceiptText}
          onPress={() => void loadMore()}
          variant="outline"
          height={56}
          disabled={loadingMore}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  back: {
    paddingVertical: Spacing.one,
    paddingRight: Spacing.two,
  },
  title: {
    flex: 1,
  },
  balance: {
    fontFamily: 'Inter_700Bold',
    fontSize: 40,
    marginTop: Spacing.one,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.three,
  },
  actionButton: {
    flex: 1,
  },
});
