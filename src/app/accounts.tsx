/** Accounts screen: Cash, then all banks & wallets, then Add Account. */
import { router, useFocusEffect } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useCallback } from 'react';
import { StyleSheet } from 'react-native';

import { AccountItem } from '@/components/account-item';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { LargeButton } from '@/components/large-button';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAccounts } from '@/hooks/use-accounts';
import type { AccountBalance } from '@/types';

export default function AccountsScreen() {
  const { balances, refresh } = useAccounts();

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const cash = balances.filter((b) => b.type === 'cash');
  const banks = balances.filter((b) => b.type === 'bank');
  const wallets = balances.filter((b) => b.type === 'wallet');

  const openAccount = (item: AccountBalance) =>
    router.push({ pathname: '/account/[id]', params: { id: item.id } });

  return (
    <Screen>
      <ScreenHeader title="Accounts" />

      {balances.length === 0 ? (
        <EmptyState
          type="accounts"
          title="No accounts yet"
          message="Tap “Add Account” to keep your money in Cash, Banks and Wallets."
        />
      ) : (
        <>
          {cash.length > 0 && (
            <Card>
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionLabel}>
                Cash
              </ThemedText>
              {cash.map((item) => (
                <AccountItem key={item.id} item={item} onPress={() => openAccount(item)} />
              ))}
            </Card>
          )}

          {(banks.length > 0 || wallets.length > 0) && (
            <Card>
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionLabel}>
                Banks & Wallets
              </ThemedText>
              {banks.map((item) => (
                <AccountItem key={item.id} item={item} onPress={() => openAccount(item)} />
              ))}
              {wallets.map((item) => (
                <AccountItem key={item.id} item={item} onPress={() => openAccount(item)} />
              ))}
            </Card>
          )}

          <LargeButton title="Add Account" icon={Plus} onPress={() => router.push('/account/new')} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    marginBottom: Spacing.one,
  },
});
