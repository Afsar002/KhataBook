/**
 * Recurring templates list screen.
 */
import { router } from 'expo-router';
import { Plus, Calendar, Trash2, Edit, ToggleLeft, ToggleRight, Info } from 'lucide-react-native';
import { useEffect, useState, useCallback } from 'react';
import { StyleSheet, View, RefreshControl, Pressable, ScrollView } from 'react-native';

import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { feedback } from '@/components/feedback';
import { LargeButton } from '@/components/large-button';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { Spacing, Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { listRecurringTemplates, deleteRecurringTemplate, updateRecurringTemplate } from '@/db/recurring-repo';
import { generateTodaysEntries, catchUpMissedEntries } from '@/services/recurring/scheduler';
import type { RecurringTemplate, RecurringFrequency, RecurringTemplateType } from '@/types';

const FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

const TYPE_LABELS: Record<RecurringTemplateType, string> = {
  transaction: 'Transaction',
  party_transaction: 'Party Transaction',
};

const TRANSACTION_TYPE_LABELS = {
  income: 'Income',
  expense: 'Expense',
};

const PARTY_DIRECTION_LABELS = {
  in: 'In / Pay',
  out: 'Out / Take',
};

export default function RecurringTemplatesScreen() {
  const theme = useTheme();
  const [templates, setTemplates] = useState<RecurringTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listRecurringTemplates(false); // Show all, including inactive
      setTemplates(data);
    } catch (error) {
      feedback.toast({ message: 'Failed to load recurring templates', tone: 'error' });
      console.error('[RecurringTemplates] Load error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const handleRefresh = () => {
    loadTemplates();
  };

  const handleToggleActive = async (template: RecurringTemplate) => {
    try {
      await updateRecurringTemplate(template.id, { isActive: !template.isActive });
      loadTemplates();
    } catch {
      feedback.toast({ message: 'Failed to update template', tone: 'error' });
    }
  };

  const handleDelete = (template: RecurringTemplate) => {
    feedback.confirm({
      title: 'Delete template?',
      message: `This will stop future automatic entries for "${template.note || 'this template'}"`,
      danger: true,
      confirmLabel: 'Delete',
      onConfirm: async () => {
        try {
          await deleteRecurringTemplate(template.id);
          loadTemplates();
        } catch {
          feedback.toast({ message: 'Failed to delete template', tone: 'error' });
        }
      },
    });
  };

  const handleEdit = (template: RecurringTemplate) => {
    router.push({
      pathname: '/recurring/edit',
      params: { id: template.id.toString() },
    });
  };

  const handleGenerateToday = async () => {
    feedback.confirm({
      title: "Generate today's entries?",
      message: 'This will create entries for all active templates scheduled for today.',
      confirmLabel: 'Generate',
      onConfirm: async () => {
        try {
          const results = await generateTodaysEntries();
          const success = results.filter((r) => r.success).length;
          const failed = results.filter((r) => !r.success).length;
          feedback.toast({
            message: `Created ${success} entries${failed > 0 ? `, ${failed} failed` : ''}.`,
            tone: 'success',
          });
          loadTemplates();
        } catch {
          feedback.toast({ message: 'Failed to generate entries', tone: 'error' });
        }
      },
    });
  };

  const handleCatchUp = async () => {
    feedback.confirm({
      title: 'Catch up missed entries?',
      message:
        'This will generate entries for all missed dates from the earliest template up to today. This may create many entries.',
      confirmLabel: 'Catch Up',
      onConfirm: async () => {
        try {
          const results = await catchUpMissedEntries();
          const success = results.filter((r) => r.success).length;
          const failed = results.filter((r) => !r.success).length;
          feedback.toast({
            message: `Created ${success} entries${failed > 0 ? `, ${failed} failed` : ''}.`,
            tone: 'success',
          });
          loadTemplates();
        } catch {
          feedback.toast({ message: 'Failed to catch up entries', tone: 'error' });
        }
      },
    });
  };

  const renderTemplate = (template: RecurringTemplate) => {
    const isTransaction = template.templateType === 'transaction';
    const typeLabel = isTransaction
      ? TRANSACTION_TYPE_LABELS[template.type as keyof typeof TRANSACTION_TYPE_LABELS] ?? '—'
      : PARTY_DIRECTION_LABELS[template.direction as keyof typeof PARTY_DIRECTION_LABELS] ?? '—';

    return (
      <Card key={template.id} style={styles.card}>
        <View style={styles.row}>
          <View style={[styles.iconWrapper, { backgroundColor: theme.backgroundElement }]}>
            <Calendar size={22} color={template.isActive ? theme.income : theme.textSecondary} />
          </View>
          <View style={styles.info}>
            <View style={styles.headerRow}>
              <ThemedText type="default" numberOfLines={1}>
                {template.note || 'Unnamed template'}
              </ThemedText>
              <ThemedText
                type="small"
                themeColor="textSecondary"
                style={[styles.badge, { backgroundColor: theme.backgroundElement }]}>
                {TYPE_LABELS[template.templateType]}
              </ThemedText>
            </View>
            <View style={styles.detailsRow}>
              <ThemedText type="small" themeColor="textSecondary">
                {typeLabel} • {FREQUENCY_LABELS[template.frequency]}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {isTransaction ? `₹${template.amount.toLocaleString('en-IN')}` : `₹${template.amount.toLocaleString('en-IN')}`}
              </ThemedText>
            </View>
            <View style={styles.datesRow}>
              <ThemedText type="small" themeColor="textSecondary">
                From {template.startDate}
                {template.endDate ? ` to ${template.endDate}` : ' (no end)'}
              </ThemedText>
              {template.lastGeneratedDate && (
                <ThemedText type="small" themeColor="textSecondary">
                  Last: {template.lastGeneratedDate}
                </ThemedText>
              )}
            </View>
          </View>
          <View style={styles.actions}>
            <Pressable onPress={() => handleToggleActive(template)} style={styles.actionButton}>
              {template.isActive ? (
                <ToggleRight size={24} color={theme.income} />
              ) : (
                <ToggleLeft size={24} color={theme.textSecondary} />
              )}
            </Pressable>
            <Pressable onPress={() => handleEdit(template)} style={styles.actionButton}>
              <Edit size={22} color={theme.textSecondary} />
            </Pressable>
            <Pressable onPress={() => handleDelete(template)} style={styles.actionButton}>
              <Trash2 size={22} color={theme.expense} />
            </Pressable>
          </View>
        </View>
      </Card>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ThemedText type="default" themeColor="textSecondary">Loading templates…</ThemedText>
      </View>
    );
  }

  return (
    <Screen scroll={false}>
      <View style={styles.container}>
        <ScreenHeader title="Recurring Templates" subtitle="Automatic entries on schedule" />

        <View style={styles.toolbar}>
          <LargeButton
            title="Generate Today"
            subtitle="Run now"
            icon={Calendar}
            variant="outline"
            onPress={handleGenerateToday}
            height={44}
            style={styles.toolbarButton}
          />
          <LargeButton
            title="Catch Up"
            subtitle="Missed dates"
            icon={Info}
            variant="outline"
            onPress={handleCatchUp}
            height={44}
            style={styles.toolbarButton}
          />
        </View>

        <ScrollView
          style={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[theme.primary]} />
          }
        >
          {templates.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title="No recurring templates yet"
              message="Tap + to create your first template"
            />
          ) : (
            templates.map(renderTemplate)
          )}
        </ScrollView>

        <LargeButton
          title="Add Template"
          icon={Plus}
          variant="primary"
          onPress={() => router.push('/recurring/new')}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    padding: Spacing.three,
    gap: Spacing.three,
  },
  toolbar: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  toolbarButton: {
    flex: 1,
  },
  list: {
    flex: 1,
    gap: Spacing.two,
  },
  card: {
    padding: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  iconWrapper: {
    width: 40,
    height: 40,
    borderRadius: Radius.input,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    gap: Spacing.one,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Radius.chip,
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  datesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  actionButton: {
    padding: Spacing.one,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});