/** Form for moving money from one account to another (a transfer). */
import { router } from 'expo-router';
import { ArrowRight, Trash2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AccountPicker } from '@/components/account-picker';
import { AmountInput } from '@/components/amount-input';
import { Card } from '@/components/card';
import { DatePicker } from '@/components/date-picker';
import { LargeButton } from '@/components/large-button';
import { ScreenHeader } from '@/components/screen-header';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAccounts } from '@/hooks/use-accounts';
import { useTransfers } from '@/hooks/use-transfers';
import { useTheme } from '@/hooks/use-theme';
import { getTransfer } from '@/db/transfer-repo';
import { accountWouldOverdraft } from '@/utils/account-balance';
import { confirmDelete } from '@/utils/confirm';
import { formatINR, todayISODate } from '@/utils/format';

type TransferFormProps = {
  /** When set, loads this transfer for editing instead of creating a new one. */
  editingId?: number;
};

export function TransferForm({ editingId }: TransferFormProps) {
  const theme = useTheme();
  const { accounts, balances } = useAccounts();
  const { add, remove, update } = useTransfers();

  const [fromId, setFromId] = useState<number | null>(null);
  const [toId, setToId] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  // Original transfer in edit mode — the source account's current balance
  // already includes it, so the overdraft projection adds it back when the
  // source is unchanged.
  const [originalFromId, setOriginalFromId] = useState<number | null>(null);
  const [originalAmount, setOriginalAmount] = useState<number | null>(null);
  // Date state - defaults to today for new entries, preserves original for edit
  const [date, setDate] = useState(todayISODate());
  const [loading, setLoading] = useState(Boolean(editingId));

  // In edit mode, prefill the form from the existing transfer.
  useEffect(() => {
    if (!editingId) {
      return;
    }
    let mounted = true;
    getTransfer(editingId)
      .then((row) => {
        if (!mounted) {
          return;
        }
        if (!row) {
          router.back();
          return;
        }
        setFromId(row.fromAccountId);
        setToId(row.toAccountId);
        setOriginalFromId(row.fromAccountId);
        setOriginalAmount(row.amount);
        setAmount(String(row.amount));
        setNote(row.note);
        setDate(row.date);
        setLoading(false);
      })
      .catch(() => {
        if (mounted) {
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, [editingId]);

  useEffect(() => {
    if (accounts.length === 0) {
      return;
    }
    setFromId((current) => current ?? accounts[0].id);
    setToId((current) => current ?? accounts[1]?.id ?? null);
  }, [accounts]);

  const numeric = parseFloat(amount);
  const sameAccount = fromId !== null && fromId === toId;
  // A transfer can never overdraft the source account — you can't move money
  // you don't have. In edit mode the current balance already includes the old
  // transfer, so add it back first when the source is unchanged.
  const revert =
    editingId && originalFromId === fromId && originalAmount !== null
      ? { flow: 'out' as const, amount: originalAmount }
      : null;
  const overdraft =
    fromId !== null && accountWouldOverdraft(balances, fromId, 'out', numeric, revert);
  const sourceAccount = fromId !== null ? balances.find((b) => b.id === fromId) : undefined;
  const available = (sourceAccount?.balance ?? 0) + (revert ? revert.amount : 0);
  const canSave =
    accounts.length >= 2 &&
    fromId !== null &&
    toId !== null &&
    !sameAccount &&
    numeric > 0 &&
    !overdraft &&
    !saving;

  const save = async (amountToTransfer: number) => {
    if (fromId === null || toId === null) {
      return;
    }
    setSaving(true);
    try {
      const input = {
        fromAccountId: fromId,
        toAccountId: toId,
        amount: amountToTransfer,
        note: note.trim(),
        date,
      };
      if (editingId) {
        await update(editingId, input);
      } else {
        await add(input);
      }
      router.back();
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    // `canSave` already excludes overdraft transfers, so this is a defensive
    // guard rather than the block itself.
    if (!canSave || fromId === null || toId === null) {
      return;
    }
    await save(numeric);
  };

  const handleDelete = async () => {
    if (!editingId) {
      return;
    }
    setSaving(true);
    try {
      await remove(editingId);
      router.back();
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <ActivityIndicator style={styles.loading} color={theme.textSecondary} />;
  }

  if (accounts.length < 2) {
    return (
      <View style={styles.wrap}>
        <ScreenHeader title={editingId ? 'Edit Transfer' : 'Transfer'} />
        <Card>
          <ThemedText>
            You need at least two accounts to move money between them. Add another account first.
          </ThemedText>
        </Card>
        <LargeButton
          title="Add Account"
          onPress={() => router.push('/account/new')}
        />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <ScreenHeader title={editingId ? 'Edit Transfer' : 'Transfer'} />

      <Card>
        <ThemedText type="small" themeColor="textSecondary" style={styles.fieldLabel}>
          From
        </ThemedText>
        <AccountPicker accounts={accounts} selectedId={fromId} onSelect={setFromId} />
      </Card>

      <Card>
        <ThemedText type="small" themeColor="textSecondary" style={styles.fieldLabel}>
          To
        </ThemedText>
        <AccountPicker accounts={accounts} selectedId={toId} onSelect={setToId} />
      </Card>

      {sameAccount ? (
        <ThemedText type="smallBold" themeColor="expense">
          From and To must be different accounts.
        </ThemedText>
      ) : null}

      <Card>
        <ThemedText type="small" themeColor="textSecondary" style={styles.fieldLabel}>
          Amount
        </ThemedText>
        <AmountInput value={amount} onChangeText={setAmount} />
      </Card>

      {overdraft && sourceAccount ? (
        <ThemedText type="smallBold" themeColor="expense">
          You can&apos;t transfer more than the {sourceAccount.name} balance ({formatINR(available)}).
        </ThemedText>
      ) : null}
<Card>
        <TextField
          label="Note (optional)"
          value={note}
          onChangeText={setNote}
          placeholder="e.g. Put into savings"
          accessibilityLabel="Note"
        />
      </Card>
      <Card>
        <DatePicker
          label="Date"
          value={date}
          onChange={setDate}
          maxDate={todayISODate()}
          accessibilityLabel="Transfer date"
        />
      </Card>

      

      {editingId ? (
        <>
          <LargeButton
            title="Save Changes"
            icon={ArrowRight}
            onPress={handleSave}
            disabled={!canSave}
          />
          <LargeButton
            title="Delete Transfer"
            variant="danger"
            icon={Trash2}
            onPress={() =>
              confirmDelete('Delete transfer?', 'This cannot be undone.', () =>
                void handleDelete()
              )
            }
          />
        </>
      ) : (
        <>
          <LargeButton title="Save Transfer" icon={ArrowRight} onPress={handleSave} disabled={!canSave} />
          <LargeButton title="Cancel" variant="outline" onPress={() => router.back()} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.three,
  },
  fieldLabel: {
    marginBottom: Spacing.two,
  },
  loading: {
    marginTop: Spacing.six,
    alignSelf: 'center',
  },
});
