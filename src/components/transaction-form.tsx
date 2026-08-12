/** Shared form for recording an expense or income entry. */
import { router } from 'expo-router';
import { Trash2, TrendingDown, TrendingUp } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AccountPicker } from '@/components/account-picker';
import { CalculatorInput } from '@/components/calculator-input';
import { Card } from '@/components/card';
import { CategoryPicker } from '@/components/category-picker';
import { DatePicker } from '@/components/date-picker';
import { feedback } from '@/components/feedback';
import { LargeButton } from '@/components/large-button';
import { NoteField } from '@/components/note-field';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useAccounts } from '@/hooks/use-accounts';
import { useCategories } from '@/hooks/use-categories';
import { useTheme } from '@/hooks/use-theme';
import {
  addTransaction,
  deleteTransaction,
  getTransaction,
  updateTransaction,
} from '@/db/transaction-repo';
import type { AttachmentMeta, TransactionType } from '@/types';
import {
  accountProjectedBalance,
  accountWouldOverdraft,
  buildOverdraftMessage,
  type LedgerFlow,
} from '@/utils/account-balance';
import { removeAttachmentFiles } from '@/utils/attachments';
import { confirmDelete } from '@/utils/confirm';
import { todayISODate } from '@/utils/format';

type TransactionFormProps = {
  type: TransactionType;
  /** When set, loads this transaction for editing instead of recording a new one. */
  editingId?: number;
  /** Pre-fills the date for new entries (e.g. opening a form for a past day). */
  defaultDate?: string;
};

export function TransactionForm({ type, editingId, defaultDate }: TransactionFormProps) {
  const theme = useTheme();
  const isIncome = type === 'income';

  const { accounts, balances } = useAccounts();
  const { categories } = useCategories(type);

  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [attachments, setAttachments] = useState<AttachmentMeta[]>([]);
  const [saving, setSaving] = useState(false);
  // Original amount in edit mode — the current account balance already includes
  // it, so the overdraft projection must add it back before applying the change.
  const [originalAmount, setOriginalAmount] = useState<number | null>(null);
  // Date state - defaults to `defaultDate` (or today) for new entries,
  // preserves the original date in edit mode (the load effect overwrites it).
  const [date, setDate] = useState(defaultDate ?? todayISODate());
  const [loading, setLoading] = useState(Boolean(editingId));

  // In edit mode, prefill the form from the existing transaction.
  useEffect(() => {
    if (!editingId) {
      return;
    }
    let mounted = true;
    getTransaction(editingId)
      .then((row) => {
        if (!mounted) {
          return;
        }
        if (!row) {
          router.back();
          return;
        }
        // Opening Balance entries are immutable — editing goes through the
        // account's dedicated opening-balance workflow, never this form.
        if (row.kind === 'opening') {
          router.back();
          return;
        }
        setAmount(String(row.amount));
        setOriginalAmount(row.amount);
        setAccountId(row.accountId);
        setCategoryId(row.categoryId);
        setNote(row.note);
        setDate(row.date);
        setAttachments(row.attachments ?? []);
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
    if (accountId === null && accounts.length > 0) {
      setAccountId(accounts[0].id);
    }
  }, [accounts, accountId]);

  useEffect(() => {
    if (categoryId === null && categories.length > 0) {
      setCategoryId(categories[0].id);
    }
  }, [categories, categoryId]);

  const accent = isIncome ? theme.income : theme.expense;
  const Icon = isIncome ? TrendingUp : TrendingDown;
  const title = editingId
    ? `Edit ${isIncome ? 'Deposit' : 'Withdraw'}`
    : `Add ${isIncome ? 'Deposit' : 'Withdraw'}`;

  const canSave = amount !== '' && parseFloat(amount) > 0 && accountId !== null && categoryId !== null && !saving;

  const save = async (numeric: number) => {
    if (accountId === null) {
      return;
    }
    setSaving(true);
    try {
      const input = {
        type,
        amount: numeric,
        accountId,
        categoryId,
        note: note.trim(),
        date,
        attachments,
      };
      if (editingId) {
        await updateTransaction(editingId, input);
      } else {
        await addTransaction(input);
      }

      router.back();
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    const numeric = parseFloat(amount);
    if (!(numeric > 0) || accountId === null || categoryId === null) {
      return;
    }
    const flow: LedgerFlow = type === 'expense' ? 'out' : 'in';
    const revert = editingId && originalAmount !== null ? { flow, amount: originalAmount } : null;
    if (accountWouldOverdraft(balances, accountId, flow, numeric, revert)) {
      const account = balances.find((b) => b.id === accountId);
      feedback.confirm({
        title: 'Balance will go negative',
        message: buildOverdraftMessage(
          account?.name ?? 'account',
          numeric,
          flow,
          account?.balance ?? 0,
          accountProjectedBalance(balances, accountId, flow, numeric, revert) ?? 0
        ),
        danger: true,
        confirmLabel: 'Save anyway',
        onConfirm: () => void save(numeric),
      });
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
      await deleteTransaction(editingId);
      // Best-effort cleanup of the stored files — a stale file is harmless.
      await removeAttachmentFiles(attachments);
      router.back();
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <ActivityIndicator style={styles.loading} color={theme.textSecondary} />;
  }

  return (
    <View style={styles.wrap}>
      <ScreenHeader
        title={title}
        leading={
          <View style={[styles.headerIcon, { backgroundColor: isIncome ? theme.incomeSoft : theme.expenseSoft }]}>
            <Icon size={28} color={accent} />
          </View>
        }
      />

      <Card style={styles.card}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          Amount
        </ThemedText>
        <CalculatorInput
          onChangeAmount={(value) => setAmount(String(value))}
          placeholder="Enter amount"
          accessibilityLabel="Transaction amount"
        />
      </Card>

      <Card style={styles.card}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          Where?
        </ThemedText>
        <AccountPicker accounts={accounts} selectedId={accountId} onSelect={setAccountId} />
      </Card>

      <Card style={styles.card}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          What is it for?
        </ThemedText>
        <CategoryPicker categories={categories} selectedId={categoryId} onSelect={setCategoryId} />
      </Card>
      <Card style={styles.card}>
        <NoteField
          value={note}
          onChangeText={setNote}
          placeholder="e.g. vegetables, bus fare…"
          accessibilityLabel="Note"
          attachments={attachments}
          onChangeAttachments={setAttachments}
        />
      </Card>

      <Card style={styles.card}>
        <DatePicker
          label="Date"
          value={date}
          onChange={setDate}
          maxDate={todayISODate()}
          accessibilityLabel="Transaction date"
        />
      </Card>

      {editingId ? (
        <>
          <LargeButton
            title="Save Changes"
            variant={type}
            icon={Icon}
            onPress={handleSave}
            disabled={!canSave}
            height={68}
          />
          <LargeButton
            title="Delete Transaction"
            variant="danger"
            icon={Trash2}
            onPress={() =>
              confirmDelete('Delete transaction?', 'This cannot be undone.', () =>
                void handleDelete()
              )
            }
          />
        </>
      ) : (
        <>
          <LargeButton
            title={isIncome ? 'Save Deposit' : 'Save Withdraw'}
            variant={type}
            icon={Icon}
            onPress={handleSave}
            disabled={!canSave}
            height={68}
          />
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
  headerIcon: {
    width: 52,
    height: 52,
    borderRadius: Radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loading: {
    marginTop: Spacing.six,
    alignSelf: 'center',
  },
  card: {
    gap: Spacing.two,
  },
});