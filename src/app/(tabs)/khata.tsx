import { router, useFocusEffect } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { KhataSummaryCard } from '@/components/khata-summary-card';
import { PartyItem } from '@/components/party-item';
import { Segment } from '@/components/segment';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useKhataSummary } from '@/hooks/use-khata-summary';
import { useParties } from '@/hooks/use-parties';
import { useTheme } from '@/hooks/use-theme';
import type { PartyBalance, PartyType } from '@/types';

export default function KhataScreen() {
  const theme = useTheme();
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

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.container}>
        <View style={styles.header}>
          <ThemedText type="subtitle">Khata</ThemedText>
          <Pressable
            onPress={() => router.push({ pathname: '/party/new', params: { type } })}
            accessibilityRole="button"
            accessibilityLabel={addLabel}
            style={[styles.addButton, { backgroundColor: theme.primary }]}>
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
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={7}
          ItemSeparatorComponent={() => (
            <View style={[styles.separator, { backgroundColor: theme.border }]} />
          )}
          renderItem={({ item }) => <PartyItem item={item} onPress={openParty} />}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  container: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
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
  listContent: {
    paddingTop: Spacing.two,
    paddingBottom: Spacing.seven,
  },
  separator: {
    height: 1,
    marginVertical: Spacing.one,
  },
});
