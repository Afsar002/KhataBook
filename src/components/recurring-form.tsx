/**
 * Recurring template form — the single source of truth for both the
 * "New Template" and "Edit Template" screens. Holds all form state,
 * validation, dependent-field resets and the schedule pickers.
 *
 * The screens stay thin: they pass initial values (edit), a title, and
 * an `onSubmit` that persists to the DB.
 */

import { router } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AccountPicker } from '@/components/account-picker';
import { AmountInput } from '@/components/amount-input';
import { Card } from '@/components/card';
import { CategoryPicker } from '@/components/category-picker';
import { feedback } from '@/components/feedback';
import { LargeButton } from '@/components/large-button';
import { PartyPicker } from '@/components/party-picker';
import { Segment } from '@/components/segment';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useAccounts } from '@/hooks/use-accounts';
import { useCategories } from '@/hooks/use-categories';
import { useParties } from '@/hooks/use-parties';
import { useTheme } from '@/hooks/use-theme';
import type {
  NewRecurringTemplate,
  PartyDirection,
  RecurringFrequency,
  RecurringTemplateType,
  TransactionType,
} from '@/types';
import { todayISODate } from '@/utils/format';
import { PARTY_ACTIONS } from '@/utils/party';

const FREQUENCY_OPTIONS: { key: RecurringFrequency; label: string; description: string }[] = [
  { key: 'daily', label: 'Daily', description: 'Every day' },
  { key: 'weekly', label: 'Weekly', description: 'Same day each week' },
  { key: 'monthly', label: 'Monthly', description: 'Same date each month' },
];

const TEMPLATE_TYPE_OPTIONS = [
  { key: 'transaction' as RecurringTemplateType, label: 'Transaction', description: 'Income or expense entry' },
  { key: 'party_transaction' as RecurringTemplateType, label: 'Party Transaction', description: 'Khata give/receive/take/pay' },
];

