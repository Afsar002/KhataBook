/** Edit a party's details: name and phone. Also hosts the destructive Delete. */
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Trash2 } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';

import { Card } from '@/components/card';
import { ContactPickerButton } from '@/components/contact-picker-button';
import { feedback } from '@/components/feedback';
import { LargeButton } from '@/components/large-button';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { TextField } from '@/components/text-field';
import { Spacing } from '@/constants/theme';
import { deleteParty, getParty, updateParty } from '@/db/party-repo';
import type { PartyType } from '@/types';
import { confirmDelete } from '@/utils/confirm';

export default function EditPartyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const partyId = Number(id);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [opening, setOpening] = useState('');
  const [partyType, setPartyType] = useState<PartyType>('customer');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (loaded) {
        return;
      }
      void getParty(partyId).then((party) => {
        if (party) {
          setName(party.name);
          setPhone(party.phone);
          setOpening(party.openingBalance ? String(party.openingBalance) : '');
          setPartyType(party.type);
        }
        setLoaded(true);
      });
    }, [loaded, partyId])
  );

  const handleDelete = () => {
    confirmDelete(
      `Delete ${partyType === 'customer' ? 'Customer' : 'Supplier'}?`,
      'This will also delete all its khata entries.',
      async () => {
        try {
          await deleteParty(partyId);
        } catch {
          feedback.alert({
            title: "Can't delete",
            message: 'Something went wrong. Please try again.',
            tone: 'danger',
          });
          return;
        }
        // Pop this edit modal and the now-deleted party detail screen in one
        // step, landing back on the Khata tab (plain back() would stop on the
        // deleted detail screen).
        router.dismiss(2);
      }
    );
  };

  const canSave = name.trim().length > 0 && loaded && !saving;

  const handleSave = async () => {
    if (!canSave) {
      return;
    }
    setSaving(true);
    try {
      await updateParty(partyId, {
        name: name.trim(),
        phone: phone.trim(),
        openingBalance: opening ? parseFloat(opening) : 0,
      });
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader title="Edit Party" />

      <Card style={styles.card}>
        <TextField
          label="Name"
          value={name}
          onChangeText={setName}
          placeholder="Party name"
          accessibilityLabel="Name"
          autoFocus
        />
        <TextField
          label="Phone"
          value={phone}
          onChangeText={setPhone}
          placeholder="Mobile number"
          accessibilityLabel="Phone"
          keyboardType="phone-pad"
        />
        <ContactPickerButton
          onPicked={(pickedName, pickedPhone) => {
            if (pickedName) {
              setName(pickedName);
            }
            if (pickedPhone) {
              setPhone(pickedPhone);
            }
          }}
        />
      </Card>

      <LargeButton
        title="Save Changes"
        variant="primary"
        onPress={handleSave}
        disabled={!canSave}
        height={64}
      />
      <LargeButton title="Cancel" variant="outline" onPress={() => router.back()} />
      <LargeButton
        title={`Delete ${partyType === 'customer' ? 'Customer' : 'Supplier'}`}
        variant="expense"
        icon={Trash2}
        onPress={handleDelete}
        disabled={!loaded}
        style={styles.deleteButton}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.three,
  },
  deleteButton: {
    marginTop: Spacing.three,
  },
});
