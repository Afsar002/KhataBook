/** Transfer money between accounts (modal). */
import { useLocalSearchParams } from 'expo-router';

import { Screen } from '@/components/screen';
import { TransferForm } from '@/components/transfer-form';

export default function TransferScreen() {
  const { editId } = useLocalSearchParams<{ editId?: string }>();
  const editingId = editId ? Number(editId) : undefined;

  return (
    <Screen>
      <TransferForm editingId={editingId} />
    </Screen>
  );
}
