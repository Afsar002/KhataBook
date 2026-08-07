/** Edit a party's details: name and phone. */
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';

import { Card } from '@/components/card';
import { ContactPickerButton } from '@/components/contact-picker-button';
import { LargeButton } from '@/components/large-button';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { getParty, updateParty } from '@/db/party-repo';

export default function EditPartyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const partyId = Number(id);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [opening, setOpening] = useState('');
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
        }
        setLoaded(true);
      });
    }, [loaded, partyId])
  );

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
      <ThemedText type="subtitle">Edit Party</ThemedText>

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
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.three,
  },
});
