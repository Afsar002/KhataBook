/**
 * Khata tab — customer/supplier ledger: headline summary card, a
 * Customers/Suppliers toggle, and the party list with an add button.
 */
import { router, useFocusEffect } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { KhataSummaryCard } from '@/components/khata-summary-card';
import { PartyItem } from '@/components/party-item';
import { Screen } from '@/components/screen';
import { Segment } from '@/components/segment';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useKhataSummary } from '@/hooks/use-khata-summary';
import { useParties } from '@/hooks/use-parties';
import { useResponsiveLayout } from '@/hooks/use-responsive';
import { useTheme } from '@/hooks/use-theme';
import type { PartyBalance, PartyType } from '@/types';

export default function KhataScreen() {
  const theme = useTheme();
  const { contentMaxWidth } = useResponsiveLayout();
  const [type, setType] = useState<PartyType>('customer');
  const { parties, refresh } = useParties(type);
  const { summary, refresh: refreshSummary } = useKhataSummary();

  useFocusEffect(
    useCallback(() => {
      void refresh();
      void refreshSummary();
    }, [refresh, refreshSummary])
  );

  const addLabel = type === 'customer' ? 'Add Customer' : 'Add Supplier';

  const openParty = useCallback((item: PartyBalance) => {
    router.push({ pathname: '/party/[id]', params: { id: item.id } });
  }, []);

  // The tab bar already owns the bottom safe-area inset, so the bottom edge is
  // excluded here to avoid a blank gap above it.
  return (
    <Screen scroll={false} hasTabBar>
      <View style={[styles.column, { maxWidth: contentMaxWidth }]}>
        <View style={styles.header}>
          <ThemedText type="subtitle">Khata</ThemedText>
          <Pressable
            onPress={() => router.push({ pathname: '/party/new', params: { type } })}
            accessibilityRole="button"
            accessibilityLabel={addLabel}
            style={({ pressed }) => [
              styles.addButton,
              { backgroundColor: theme.primary },
              pressed && styles.pressed,
            ]}>
            <Plus size={24} color="#FFFFFF" />
          </Pressable>
        </View>

        <KhataSummaryCard summary={summary} />

        <Segment
          options={[
            { key: 'customer', label: 'Customers' },
            { key: 'supplier', label: 'Suppliers' },
          ]}
          value={type}
          onChange={(key) => setType(key as PartyType)}
        />

        <FlatList
          data={parties}
          keyExtractor={(item) => String(item.id)}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          style={styles.list}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={7}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => (
            <Card pad={false} style={styles.rowCard}>
              <PartyItem item={item} onPress={openParty} />
            </Card>
          )}
          ListEmptyComponent={
            <Card>
              <EmptyState
                type={type === 'customer' ? 'party' : 'store'}
                title="No people added yet"
                message="Tap + to add your first customer or supplier."
              />
            </Card>
          }
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  column: {
    flex: 1,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: Radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.85,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingTop: Spacing.two,
    paddingBottom: 0,
  },
  rowCard: {
    paddingHorizontal: Spacing.three,
  },
  separator: {
    height: Spacing.two,
  },
});
