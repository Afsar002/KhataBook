/** Shared form for adding a new account (name, type). */
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { LargeButton } from '@/components/large-button';
import { Segment } from '@/components/segment';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAccounts } from '@/hooks/use-accounts';
import type { AccountType } from '@/types';

const TYPE_OPTIONS: { key: AccountType; label: string }[] = [
  { key: 'cash', label: 'Cash' },
  { key: 'bank', label: 'Bank' },
  { key: 'wallet', label: 'Wallet' },
];

export function AccountForm() {
  const { add } = useAccounts();

  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('bank');
  const [saving, setSaving] = useState(false);

  const canSave = name.trim().length > 0 && !saving;

  const handleSave = async () => {
    if (!canSave) {
      return;
    }
    setSaving(true);
    try {
      await add({
        name: name.trim(),
        type,
      });
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <ThemedText type="subtitle">Add Account</ThemedText>

      <Card>
        <TextField
          label="Account name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. SBI, HDFC, Paytm"
          accessibilityLabel="Account name"
          autoFocus
        />
      </Card>

      <Card>
        <ThemedText type="small" themeColor="textSecondary" style={styles.fieldLabel}>
          Account type
        </ThemedText>
        <Segment
          options={TYPE_OPTIONS}
          value={type}
          onChange={(key) => setType(key as AccountType)}
        />
      </Card>

      <LargeButton title="Save Account" onPress={handleSave} disabled={!canSave} />
      <LargeButton title="Cancel" variant="outline" onPress={() => router.back()} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.three,
  },
  fieldLabel: {
    marginBottom: Spacing.two,
  },
});
