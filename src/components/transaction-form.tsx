/** Shared form for recording an expense or income entry. */
import { router } from 'expo-router';
import { Trash2, TrendingDown, TrendingUp } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AccountPicker } from '@/components/account-picker';
import { AmountInput } from '@/components/amount-input';
import { Card } from '@/components/card';
import { CategoryPicker } from '@/components/category-picker';
import { DatePicker } from '@/components/date-picker';
import { LargeButton } from '@/components/large-button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAccounts } from '@/hooks/use-accounts';
import { useCategories } from '@/hooks/use-categories';
import { useTheme } from '@/hooks/use-theme';
import {
  addTransaction,
  deleteTransaction,
  getTransaction,
  updateTransaction,
} from '@/db/transaction-repo';
import type { TransactionType } from '@/types';
import { confirmDelete } from '@/utils/confirm';
import { todayISODate } from '@/utils/format';

type TransactionFormProps = {
  type: TransactionType;
  /** When set, loads this transaction for editing instead of recording a new one. */
  editingId?: number;
};

export function TransactionForm({ type, editingId }: TransactionFormProps) {
  const theme = useTheme();
  const isIncome = type === 'income';

  const { accounts } = useAccounts();
  const { categories } = useCategories(type);

  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  // Date state - defaults to today for new entries, preserves original for edit
  const [date, setDate] = useState(todayISODate());
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
        setAccountId(row.accountId);
        setCategoryId(row.categoryId);
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
    ? `Edit ${isIncome ? 'Income' : 'Expense'}`
    : `Add ${isIncome ? 'Income' : 'Expense'}`;

  const canSave = amount !== '' && parseFloat(amount) > 0 && accountId !== null && categoryId !== null && !saving;

  const handleSave = async () => {
    const numeric = parseFloat(amount);
    if (!(numeric > 0) || accountId === null || categoryId === null) {
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

  const handleDelete = async () => {
    if (!editingId) {
      return;
    }
    setSaving(true);
    try {
      await deleteTransaction(editingId);
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
      <View style={styles.header}>
        <View style={[styles.headerIcon, { backgroundColor: isIncome ? theme.incomeSoft : theme.expenseSoft }]}>
          <Icon size={28} color={accent} />
        </View>
        <ThemedText type="subtitle" style={[styles.title, { color: accent }]}>
          {title}
        </ThemedText>
      </View>

      <Card style={styles.card}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          Amount
        </ThemedText>
        <AmountInput value={amount} onChangeText={setAmount} />
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
        <DatePicker
          label="Date"
          value={date}
          onChange={setDate}
          maxDate={todayISODate()}
          accessibilityLabel="Transaction date"
        />
      </Card>

      <Card style={styles.card}>
        <TextField
          label="Note (optional)"
          value={note}
          onChangeText={setNote}
          placeholder="e.g. vegetables, bus fare…"
          accessibilityLabel="Note"
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
            title={isIncome ? 'Save Income' : 'Save Expense'}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  headerIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
  },
  loading: {
    marginTop: Spacing.six,
    alignSelf: 'center',
  },
  card: {
    gap: Spacing.two,
  },
});