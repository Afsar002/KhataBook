import { useLocalSearchParams } from 'expo-router';

import { Screen } from '@/components/screen';
import { TransactionForm } from '@/components/transaction-form';

export default function ExpenseScreen() {
  const { editId, date } = useLocalSearchParams<{ editId?: string; date?: string }>();
  const editingId = editId ? Number(editId) : undefined;

  return (
    <Screen>
      <TransactionForm type="expense" editingId={editingId} defaultDate={date} />
    </Screen>
  );
}