const WEEK_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface RecurringFormValues {
  templateType: RecurringTemplateType;
  type: TransactionType;
  amount: string;
  accountId: number | null;
  categoryId: number | null;
  partyId: number | null;
  direction: PartyDirection;
  note: string;
  frequency: RecurringFrequency;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

const DEFAULT_VALUES: RecurringFormValues = {
  templateType: 'transaction',
  type: 'expense',
  amount: '',
  accountId: null,
  categoryId: null,
  partyId: null,
  direction: 'out',
  note: '',
  frequency: 'monthly',
  dayOfWeek: null,
  dayOfMonth: null,
  startDate: todayISODate(),
  endDate: '',
  isActive: true,
};

export type RecurringFormPayload = NewRecurringTemplate & { isActive: boolean };

interface RecurringFormProps {
  title: string;
  saveLabel: string;
  /** Pre-fill the form (edit screen). Defaults are used when omitted. */
  initialValues?: Partial<RecurringFormValues>;
  /** Rendered above the save button (e.g. the delete action on edit). */
  footer?: React.ReactNode;
  /** Show the Active/Inactive status picker (edit screen only). */
  showStatus?: boolean;
  onSubmit: (payload: RecurringFormPayload) => Promise<void>;
}

export function RecurringForm({
  title,
  saveLabel,
  initialValues,
  footer,
  showStatus,
  onSubmit,
}: RecurringFormProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { accounts } = useAccounts();

  const init = { ...DEFAULT_VALUES, ...initialValues };

  // Form state — `type` is declared first so `useCategories` can filter by it.
  const [templateType, setTemplateType] = useState<RecurringTemplateType>(init.templateType);
  const [type, setType] = useState<TransactionType>(init.type);

  const { categories: allCategories } = useCategories(type);
  const { parties } = useParties();
  const [amount, setAmount] = useState(init.amount);
  const [accountId, setAccountId] = useState<number | null>(init.accountId);
  const [categoryId, setCategoryId] = useState<number | null>(init.categoryId);
  const [partyId, setPartyId] = useState<number | null>(init.partyId);
  const [direction, setDirection] = useState<PartyDirection>(init.direction);
  const [note, setNote] = useState(init.note);
  const [frequency, setFrequency] = useState<RecurringFrequency>(init.frequency);
  const [dayOfWeek, setDayOfWeek] = useState<number | null>(init.dayOfWeek);
  const [dayOfMonth, setDayOfMonth] = useState<number | null>(init.dayOfMonth);
  const [startDate, setStartDate] = useState(init.startDate);
  const [endDate, setEndDate] = useState(init.endDate);
  const [isActive, setIsActive] = useState(init.isActive);
  const [saving, setSaving] = useState(false);

  // Derived state
  const categories = allCategories.filter((c) => c.type === type);
  const isTransaction = templateType === 'transaction';
  const isPartyTransaction = templateType === 'party_transaction';
  const isWeekly = frequency === 'weekly';
  const isMonthly = frequency === 'monthly';

  const canSave =
    amount !== '' &&
    parseFloat(amount) > 0 &&
    (isTransaction ? accountId !== null && categoryId !== null : partyId !== null) &&
    (isWeekly ? dayOfWeek !== null : true) &&
    (isMonthly ? dayOfMonth !== null : true) &&
    !saving;

  // Default the pickers to the first option while nothing is selected.
  useEffect(() => {
    if (accountId === null && accounts.length > 0) {
      setAccountId(accounts[0].id);
    }
  }, [accounts, accountId]);

  useEffect(() => {
    if (categoryId === null && categories.length > 0) {
      setCategoryId(categories[0].id);
    }
  }, [categories, categoryId, type]);

  useEffect(() => {
    if (partyId === null && parties.length > 0) {
      setPartyId(parties[0].id);
    }
  }, [parties, partyId]);

  // Reset dependent fields when the template type changes.
  useEffect(() => {
    if (isTransaction) {
      setPartyId(null);
      setDirection('out');
    } else {
      setAccountId(null);
      setCategoryId(null);
      setType('expense');
    }
  }, [templateType, isTransaction]);

  // Reset schedule fields when the frequency changes.
  useEffect(() => {
    if (!isWeekly) setDayOfWeek(null);
    if (!isMonthly) setDayOfMonth(null);
  }, [frequency, isWeekly, isMonthly]);

  const handleSave = async () => {
    const numeric = parseFloat(amount);
    if (!(numeric > 0)) return;
    if (isTransaction && (accountId === null || categoryId === null)) return;
    if (isPartyTransaction && partyId === null) return;
    if (isWeekly && dayOfWeek === null) return;
    if (isMonthly && dayOfMonth === null) return;

    setSaving(true);
    try {
      await onSubmit({
        templateType,
        type: isTransaction ? type : undefined,
        amount: numeric,
        accountId: isTransaction ? accountId : undefined,
        categoryId: isTransaction ? categoryId : undefined,
        note: note.trim(),
        partyId: isPartyTransaction ? partyId : undefined,
        direction: isPartyTransaction ? direction : undefined,
        frequency,
        dayOfWeek: isWeekly ? dayOfWeek : undefined,
        dayOfMonth: isMonthly ? dayOfMonth : undefined,
        startDate,
        endDate: endDate || undefined,
        isActive,
      });
    } catch (error) {
      feedback.toast({
        message: error instanceof Error ? error.message : String(error),
        tone: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const frequencyDescription = (freq: RecurringFrequency) =>
    FREQUENCY_OPTIONS.find((o) => o.key === freq)?.description ?? '';

  const dayOfWeekLabel = (day: number) => WEEK_DAYS[day] ?? '';

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton} accessibilityLabel="Back">
          <ArrowLeft size={24} color={theme.text} />
        </Pressable>
        <ThemedText type="title" style={styles.title}>
          {title}
        </ThemedText>
        <View style={{ width: 44 }} />
      </View>

      {/* Template Type */}
      <Card style={styles.card}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          Template Type
        </ThemedText>
        <Segment
          options={TEMPLATE_TYPE_OPTIONS.map((o) => ({ key: o.key, label: o.label }))}
          value={templateType}
          onChange={(key) => setTemplateType(key as RecurringTemplateType)}
        />
      </Card>

      {/* Entry Type (transaction templates only) */}
      {isTransaction && (
        <Card style={styles.card}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            Entry Type
          </ThemedText>
          <Segment
            options={[
              { key: 'income' as TransactionType, label: 'Income' },
              { key: 'expense' as TransactionType, label: 'Expense' },
            ]}
            value={type}
            onChange={(key) => {
              setType(key as TransactionType);
              setCategoryId(null); // Reset category when type changes
            }}
          />
        </Card>
      )}

      {/* Amount */}
      <Card style={styles.card}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          Amount
        </ThemedText>
        <AmountInput value={amount} onChangeText={setAmount} />
      </Card>

      {/* Account & Category (transaction) or Party & Direction (party) */}
      {isTransaction ? (
        <>
          <Card style={styles.card}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              Account
            </ThemedText>
            <AccountPicker accounts={accounts} selectedId={accountId} onSelect={setAccountId} />
          </Card>

          <Card style={styles.card}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              Category
            </ThemedText>
            <CategoryPicker categories={categories} selectedId={categoryId} onSelect={setCategoryId} />
          </Card>
        </>
      ) : (
        <>
          <Card style={styles.card}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              Party
            </ThemedText>
            <PartyPicker parties={parties} selectedId={partyId} onSelect={setPartyId} />
          </Card>

          <Card style={styles.card}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              Direction
            </ThemedText>
            <Segment
              options={[
                { key: 'out' as PartyDirection, label: PARTY_ACTIONS.give.title },
                { key: 'in' as PartyDirection, label: PARTY_ACTIONS.receive.title },
              ]}
              value={direction}
              onChange={(key) => setDirection(key as PartyDirection)}
            />
          </Card>
        </>
      )}

      {/* Note */}
      <Card style={styles.card}>
        <TextField
          label="Note (optional)"
          value={note}
          onChangeText={setNote}
          placeholder="e.g. Rent, Salary, Tea money…"
        />
      </Card>

      {/* Frequency */}
      <Card style={styles.card}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          Frequency
        </ThemedText>
        <Segment
          options={FREQUENCY_OPTIONS.map((o) => ({ key: o.key, label: o.label }))}
          value={frequency}
          onChange={(key) => setFrequency(key as RecurringFrequency)}
        />
        <ThemedText type="small" themeColor="textSecondary" style={styles.helpText}>
          {frequencyDescription(frequency)}
        </ThemedText>

        {isWeekly && (
          <View style={styles.dayPicker}>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.pickerLabel}>
              Day of Week
            </ThemedText>
            <View style={styles.dayButtons}>
              {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                <Pressable
                  key={day}
                  onPress={() => setDayOfWeek(day)}
                  style={[styles.dayButton, dayOfWeek === day ? styles.dayButtonActive : null]}>
                  <ThemedText
                    type="smallBold"
                    themeColor={dayOfWeek === day ? 'background' : 'text'}>
                    {dayOfWeekLabel(day).slice(0, 3)}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {isMonthly && (
          <View style={styles.dayPicker}>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.pickerLabel}>
              Day of Month
            </ThemedText>
            <View style={styles.dayButtons}>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                <Pressable
                  key={day}
                  onPress={() => setDayOfMonth(day)}
                  style={[styles.dayButton, dayOfMonth === day ? styles.dayButtonActive : null]}>
                  <ThemedText
                    type="smallBold"
                    themeColor={dayOfMonth === day ? 'background' : 'text'}>
                    {day}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
            <ThemedText type="small" themeColor="textSecondary" style={styles.helpText}>
              Use 28-31 for end-of-month (will skip in shorter months)
            </ThemedText>
          </View>
        )}
      </Card>

      {/* Date Range */}
      <Card style={styles.card}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          Date Range
        </ThemedText>

        <View style={styles.dateRow}>
          <View style={styles.dateField}>
            <ThemedText type="small" themeColor="textSecondary">
              Start Date
            </ThemedText>
            <TextField
              value={startDate}
              onChangeText={setStartDate}
              placeholder="YYYY-MM-DD"
              keyboardType="numeric"
              maxLength={10}
            />
          </View>
          <View style={styles.dateField}>
            <ThemedText type="small" themeColor="textSecondary">
              End Date (optional)
            </ThemedText>
            <TextField
              value={endDate}
              onChangeText={setEndDate}
              placeholder="YYYY-MM-DD"
              keyboardType="numeric"
              maxLength={10}
            />
          </View>
        </View>
        <ThemedText type="small" themeColor="textSecondary" style={styles.helpText}>
          Leave end date empty for no end date
        </ThemedText>
      </Card>

      {/* Status (edit only) */}
      {showStatus && (
        <Card style={styles.card}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            Status
          </ThemedText>
          <Segment
            options={[
              { key: 'active', label: 'Active' },
              { key: 'inactive', label: 'Inactive' },
            ]}
            value={isActive ? 'active' : 'inactive'}
            onChange={(key) => setIsActive(key === 'active')}
          />
        </Card>
      )}

      {footer}

      <LargeButton
        title={saveLabel}
        variant="primary"
        onPress={handleSave}
        disabled={!canSave}
        style={styles.saveButton}
      />
      <View style={{ height: insets.bottom }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
    paddingBottom: Spacing.four + 60,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.two,
  },
  backButton: {
    padding: Spacing.one,
  },
  title: {
    textAlign: 'center',
    flex: 1,
  },
  card: {
    gap: Spacing.two,
  },
  helpText: {
    marginTop: Spacing.one,
  },
  dateRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  dateField: {
    flex: 1,
    gap: Spacing.one,
  },
  dayPicker: {
    marginTop: Spacing.two,
    gap: Spacing.one,
  },
  pickerLabel: {
    marginTop: Spacing.one,
  },
  dayButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  dayButton: {
    width: 40,
    height: 40,
    borderRadius: Radius.input,
    backgroundColor: 'rgba(0,0,0,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayButtonActive: {
    backgroundColor: '#16a34a', // Green for active
  },
  saveButton: {
    // Position handled by content paddingBottom
  },
});
