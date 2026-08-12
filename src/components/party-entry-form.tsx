/** Shared form for recording a khata entry (give/receive/take/pay). */
import { router } from 'expo-router';
import { Trash2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { CalculatorInput } from '@/components/calculator-input';
import { Card } from '@/components/card';
import { DatePicker } from '@/components/date-picker';
import { LargeButton } from '@/components/large-button';
import { NoteField } from '@/components/note-field';
import { Segment } from '@/components/segment';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  addPartyTransaction,
  deletePartyTransaction,
  getPartyTransaction,
  updatePartyTransaction,
} from '@/db/party-repo';
import type { AttachmentMeta, PartyAction, PartyType } from '@/types';
import { removeAttachmentFiles } from '@/utils/attachments';
import { confirmDelete } from '@/utils/confirm';
import { todayISODate } from '@/utils/format';
import { actionForDirection, PARTY_ACTIONS } from '@/utils/party';

type PartyEntryFormProps = {
  partyId: number;
  partyType: PartyType;
  /** Preselect an action (e.g. opened from the + button for Give Money). */
  initialAction?: PartyAction;
  /** When set, loads this khata entry for editing instead of recording a new one. */
  editingId?: number;
};

export function PartyEntryForm({
  partyId,
  partyType,
  initialAction,
  editingId,
}: PartyEntryFormProps) {
  const theme = useTheme();
  const actions: PartyAction[] = partyType === 'customer' ? ['give', 'receive'] : ['take', 'pay'];

  const startingAction =
    initialAction && actions.includes(initialAction) ? initialAction : actions[0];
  const [action, setAction] = useState<PartyAction>(startingAction);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [attachments, setAttachments] = useState<AttachmentMeta[]>([]);
  const [saving, setSaving] = useState(false);
  // Date state - defaults to today for new entries, preserves original for edit
  const [date, setDate] = useState(todayISODate());
  const [loading, setLoading] = useState(Boolean(editingId));

  // In edit mode, prefill the form from the existing entry.
  useEffect(() => {
    if (!editingId) {
      return;
    }
    let mounted = true;
    getPartyTransaction(editingId)
      .then((row) => {
        if (!mounted) {
          return;
        }
        if (!row) {
          router.back();
          return;
        }
        // Opening Balance entries are immutable — editing goes through the
        // party's dedicated Edit screen (the opening-balance workflow).
        if (row.kind === 'opening') {
          router.back();
          return;
        }
        setAction(actionForDirection(partyType, row.direction));
        setAmount(String(row.amount));
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
  }, [editingId, partyType]);

  const meta = PARTY_ACTIONS[action];
  const canSave = amount !== '' && parseFloat(amount) > 0 && !saving;

  const handleSave = async () => {
    const numeric = parseFloat(amount);
    if (!(numeric > 0)) {
      return;
    }
    setSaving(true);
    try {
      const input = {
        partyId,
        direction: meta.direction,
        amount: numeric,
        note: note.trim(),
        date,
        attachments,
      };
      if (editingId) {
        await updatePartyTransaction(editingId, input);
      } else {
        await addPartyTransaction(input);
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
      await deletePartyTransaction(editingId);
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
      <Segment
        options={actions.map((actionKey) => ({
          key: actionKey,
          label: PARTY_ACTIONS[actionKey].title,
        }))}
        value={action}
        onChange={(key) => setAction(key as PartyAction)}
      />

      <Card style={styles.card}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          Amount
        </ThemedText>
        <CalculatorInput
          onChangeAmount={(value) => setAmount(String(value))}
          placeholder="Enter amount"
          accessibilityLabel="Entry amount"
        />
      </Card>

      <Card style={styles.card}>
        <NoteField
          value={note}
          onChangeText={setNote}
          placeholder={meta.hint}
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
          accessibilityLabel="Entry date"
        />
      </Card>

      {editingId ? (
        <>
          <LargeButton
            title="Save Changes"
            variant={partyType === 'customer' ? 'income' : 'expense'}
            icon={meta.icon}
            onPress={handleSave}
            disabled={!canSave}
            height={64}
          />
          <LargeButton
            title="Delete Entry"
            variant="danger"
            icon={Trash2}
            onPress={() =>
              confirmDelete('Delete entry?', 'This cannot be undone.', () =>
                void handleDelete()
              )
            }
          />
        </>
      ) : (
        <>
          <LargeButton
            title={`Save ${meta.title}`}
            variant={partyType === 'customer' ? 'income' : 'expense'}
            icon={meta.icon}
            onPress={handleSave}
            disabled={!canSave}
            height={64}
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
  card: {
    gap: Spacing.two,
  },
  loading: {
    marginTop: Spacing.six,
    alignSelf: 'center',
  },
});
