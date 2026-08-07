/** Pick a customer to give/receive money with (opened from the + button). */
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, HandCoins, Plus, Send, UserRound } from 'lucide-react-native';
import { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { LargeButton } from '@/components/large-button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { InterFonts, Spacing } from '@/constants/theme';
import { useParties } from '@/hooks/use-parties';
import { useTheme } from '@/hooks/use-theme';
import { formatINR } from '@/utils/format';

export default function PartyPickScreen() {
  const theme = useTheme();
  const { action } = useLocalSearchParams<{ action?: string }>();
  const partyAction: 'give' | 'receive' = action === 'give' ? 'give' : 'receive';

  const { parties, refresh } = useParties('customer');

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const isGive = partyAction === 'give';
  const title = isGive ? 'Give Money' : 'Receive Money';
  const ActionIcon = isGive ? Send : HandCoins;

  const openEntry = (partyId: number) =>
    router.push({ pathname: '/party/entry', params: { id: partyId, type: 'customer', action: partyAction } });

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.back}>
          <ChevronLeft size={28} color={theme.text} />
        </Pressable>
        <View style={styles.titleWrap}>
          <View style={[styles.titleIcon, { backgroundColor: theme.backgroundElement }]}>
            <ActionIcon size={20} color={theme.primary} />
          </View>
          <View>
            <ThemedText type="subtitle">{title}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Choose a customer
            </ThemedText>
          </View>
        </View>
      </View>

      {parties.length === 0 ? (
        <EmptyState
          icon={UserRound}
          title="No customers yet"
          message="Tap “Add Customer” to add your first customer, then give or receive money."
        />
      ) : (
        <Card pad={false}>
          {parties.map((party) => (
            <Pressable
              key={party.id}
              onPress={() => openEntry(party.id)}
              accessibilityRole="button"
              accessibilityLabel={party.name}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <View style={[styles.rowIcon, { backgroundColor: theme.backgroundElement }]}>
                <UserRound size={20} color={theme.text} />
              </View>
              <ThemedText style={styles.rowName} numberOfLines={1}>
                {party.name}
              </ThemedText>
              <ThemedText type="smallBold" themeColor="textSecondary">
                {formatINR(party.balance)}
              </ThemedText>
            </Pressable>
          ))}
        </Card>
      )}

      <LargeButton
        title="Add Customer"
        icon={Plus}
        onPress={() => router.push({ pathname: '/party/new', params: { type: 'customer' } })}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  back: {
    paddingVertical: Spacing.one,
    paddingRight: Spacing.two,
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  titleIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  pressed: {
    opacity: 0.6,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowName: {
    flex: 1,
    fontFamily: InterFonts.semibold,
    fontSize: 17,
  },
});
