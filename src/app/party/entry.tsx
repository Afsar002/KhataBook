import { useLocalSearchParams } from 'expo-router';

import { PartyEntryForm } from '@/components/party-entry-form';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { useParty } from '@/hooks/use-party';
import type { PartyAction, PartyType } from '@/types';

export default function PartyEntryScreen() {
  const { id, type, action, editId } = useLocalSearchParams<{
    id: string;
    type?: string;
    action?: string;
    editId?: string;
  }>();
  const partyId = Number(id);
  const partyType: PartyType = type === 'supplier' ? 'supplier' : 'customer';
  const initialAction: PartyAction | undefined =
    action === 'give' || action === 'receive' || action === 'take' || action === 'pay'
      ? action
      : undefined;
  const editingId = editId ? Number(editId) : undefined;

  const { party } = useParty(partyId);

  return (
    <Screen>
      <ScreenHeader title={editingId ? 'Edit entry' : 'Record entry'} subtitle={party?.name} />
      <PartyEntryForm
        partyId={partyId}
        partyType={partyType}
        initialAction={initialAction}
        editingId={editingId}
      />
    </Screen>
  );
}
