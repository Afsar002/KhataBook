import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { Card } from '@/components/card';
import { ContactPickerButton } from '@/components/contact-picker-button';
import { LargeButton } from '@/components/large-button';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useParties } from '@/hooks/use-parties';
import type { PartyType } from '@/types';

export default function NewPartyScreen() {
  const { type } = useLocalSearchParams<{ type?: string }>();
  const partyType: PartyType = type === 'supplier' ? 'supplier' : 'customer';
  const isCustomer = partyType === 'customer';

  const { add } = useParties(partyType);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  const canSave = name.trim().length > 0 && !saving;

  const handleSave = async () => {
    if (!canSave) {
      return;
    }
    setSaving(true);
    try {
      const id = await add({
        name: name.trim(),
        type: partyType,
        phone: phone.trim(),
      });
      router.replace({ pathname: '/party/[id]', params: { id } });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <ThemedText type="subtitle">{isCustomer ? 'Add Customer' : 'Add Supplier'}</ThemedText>

      <Card style={styles.card}>
        <TextField
          label="Name"
          value={name}
          onChangeText={setName}
          placeholder={isCustomer ? 'e.g. Ramesh Store' : 'e.g. Sharma Traders'}
          accessibilityLabel="Name"
          autoFocus
        />
        <TextField
          label="Phone (optional)"
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
        title={isCustomer ? 'Save Customer' : 'Save Supplier'}
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
